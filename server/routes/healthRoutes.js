const express = require('express');
const router = express.Router();
const healthService = require('../services/healthService');
const dbService = require('../services/dbService');

// GET /api/health/environments
router.get('/environments', (req, res) => {
  try {
    res.json(dbService.getEnvironments());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/health/:env — check all LOBs in an environment
router.get('/:env', async (req, res) => {
  try {
    const result = await healthService.checkEnv(req.params.env);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// GET /api/health/:env/:lob — check a single LOB
router.get('/:env/:lob', async (req, res) => {
  try {
    const result = await healthService.checkLob(req.params.env, req.params.lob);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// GET /api/health/:env/:lob/diff/:lob2 — diff two LOBs
router.get('/:env/:lob/diff/:lob2', async (req, res) => {
  try {
    const result = await healthService.diffLobs(req.params.env, req.params.lob, req.params.lob2);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
