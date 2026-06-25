const fs   = require('fs');
const path = require('path');

function snapshotPath(lobId) {
  return path.join(__dirname, '../../catalog', `reference-snapshot-${lobId}.json`);
}

function loadSnapshot(lobId) {
  try {
    return JSON.parse(fs.readFileSync(snapshotPath(lobId), 'utf8'));
  } catch {
    return {};
  }
}

function saveSnapshot(rows, lobId) {
  const snap = {};
  for (const row of rows) {
    const key = `${row.domain_name}::${row.domain_type}`;
    let val = row.domain_values;
    if (typeof val === 'string') {
      try { val = JSON.parse(val); } catch {}
    }
    snap[key] = val;
  }
  fs.writeFileSync(snapshotPath(lobId), JSON.stringify(snap, null, 2));
  return snap;
}

function hasSnapshot(lobId) {
  return fs.existsSync(snapshotPath(lobId));
}

function updateSnapshotEntry(lobId, domainName, domainType, value) {
  const snap = loadSnapshot(lobId);
  snap[`${domainName}::${domainType}`] = value;
  fs.writeFileSync(snapshotPath(lobId), JSON.stringify(snap, null, 2));
  return snap;
}

module.exports = { loadSnapshot, saveSnapshot, hasSnapshot, snapshotPath, updateSnapshotEntry };
