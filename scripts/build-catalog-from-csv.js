#!/usr/bin/env node
/**
 * build-catalog-from-csv.js
 *
 * Rebuilds metadata-catalog.yaml from a ck_metadata CSV dump.
 * Every unique (domain_name, domain_type) pair in the CSV becomes a catalog entry.
 * Rows with NULL / numeric-only domain names or types are skipped.
 *
 * Usage:
 *   node scripts/build-catalog-from-csv.js <path-to-csv>
 *   node scripts/build-catalog-from-csv.js /path/to/Metadata.csv
 */

const fs   = require('fs');
const path = require('path');
const yaml = require(path.join(__dirname, '../server/node_modules/js-yaml'));

// CATALOG_PATH is determined from --lobid argument below

// ── Feature classifier (same rules as sync-catalog.js) ──────────────────────
const FEATURE_RULES = [
  { test: (dn, dt) => dn === 'supportedValues' && /GRN|[Gg]rn/.test(dt),                    feature: 'GRN / Stock Inward',         severity: 'critical' },
  { test: (dn, dt) => dn === 'supportedValues' && /Return|return/.test(dt),                  feature: 'Sales Returns',              severity: 'high'     },
  { test: (dn, dt) => dn === 'supportedValues' && /Loadout|[Vv]an/.test(dt),                 feature: 'Order Loadout',              severity: 'high'     },
  { test: (dn, dt) => dn === 'supportedValues' && /Invoice|DMS|[Ss]ales[Ss]tatus/.test(dt),  feature: 'DMS Invoice / Sales Sync',   severity: 'critical' },
  { test: (dn, dt) => dn === 'supportedValues' && /Order|[Ss]tock|[Dd]educt/.test(dt),       feature: 'Order Placement',            severity: 'critical' },
  { test: (dn, dt) => dn === 'supportedValues' && /Entity|[Ee]nrich/.test(dt),               feature: 'Entity Enrichments',         severity: 'high'     },
  { test: (dn, dt) => dn === 'supportedValues',                                               feature: 'Saga Configuration',         severity: 'high'     },

  { test: (dn) => /^(order|Order|orderget|orderPurchase|orderAmountCompare|OrderValidation|TriggerPrice)/.test(dn), feature: 'Order Placement', severity: 'critical' },
  { test: (dn) => /GRN|[Gg]rn/.test(dn),                                                     feature: 'GRN / Stock Inward',         severity: 'critical' },
  { test: (dn) => /^(sales|Sales)$/.test(dn),                                                 feature: 'DMS Invoice / Sales Sync',   severity: 'critical' },
  { test: (dn) => /^(Tax|tax)$/.test(dn),                                                     feature: 'Order Placement',            severity: 'critical' },
  { test: (dn) => /^clientconfig$/.test(dn),                                                  feature: 'DMS Portal Configuration',   severity: 'high'     },
  { test: (dn) => /^stockConfig|^Stock$/.test(dn),                                            feature: 'Stock Management',           severity: 'medium'   },
  { test: (dn) => /^(collection|creditNote|debitNote)$/.test(dn),                             feature: 'Collection / Payments',      severity: 'medium'   },
  { test: (dn) => /^(target_achieved|TargetResults|Targets)$/.test(dn),                       feature: 'Target Achievement',         severity: 'low'      },
  { test: (dn) => /^(outlet|config|location)$/.test(dn),                                      feature: 'Outlet Registration',        severity: 'low'      },
  { test: (dn) => /^(ProductMetaData|SFAProduct|catalogue|Catalogue)/.test(dn),               feature: 'Catalogue',                  severity: 'medium'   },
  { test: (dn) => /^(OutletDetails|User|Stock|GenericEntity|MultiEntitySheet)$/.test(dn),     feature: 'Entity Enrichments',         severity: 'high'     },
  { test: (dn) => /[Nn]otif|[Ee]mail|[Ss]ms|[Bb]ot/.test(dn),                               feature: 'Notifications',              severity: 'low'      },
  { test: (dn) => /[Rr]eport|[Aa]nalytics/.test(dn),                                          feature: 'Reporting',                  severity: 'low'      },
  { test: (dn) => /[Pp]ayment|[Uu]pi|[Hh]dfc|[Ss]bi/.test(dn),                              feature: 'Collection / Payments',      severity: 'medium'   },
  { test: (dn) => /[Ss]cheme|[Pp]romo|schemeIdentifier/.test(dn),                             feature: 'Schemes',                    severity: 'medium'   },
  { test: (dn) => /[Ss]ecurity|[Pp]assword|[Jj]wt|[Aa]uth|claims|otpverify/.test(dn),       feature: 'Authentication',             severity: 'high'     },
  { test: (dn) => /[Ll]oyalty|[Rr]edemption/.test(dn),                                        feature: 'Loyalty',                    severity: 'low'      },
  { test: (dn) => /[Cc]alendar|[Bb]usiness/.test(dn),                                         feature: 'Business Calendar',          severity: 'low'      },
  { test: (dn) => /^(DeliveryPJP|RouteInfo|filters|filters2|uiconfig|templates|mdm)$/.test(dn), feature: 'DMS Portal Configuration', severity: 'high'    },
  { test: (dn) => /^(splitkeys|batchcodekeys)$/.test(dn),                                     feature: 'Stock Management',           severity: 'medium'   },
  { test: (dn) => /^(ResourceAccessToken|client|jenkins)$/.test(dn),                          feature: 'Authentication',             severity: 'high'     },
  { test: (dn) => /^(FavoriteSku|OutletProductInfo|outletproductinfo|productdetails|SFAProductDetails)$/.test(dn), feature: 'Catalogue', severity: 'medium' },
  { test: (dn) => /^(NewApprovalFlow|couponPortal|userInfoExtAttr)$/.test(dn),                feature: 'DMS Portal Configuration',   severity: 'high'     },
  { test: (dn) => /^(SalesDetails|OrderDetails|StockHistory)$/.test(dn),                      feature: 'Reporting',                  severity: 'low'      },
];

