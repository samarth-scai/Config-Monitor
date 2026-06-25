#!/usr/bin/env node
/**
 * sync-catalog.js
 *
 * Scans the channelkart Java source for all metaDataService.fetchByValue() and
 * fetchByDomainName() call sites, extracts every (domainName, domainType) pair
 * that can be statically resolved, and updates metadata-catalog.yaml with any
 * entries that are not yet cataloged.
 *
 * Handles:
 *   fetchByValue("name", "type")            — both string literals
 *   fetchByValue("name", "type", cached)    — with boolean 3rd arg
 *   fetchByValue(CONST_A, CONST_B)          — static final String constants
 *   fetchByValue(lobExpr, "name", "type")   — 3-arg LOB version
 *   fetchByDomainName("name")               — domain-only lookup (no type)
 *
 * Usage:
 *   node scripts/sync-catalog.js             # scan + update catalog
 *   node scripts/sync-catalog.js --dry-run   # scan only, print diff, no write
 */

const fs   = require('fs');
const path = require('path');
// Resolve js-yaml from the server's node_modules
const yaml = require(path.join(__dirname, '../server/node_modules/js-yaml'));

// ── Config ──────────────────────────────────────────────────────────────────

const args           = process.argv.slice(2);
const DRY_RUN        = args.includes('--dry-run');
const srcArgIdx      = args.indexOf('--channelkart-src');
const CHANNELKART_SRC = srcArgIdx >= 0
  ? args[srcArgIdx + 1]
  : path.join(__dirname, '../../channelkart/src/main/java');
const CATALOG_PATH   = path.join(__dirname, '../catalog/metadata-catalog.yaml');

// ── Feature classifier ───────────────────────────────────────────────────────
// Rules are evaluated top-to-bottom; first match wins.

const FEATURE_RULES = [
  // supportedValues — classify by domainType content
  { test: (dn, dt) => dn === 'supportedValues' && /GRN|[Gg]rn/.test(dt),                                     feature: 'GRN / Stock Inward',         severity: 'critical' },
  { test: (dn, dt) => dn === 'supportedValues' && /Return|return/.test(dt),                                   feature: 'Sales Returns',              severity: 'high'     },
  { test: (dn, dt) => dn === 'supportedValues' && /Loadout|[Vv]an/.test(dt),                                  feature: 'Order Loadout',              severity: 'high'     },
  { test: (dn, dt) => dn === 'supportedValues' && /Invoice|DMS|[Ss]ales[Ss]tatus/.test(dt),                   feature: 'DMS Invoice / Sales Sync',   severity: 'critical' },
  { test: (dn, dt) => dn === 'supportedValues' && /Order|[Ss]tock|[Dd]educt/.test(dt),                        feature: 'Order Placement',            severity: 'critical' },
  { test: (dn, dt) => dn === 'supportedValues' && /Entity|[Ee]nrich/.test(dt),                                feature: 'Entity Enrichments',         severity: 'high'     },
  { test: (dn, dt) => dn === 'supportedValues',                                                                feature: 'Saga Configuration',         severity: 'high'     },

  // domainName-based
  { test: (dn)     => /^(order|Order|orderget|orderPurchase|orderAmountCompare|OrderValidation|TriggerPrice)/.test(dn), feature: 'Order Placement',  severity: 'critical' },
  { test: (dn)     => /GRN|[Gg]rn/.test(dn),                                                                  feature: 'GRN / Stock Inward',         severity: 'critical' },
  { test: (dn)     => /^(sales|Sales)$/.test(dn),                                                              feature: 'DMS Invoice / Sales Sync',   severity: 'critical' },
  { test: (dn)     => /^(Tax|tax)$/.test(dn),                                                                  feature: 'Order Placement',            severity: 'critical' },
  { test: (dn)     => /^clientconfig$/.test(dn),                                                               feature: 'DMS Portal Configuration',   severity: 'high'     },
  { test: (dn)     => /^stockConfig|^Stock$/.test(dn),                                                         feature: 'Stock Management',           severity: 'medium'   },
  { test: (dn)     => /^(collection|creditNote|debitNote)$/.test(dn),                                          feature: 'Collection / Payments',      severity: 'medium'   },
  { test: (dn)     => /^(target_achieved|TargetResults)$/.test(dn),                                            feature: 'Target Achievement',         severity: 'low'      },
  { test: (dn)     => /^(outlet|config|location)$/.test(dn),                                                   feature: 'Outlet Registration',        severity: 'low'      },
  { test: (dn)     => /^(ProductMetaData|SFAProduct|catalogue|Catalogue)/.test(dn),                            feature: 'Catalogue',                  severity: 'medium'   },
  { test: (dn)     => /^(OutletDetails|User|Stock)$/.test(dn),                                                 feature: 'Entity Enrichments',         severity: 'high'     },
  { test: (dn)     => /[Nn]otif|[Ee]mail|[Ss]ms|[Bb]ot/.test(dn),                                            feature: 'Notifications',              severity: 'low'      },
  { test: (dn)     => /[Rr]eport|[Aa]nalytics/.test(dn),                                                      feature: 'Reporting',                  severity: 'low'      },
  { test: (dn)     => /[Pp]ayment|[Uu]pi|[Hh]dfc|[Ss]bi/.test(dn),                                          feature: 'Collection / Payments',      severity: 'medium'   },
  { test: (dn)     => /[Ss]cheme|[Pp]romo/.test(dn),                                                          feature: 'Schemes',                    severity: 'medium'   },
  { test: (dn)     => /[Ss]ecurity|[Pp]assword|[Jj]wt|[Aa]uth/.test(dn),                                    feature: 'Authentication',             severity: 'high'     },
  { test: (dn)     => /[Ll]oyalty|[Rr]edemption/.test(dn),                                                    feature: 'Loyalty',                    severity: 'low'      },
  { test: (dn)     => /[Cc]alendar|[Bb]usiness/.test(dn),                                                     feature: 'Business Calendar',          severity: 'low'      },
];

