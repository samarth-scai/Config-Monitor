const mysql = require('mysql2/promise');
const yaml = require('js-yaml');
const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');

const ENV_PATH = path.join(__dirname, '../.env');
const LOBS_PATH = path.join(__dirname, '../config/lobs.yaml');

class DbService {
  constructor() {
    // key -> { pool, configKey } — pools are rebuilt automatically when
    // .env or lobs.yaml change, so editing those files is all that's needed.
    this.pools = {};
  }

  // Always re-read from disk so edits to .env / lobs.yaml take effect
  // without a server restart.
  _loadEnv() {
    try {
      return dotenv.parse(fs.readFileSync(ENV_PATH, 'utf8'));
    } catch {
      return {};
    }
  }

  _loadLobsConfig() {
    return yaml.load(fs.readFileSync(LOBS_PATH, 'utf8'));
  }

  getLobsForEnv(envId) {
    const lobsConfig = this._loadLobsConfig();
    const env = lobsConfig.environments[envId];
    if (!env) throw new Error(`Unknown environment: ${envId}. Valid: ${Object.keys(lobsConfig.environments).join(', ')}`);
    return env.lobs;
  }

  getEnvironments() {
    const lobsConfig = this._loadLobsConfig();
    return Object.entries(lobsConfig.environments).map(([id, cfg]) => ({
      id,
      lobs: cfg.lobs.map(l => ({ id: l.id, label: l.label })),
    }));
  }

  async _resolveConfig(envId, lobId) {
    const lobsConfig = this._loadLobsConfig();
    const env = lobsConfig.environments[envId];
    if (!env) throw new Error(`Unknown environment: ${envId}`);
    const lobCfg = env.lobs.find(l => l.id === lobId);
    if (!lobCfg) throw new Error(`LOB '${lobId}' not found in env '${envId}'`);

    const fileEnv = this._loadEnv();
    const getEnv = (key, def) => fileEnv[key] ?? process.env[key] ?? def;

    const useIam = getEnv('USE_IAM_AUTH', 'false') === 'true';
    // Per-LOB credentials override env vars — useful when each LOB has its own ProxySQL user
    const dbUser = lobCfg.user || getEnv('DB_USER', 'rds_read_user');
    const config = {
      host: getEnv('DB_HOST', '127.0.0.1'),
      port: parseInt(getEnv('DB_PORT', String(env.tunnel_port || 3307))),
      database: lobCfg.database,
      user: dbUser,
      // SSL only for IAM/RDS auth — ProxySQL password auth doesn't use SSL
      ...(useIam ? { ssl: { rejectUnauthorized: false } } : {}),
      waitForConnections: true,
      connectionLimit: 5,
      connectTimeout: 10000,
    };

    if (useIam) {
      const { Signer } = require('@aws-sdk/rds-signer');
      const signer = new Signer({
        hostname: getEnv('RDS_HOST', '127.0.0.1'),
        port: config.port,
        username: config.user,
        region: getEnv('AWS_REGION', 'ap-south-1'),
      });
      config.password = await signer.getAuthToken();
    } else {
      config.password = lobCfg.password || getEnv('DB_PASSWORD', '');
    }

    return config;
  }

  async getPool(envId, lobId) {
    const key = `${envId}::${lobId}`;
    const config = await this._resolveConfig(envId, lobId);
    const configKey = JSON.stringify(config);

    const cached = this.pools[key];
    if (cached && cached.configKey === configKey) {
      return cached.pool;
    }
    if (cached) {
      cached.pool.end().catch(() => {});
    }

    const pool = mysql.createPool(config);
    this.pools[key] = { pool, configKey };
    return pool;
  }

  async query(envId, lobId, sql, params = []) {
    const pool = await this.getPool(envId, lobId);
    const [rows] = await pool.execute(sql, params);
    return rows;
  }

  async fetchAllMetadata(envId, lobId) {
    return this.query(
      envId,
      lobId,
      `SELECT domain_name, domain_type, domain_values, active_status, creation_time, last_modified_time
       FROM ck_metadata
       WHERE active_status = 'active'
       ORDER BY domain_name, domain_type`
    );
  }

  async closeAll() {
    for (const { pool } of Object.values(this.pools)) {
      await pool.end().catch(() => {});
    }
    this.pools = {};
  }
}

module.exports = new DbService();