function classify(domainName, domainType) {
  for (const rule of FEATURE_RULES) {
    if (rule.test(domainName, domainType || '')) {
      return { feature: rule.feature, severity: rule.severity };
    }
  }
  return { feature: 'Uncategorized', severity: 'medium' };
}

// ── CSV parser — delegates to Python which handles unescaped quotes in JSON cols ─
function parseCsv(filePath, { lob = null, activeOnly = true } = {}) {
  const { execFileSync } = require('child_process');
  const helperPath = path.join(__dirname, '_csv_helper.py');
  fs.writeFileSync(helperPath,
    'import csv,json,sys\n' +
    'lob_filter=sys.argv[2] if len(sys.argv)>2 and sys.argv[2]!="null" else None\n' +
    'active_only=sys.argv[3]=="true" if len(sys.argv)>3 else True\n' +
    'rows=list(csv.DictReader(open(sys.argv[1])))\n' +
    'if lob_filter: rows=[r for r in rows if r.get("lob")==lob_filter]\n' +
    'if active_only: rows=[r for r in rows if r.get("active_status")=="active"]\n' +
    'out=[]\n' +
    'for r in rows:\n' +
    '  dv=r.get("domain_values","") or ""\n' +
    '  try: dv=json.loads(dv)\n' +
    '  except: dv=None\n' +
    '  out.append({"domain_name":r["domain_name"],"domain_type":r["domain_type"],"domain_values":dv})\n' +
    'print(json.dumps(out))\n'
  );
  const out = execFileSync('python3', [helperPath, filePath, lob || 'null', activeOnly ? 'true' : 'false'], { encoding: 'utf8' });
  fs.unlinkSync(helperPath);
  return JSON.parse(out);
}

function isValid(val) {
  if (!val || val === 'NULL') return false;
  if (/^\d+$/.test(val)) return false; // purely numeric
  return true;
}

// ── Main ─────────────────────────────────────────────────────────────────────
const csvPath = process.argv[2];
if (!csvPath) {
  console.error('Usage: node scripts/build-catalog-from-csv.js <path-to-csv> --lobid <lobId> [--lob <lobCol>] [--all-lobs] [--include-inactive]');
  process.exit(1);
}

const lobidArg = process.argv.indexOf('--lobid');
const lobId    = lobidArg >= 0 ? process.argv[lobidArg + 1] : null;
if (!lobId) {
  console.error('Error: --lobid <lobId> is required (e.g. --lobid hfcoedemo)');
  process.exit(1);
}

const CATALOG_PATH = path.join(__dirname, '../catalog', `${lobId}-catalog.yaml`);

const lobArg   = process.argv.indexOf('--lob');
const lob      = lobArg >= 0 ? process.argv[lobArg + 1] : (process.argv.includes('--all-lobs') ? null : null);
const activeOnly = !process.argv.includes('--include-inactive');

console.log(`LOB ID: ${lobId}  Filters: lob_col=${lob || '(all)'}  active_only=${activeOnly}`);
const rows = parseCsv(csvPath, { lob, activeOnly });
console.log(`Parsed ${rows.length} rows from CSV`);

// Collect unique valid pairs
const seen = new Set();
const pairs = [];
let skipped = 0;

for (const row of rows) {
  const dn = row['domain_name'];
  const dt = row['domain_type'];
  if (!isValid(dn) || !isValid(dt)) { skipped++; continue; }
  const key = `${dn}::${dt}`;
  if (!seen.has(key)) {
    seen.add(key);
    pairs.push({ domainName: dn, domainType: dt, expectedValue: row['domain_values'] ?? null });
  }
}

console.log(`Valid unique pairs: ${pairs.length}  (skipped ${skipped} invalid rows)`);

// Group by feature
const byFeature = new Map();
for (const { domainName, domainType } of pairs) {
  const { feature, severity } = classify(domainName, domainType);
  if (!byFeature.has(feature)) byFeature.set(feature, { severity, entries: [] });
  byFeature.get(feature).entries.push({ domainName, domainType });
}

// Sort features: critical first, then high, medium, low, uncategorized last
const ORDER = { critical: 0, high: 1, medium: 2, low: 3 };
const features = [...byFeature.entries()]
  .sort(([nameA, a], [nameB, b]) => {
    if (a.severity === 'uncategorized' || nameA === 'Uncategorized') return 1;
    if (b.severity === 'uncategorized' || nameB === 'Uncategorized') return -1;
    return (ORDER[a.severity] ?? 9) - (ORDER[b.severity] ?? 9);
  })
  .map(([name, { severity, entries }]) => ({
    name,
    severity,
    entries: entries.map(({ domainName, domainType, expectedValue }) => ({
      domainName,
      domainType,
      description: '',
      ...(expectedValue !== null ? { expectedValue } : {}),
    })),
  }));

console.log('\nFeature breakdown:');
for (const f of features) {
  console.log(`  [${f.severity}] ${f.name}: ${f.entries.length} entries`);
}

const catalog = { features };
fs.writeFileSync(CATALOG_PATH, yaml.dump(catalog, { lineWidth: 120, quotingType: '"' }));
console.log(`\nCatalog written to ${CATALOG_PATH}`);
console.log(`Total: ${pairs.length} entries across ${features.length} features`);
console.log(`\nNext step: restart the server. The catalog will auto-load when health is checked for LOB "${lobId}".`);
