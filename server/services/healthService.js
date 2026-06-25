const catalogService   = require('./catalogService');
const dbService        = require('./dbService');
const snapshotService  = require('./snapshotService');

function sortDeep(v) {
  if (Array.isArray(v)) return v.map(sortDeep);
  if (v && typeof v === 'object') {
    return Object.keys(v).sort().reduce((a, k) => { a[k] = sortDeep(v[k]); return a; }, {});
  }
  return v;
}

function valuesMatch(a, b) {
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;
  return JSON.stringify(sortDeep(a)) === JSON.stringify(sortDeep(b));
}

async function checkLob(envId, lobId) {
  const startMs = Date.now();
  let rows;
  try {
    rows = await dbService.fetchAllMetadata(envId, lobId);
  } catch (err) {
    return {
      envId,
      lobId,
      status: 'unreachable',
      error: err.message,
      checkedAt: new Date().toISOString(),
    };
  }

  const existingMap = {};
  rows.forEach(r => {
    const key = `${r.domain_name}::${r.domain_type}`;
    let parsedValue = r.domain_values;
    if (typeof parsedValue === 'string') {
      try { parsedValue = JSON.parse(parsedValue); } catch {}
    }
    existingMap[key] = { ...r, domain_values: parsedValue };
  });

  const snapshot = snapshotService.loadSnapshot(lobId);
  const hasSnap  = Object.keys(snapshot).length > 0;

  let features;
  try {
    ({ features } = catalogService.getCatalog(lobId));
  } catch (err) {
    return {
      envId,
      lobId,
      status: 'unreachable',
      error: `No catalog for LOB "${lobId}". Build one with: node scripts/build-catalog-from-csv.js <csv-path> --lobid ${lobId}`,
      score: 0,
      totalRequired: 0,
      presentRequired: 0,
      missingRequired: 0,
      totalMismatched: 0,
      totalMetadataRows: rows.length,
      features: [],
      checkedAt: new Date().toISOString(),
      durationMs: Date.now() - startMs,
    };
  }

  const enrichedFeatures = features.map(feature => {
    const entries = feature.entries.map(entry => {
      const key = `${entry.domainName}::${entry.domainType}`;
      const row = existingMap[key];
      const currentValue = row ? row.domain_values : null;
      const expectedValue = hasSnap ? (snapshot[key] ?? null) : null;
      const valueMismatch = hasSnap && row != null && !valuesMatch(currentValue, expectedValue);
      return {
        ...entry,
        present: !!row,
        currentValue,
        expectedValue,
        valueMismatch,
        lastModified: row ? row.last_modified_time : null,
      };
    });

    const required = entries.filter(e => !e.optional);
    const missingRequired = required.filter(e => !e.present);
    const missingOptional = entries.filter(e => e.optional && !e.present);
    const mismatchedValues = entries.filter(e => e.valueMismatch);

    return {
      ...feature,
      entries,
      missingRequired: missingRequired.length,
      missingOptional: missingOptional.length,
      mismatchedValues: mismatchedValues.length,
      status: missingRequired.length > 0
        ? (feature.severity === 'critical' ? 'broken' : 'degraded')
        : mismatchedValues.length > 0 ? 'partial'
        : missingOptional.length > 0 ? 'partial' : 'healthy',
    };
  });

  const totalRequired   = enrichedFeatures.reduce((s, f) => s + f.entries.filter(e => !e.optional).length, 0);
  // An entry only counts as "good" if it is present AND its value matches the snapshot (or no snapshot exists)
  const presentCorrect  = enrichedFeatures.reduce((s, f) => s + f.entries.filter(e => !e.optional && e.present && !e.valueMismatch).length, 0);
  const totalMismatched = enrichedFeatures.reduce((s, f) => s + f.mismatchedValues, 0);
  const criticalBroken  = enrichedFeatures.filter(f => f.status === 'broken' && f.severity === 'critical');

  return {
    envId,
    lobId,
    status: criticalBroken.length > 0 ? 'critical'
      : enrichedFeatures.some(f => f.status === 'broken') ? 'warning'
      : totalMismatched > 0 ? 'warning'
      : 'healthy',
    score: totalRequired > 0 ? Math.round((presentCorrect / totalRequired) * 100) : 100,
    totalRequired,
    presentRequired: presentCorrect,
    missingRequired: totalRequired - presentCorrect,
    totalMismatched,
    totalMetadataRows: rows.length,
    features: enrichedFeatures,
    checkedAt: new Date().toISOString(),
    durationMs: Date.now() - startMs,
  };
}

async function checkEnv(envId) {
  const lobs = dbService.getLobsForEnv(envId);
  const results = await Promise.all(lobs.map(l => checkLob(envId, l.id)));
  return { envId, lobs: results };
}

async function diffLobs(envId, lobId1, lobId2) {
  const [result1, result2] = await Promise.all([
    checkLob(envId, lobId1),
    checkLob(envId, lobId2),
  ]);

  const allKeys = new Set([
    ...result1.features.flatMap(f => f.entries.map(e => `${e.domainName}::${e.domainType}`)),
    ...result2.features.flatMap(f => f.entries.map(e => `${e.domainName}::${e.domainType}`)),
  ]);

  const map1 = {};
  const map2 = {};
  result1.features.forEach(f => f.entries.forEach(e => { map1[`${e.domainName}::${e.domainType}`] = e; }));
  result2.features.forEach(f => f.entries.forEach(e => { map2[`${e.domainName}::${e.domainType}`] = e; }));

  const diff = [...allKeys].map(key => {
    const e1 = map1[key];
    const e2 = map2[key];
    return {
      domainName: key.split('::')[0],
      domainType: key.split('::')[1],
      inLob1: e1?.present || false,
      inLob2: e2?.present || false,
      value1: e1?.currentValue || null,
      value2: e2?.currentValue || null,
      diffType: !e1?.present && e2?.present ? 'only_in_lob2'
        : e1?.present && !e2?.present ? 'only_in_lob1'
        : 'both',
    };
  }).filter(d => d.diffType !== 'both');

  return {
    envId,
    lobId1,
    lobId2,
    summary1: { score: result1.score, status: result1.status },
    summary2: { score: result2.score, status: result2.status },
    diff,
    onlyInLob1: diff.filter(d => d.diffType === 'only_in_lob1'),
    onlyInLob2: diff.filter(d => d.diffType === 'only_in_lob2'),
  };
}

module.exports = { checkLob, checkEnv, diffLobs };