function classify(domainName, domainType) {
  for (const rule of FEATURE_RULES) {
    if (rule.test(domainName, domainType || '')) {
      return { feature: rule.feature, severity: rule.severity };
    }
  }
  return { feature: 'Uncategorized', severity: 'medium' };
}

// ── Java source parsing ──────────────────────────────────────────────────────

function walkJava(dir, results = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkJava(full, results);
    else if (entry.name.endsWith('.java') && !full.includes('/test/')) results.push(full);
  }
  return results;
}

function stripComments(src) {
  return src
    .replace(/\/\/[^\n]*/g, ' ')
    .replace(/\/\*[\s\S]*?\*\//g, ' ');
}

function extractConstants(src) {
  const map = {};
  // static final String FOO = "bar";
  const re = /static\s+final\s+String\s+(\w+)\s*=\s*"([^"]+)"\s*;/g;
  let m;
  while ((m = re.exec(src)) !== null) map[m[1]] = m[2];
  return map;
}

// Split top-level comma-separated args (doesn't split inside nested parens)
function splitArgs(raw) {
  const parts = [];
  let depth = 0, cur = '';
  for (const ch of raw) {
    if ('([{'.includes(ch)) depth++;
    else if (')]}'.includes(ch)) depth--;
    else if (ch === ',' && depth === 0) { parts.push(cur.trim()); cur = ''; continue; }
    cur += ch;
  }
  if (cur.trim()) parts.push(cur.trim());
  return parts;
}

function resolveArg(arg, constants) {
  if (!arg) return null;
  arg = arg.trim();
  // String literal
  if (/^"[^"]*"$/.test(arg)) return arg.slice(1, -1);
  // Known constant
  if (constants[arg]) return constants[arg];
  // String concat with literal at start: "prefix" + something  → skip (dynamic)
  return null;
}

function parseFile(filePath) {
  const src = stripComments(fs.readFileSync(filePath, 'utf8'));
  const constants = extractConstants(src);
  // Collapse whitespace so multi-line calls become single-line
  const flat = src.replace(/\s+/g, ' ');

  const found = []; // { domainName, domainType, calledFrom }
  const calledFrom = path.basename(filePath, '.java');

  // ── fetchByValue calls ───────────────────────────────────────────────────
  // Match .fetchByValue( <args> )   — greedy up to first unmatched )
  const re = /\.fetchByValue\s*\(\s*([^;]{1,300}?)\s*\)(?:\s*[;,.])/g;
  let m;
  while ((m = re.exec(flat)) !== null) {
    const parts = splitArgs(m[1]);
    if (parts.length < 2) continue;

    const first  = resolveArg(parts[0], constants);
    const second = resolveArg(parts[1], constants);

    if (first && second) {
      // 2-arg form: fetchByValue(domainName, domainType[, cached])
      found.push({ domainName: first, domainType: second, calledFrom });
    } else if (!first && parts.length >= 3) {
      // 3-arg form: fetchByValue(lobExpr, domainName, domainType[, cached])
      const dn = resolveArg(parts[1], constants);
      const dt = resolveArg(parts[2], constants);
      if (dn && dt) found.push({ domainName: dn, domainType: dt, calledFrom });
    }
  }

  // ── fetchByDomainName calls ──────────────────────────────────────────────
  const re2 = /\.fetchByDomainName\s*\(\s*([^)]{1,200}?)\s*\)/g;
  while ((m = re2.exec(flat)) !== null) {
    const dn = resolveArg(m[1].trim(), constants);
    if (dn) found.push({ domainName: dn, domainType: null, calledFrom });
  }

  return found;
}

