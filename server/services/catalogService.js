const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const cache = {};

function catalogPath(lobId) {
  return path.join(__dirname, '../../catalog', `${lobId}-catalog.yaml`);
}

function getCatalog(lobId) {
  if (!lobId) throw new Error('lobId required for getCatalog');
  if (!cache[lobId]) {
    const p = catalogPath(lobId);
    if (!fs.existsSync(p)) {
      throw new Error(`No catalog found for LOB "${lobId}". Expected file: ${p}`);
    }
    cache[lobId] = yaml.load(fs.readFileSync(p, 'utf8'));
  }
  return cache[lobId];
}

function reloadCatalog(lobId) {
  if (lobId) {
    delete cache[lobId];
    return getCatalog(lobId);
  }
  Object.keys(cache).forEach(k => delete cache[k]);
  return null;
}

function hasCatalog(lobId) {
  return fs.existsSync(catalogPath(lobId));
}

module.exports = { getCatalog, reloadCatalog, hasCatalog, catalogPath };
