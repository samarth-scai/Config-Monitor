require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const express = require('express');
const cors = require('cors');
const catalogService = require('./services/catalogService');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

app.use('/api/health', require('./routes/healthRoutes'));
app.use('/api/metadata', require('./routes/metadataRoutes'));

app.get('/api/catalog', (req, res) => {
  const lobId = req.query.lob;
  try {
    res.json(catalogService.getCatalog(lobId));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/catalog/reload', (req, res) => {
  const lobId = req.query.lob || req.body?.lobId;
  try {
    res.json(catalogService.reloadCatalog(lobId));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/catalog/snapshot', async (req, res) => {
  try {
    const { envId = 'demo', lobId = 'itcvissfaindemo' } = req.body || {};
    const rows = await require('./services/dbService').fetchAllMetadata(envId, lobId);
    const snap = require('./services/snapshotService').saveSnapshot(rows, lobId);
    res.json({ saved: Object.keys(snap).length, envId, lobId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/catalog/snapshot', (req, res) => {
  const lobId = req.query.lob || 'itcvissfaindemo';
  const svc = require('./services/snapshotService');
  res.json({ exists: svc.hasSnapshot(lobId), entries: Object.keys(svc.loadSnapshot(lobId)).length, path: svc.snapshotPath(lobId) });
});

app.patch('/api/catalog/snapshot/entry', (req, res) => {
  try {
    const { lobId, domainName, domainType, value } = req.body || {};
    if (!lobId || !domainName || !domainType) {
      return res.status(400).json({ error: 'lobId, domainName, domainType are required' });
    }
    const snap = require('./services/snapshotService').updateSnapshotEntry(lobId, domainName, domainType, value);
    res.json({ updated: true, key: `${domainName}::${domainType}`, totalEntries: Object.keys(snap).length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/ping', (req, res) => res.json({ ok: true }));

app.listen(PORT, () => {
  console.log(`Config Monitor server running on http://localhost:${PORT}`);
  console.log(`Tunnel expected at ${process.env.DB_HOST || '127.0.0.1'}:${process.env.DB_PORT || '3307'}`);
});
