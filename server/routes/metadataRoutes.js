const express = require('express');
const router = express.Router();
const dbService = require('../services/dbService');
const axios = require('axios');

// GET /api/metadata/:env/:lob — fetch all metadata rows for a LOB
router.get('/:env/:lob', async (req, res) => {
  try {
    const rows = await dbService.fetchAllMetadata(req.params.env, req.params.lob);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/metadata/:env/:lob/sql — generate INSERT SQL for a missing key
// Query: ?domainName=X&domainType=Y&value=[...]
router.get('/:env/:lob/sql', (req, res) => {
  const { domainName, domainType, value } = req.query;
  if (!domainName || !domainType) {
    return res.status(400).json({ error: 'domainName and domainType are required' });
  }
  const lobId = req.params.lob;
  const jsonValue = value || '[]';
  const sql = `INSERT INTO ck_metadata (id, active_status, active_status_reason, changed, created_by, creation_time, extended_attributes, hash, last_modified_time, lob, modified_by, source, version, description, domain_name, domain_type, domain_values)
VALUES (UUID(), 'active', NULL, 1, 'config-monitor', NOW(), NULL, NULL, NOW(), '${lobId}', 'config-monitor', NULL, 0, NULL, '${domainName}', '${domainType}', '${jsonValue}');`;
  res.json({ sql, domainName, domainType, lob: lobId });
});

// POST /api/metadata/:env/:lob/apply — apply fix via channelkart API (requires CK_API_BASE_URL and CK_API_TOKEN)
router.post('/:env/:lob/apply', async (req, res) => {
  const ckBase = process.env.CK_API_BASE_URL;
  const ckToken = process.env.CK_API_TOKEN;
  if (!ckBase || !ckToken) {
    return res.status(503).json({
      error: 'CK_API_BASE_URL and CK_API_TOKEN must be set to apply fixes via API.',
      hint: 'Alternatively, use GET /:env/:lob/sql to get the SQL to run manually.',
    });
  }
  const { domainName, domainType, domainValues } = req.body;
  if (!domainName || !domainType || !domainValues) {
    return res.status(400).json({ error: 'domainName, domainType, domainValues are required in body' });
  }
  try {
    const response = await axios.post(
      `${ckBase}/api/metadata`,
      { domainName, domainType, domainValues },
      { headers: { Authorization: `Bearer ${ckToken}`, 'Content-Type': 'application/json' } }
    );
    res.json({ success: true, data: response.data });
  } catch (err) {
    const detail = err.response?.data || err.message;
    res.status(502).json({ error: 'CK API call failed', detail });
  }
});

module.exports = router;
