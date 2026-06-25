import axios from 'axios';
import type { EnvHealth, LobHealth, LobDiff, Environment } from '../types';

const client = axios.create({ baseURL: '/api' });

export const api = {
  getEnvironments: (): Promise<Environment[]> =>
    client.get('/health/environments').then(r => r.data),

  checkEnv: (envId: string): Promise<EnvHealth> =>
    client.get(`/health/${envId}`).then(r => r.data),

  checkLob: (envId: string, lobId: string): Promise<LobHealth> =>
    client.get(`/health/${envId}/${lobId}`).then(r => r.data),

  diffLobs: (envId: string, lob1: string, lob2: string): Promise<LobDiff> =>
    client.get(`/health/${envId}/${lob1}/diff/${lob2}`).then(r => r.data),

  getMetadata: (envId: string, lobId: string) =>
    client.get(`/metadata/${envId}/${lobId}`).then(r => r.data),

  getSql: (envId: string, lobId: string, domainName: string, domainType: string, value?: string) =>
    client
      .get(`/metadata/${envId}/${lobId}/sql`, { params: { domainName, domainType, value } })
      .then(r => r.data),

  applyFix: (envId: string, lobId: string, payload: { domainName: string; domainType: string; domainValues: unknown }) =>
    client.post(`/metadata/${envId}/${lobId}/apply`, payload).then(r => r.data),

  syncCatalog: (dryRun = false): Promise<{ added: number; total: number; newEntries: unknown[] }> =>
    client.post(`/catalog/sync${dryRun ? '?dry=true' : ''}`).then(r => r.data),

  getSnapshot: (): Promise<{ exists: boolean; entries: number }> =>
    client.get('/catalog/snapshot').then(r => r.data),

  takeSnapshot: (envId: string, lobId: string): Promise<{ saved: number; envId: string; lobId: string }> =>
    client.post('/catalog/snapshot', { envId, lobId }).then(r => r.data),

  updateSnapshotEntry: (lobId: string, domainName: string, domainType: string, value: unknown): Promise<{ updated: boolean; key: string; totalEntries: number }> =>
    client.patch('/catalog/snapshot/entry', { lobId, domainName, domainType, value }).then(r => r.data),
};
