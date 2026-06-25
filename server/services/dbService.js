const mysql = require('mysql2/promise');
const yaml = require('js-yaml');
const fs = require('fs');
const path = require('path');

class DbService {
  constructor() {
    this.pools = {};
    this.lobsConfig = yaml.load(
      fs.readFileSync(path.join(__dirname, '../config/lobs.yaml'), 'utf8')
    );
  }

  getLobsForEnv(envId) {
    const env = this.lobsConfig.environments[envId];
    if (!env) throw new Error(`Unknown environment: ${envId}. Valid: ${Object.keys(this.lobsConfig.environments).join(', ')}`);
    return env.lobs;
  }

  getEnvironments() {
    return Object.entries(this.lobsConfig.environments).map(([id, cfg]) => ({
      id,
      lobs: cfg.lobs.map(l => ({ id: l.id, label: l.label })),
    }));
  }

  async _buildPool(envId, lobId) {
    const env = this.lobsConfig.environments[envId];
    if (!env) throw new Error(`Unknown environment: ${envId}`);
    const lobCfg = env.lobs.find(l => l.id === lobId);
    if (!lobCfg) throw new Error(`LOB '${lobId}' not found in env '${envId}'`);

    const useIam = process.env.USE_IAM_AUTH === 'true';
    // Per-LOB credentials override env vars — useful when each LOB has its own ProxySQL user
    const dbUser = lobCfg.user || process.env.DB_USER || 'rds_read_user';
    const baseConfig = {
      host: process.env.DB_HOST || '127.0.0.1',
      port: parseInt(process.env.DB_PORT || String(env.tunnel_port || 3307)),
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
        hostname: process.env.RDS_HOST || '127.0.0.1',
        port: baseConfig.port,
        username: baseConfig.user,
        region: process.env.AWS_REGION || 'ap-south-1',
      });
      baseConfig.password = await signer.getAuthToken();
    } else {
      baseConfig.password = lobCfg.password || process.env.DB_PASSWORD || '';
    }

    return mysql.createPool(baseConfig);
  }

  async getPool(envId, lobId) {
    const key = `${envId}::${lobId}`;
    if (!this.pools[key]) {
      this.pools[key] = await this._buildPool(envId, lobId);
    }
    return this.pools[key];
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
    for (const pool of Object.values(this.pools)) {
      await pool.end().catch(() => {});
    }
    this.pools = {};
  }
}

module.exports = new DbService();