// ── Catalog helpers ──────────────────────────────────────────────────────────

function loadCatalog() {
  return yaml.load(fs.readFileSync(CATALOG_PATH, 'utf8'));
}

function buildCatalogIndex(catalog) {
  const index = new Set();
  for (const feature of catalog.features) {
    for (const entry of feature.entries) {
      index.add(`${entry.domainName}::${entry.domainType ?? '*'}`);
    }
  }
  return index;
}

function saveCatalog(catalog) {
  fs.writeFileSync(CATALOG_PATH, yaml.dump(catalog, { lineWidth: 120, quotingType: '"' }));
}

// ── Main ─────────────────────────────────────────────────────────────────────

function syncCatalog({ dryRun = false, channelkartSrc = CHANNELKART_SRC } = {}) {
  const log = (...a) => console.log(...a);

  if (!fs.existsSync(channelkartSrc)) {
    throw new Error(`channelkart source not found at: ${channelkartSrc}`);
  }

  log(`\nScanning: ${channelkartSrc}`);
  const javaFiles = walkJava(channelkartSrc);
  log(`Found ${javaFiles.length} Java source files\n`);

  // Collect all call sites
  const allCalls = [];
  for (const file of javaFiles) {
    try {
      allCalls.push(...parseFile(file));
    } catch { /* skip unreadable files */ }
  }

  // Deduplicate: for each unique (domainName, domainType) collect callers
  const uniqueMap = new Map();
  for (const c of allCalls) {
    const key = `${c.domainName}::${c.domainType ?? '*'}`;
    if (!uniqueMap.has(key)) {
      uniqueMap.set(key, { domainName: c.domainName, domainType: c.domainType, callers: new Set() });
    }
    uniqueMap.get(key).callers.add(c.calledFrom);
  }

  log(`Extracted ${uniqueMap.size} unique (domainName, domainType) pairs from source\n`);

  // Load catalog and find what's missing
  const catalog = loadCatalog();
  const index   = buildCatalogIndex(catalog);

  const newEntries   = [];
  const knownEntries = [];

  for (const [key, info] of uniqueMap.entries()) {
    if (index.has(key)) {
      knownEntries.push(info);
    } else {
      newEntries.push(info);
    }
  }

  log(`Already in catalog : ${knownEntries.length}`);
  log(`New (not cataloged): ${newEntries.length}\n`);

  if (newEntries.length === 0) {
    log('Catalog is up to date. Nothing to add.');
    return { added: 0, total: uniqueMap.size, newEntries: [] };
  }

  // Group new entries by feature
  const byFeature = new Map();
  for (const e of newEntries) {
    const { feature, severity } = classify(e.domainName, e.domainType);
    if (!byFeature.has(feature)) byFeature.set(feature, { severity, entries: [] });
    byFeature.get(feature).entries.push(e);
  }

  log('New entries by feature:');
  for (const [feature, { entries }] of byFeature.entries()) {
    log(`  ${feature} (${entries.length}):`);
    for (const e of entries) {
      const dt = e.domainType ?? '(domainName-only call)';
      log(`    + ${e.domainName} / ${dt}   [from: ${[...e.callers].join(', ')}]`);
    }
  }

  if (dryRun) {
    log('\n--dry-run: catalog NOT updated.');
    return { added: newEntries.length, total: uniqueMap.size, newEntries };
  }

  // Merge into catalog: add to existing feature groups or create new ones
  const featureMap = new Map(catalog.features.map(f => [f.name, f]));

  for (const [featureName, { severity, entries }] of byFeature.entries()) {
    if (!featureMap.has(featureName)) {
      const newFeature = { name: featureName, description: `Auto-discovered feature`, severity, entries: [] };
      catalog.features.push(newFeature);
      featureMap.set(featureName, newFeature);
    }
    const feature = featureMap.get(featureName);
    for (const e of entries) {
      const callerList = [...e.callers].join(', ');
      feature.entries.push({
        domainName:  e.domainName,
        domainType:  e.domainType ?? null,
        description: `Auto-discovered from: ${callerList}`,
        optional:    true,
        autoDiscovered: true,
      });
    }
  }

  saveCatalog(catalog);
  log(`\nCatalog updated: +${newEntries.length} entries added to ${CATALOG_PATH}`);

  return { added: newEntries.length, total: uniqueMap.size, newEntries };
}

// ── CLI entry ────────────────────────────────────────────────────────────────

if (require.main === module) {
  try {
    syncCatalog({ dryRun: DRY_RUN, channelkartSrc: CHANNELKART_SRC });
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

module.exports = { syncCatalog };
