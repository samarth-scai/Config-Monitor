export type Severity = 'critical' | 'high' | 'medium' | 'low';
export type HealthStatus = 'healthy' | 'partial' | 'degraded' | 'broken' | 'critical' | 'warning' | 'unreachable';

export interface MetadataEntry {
  domainName: string;
  domainType: string;
  description: string;
  optional: boolean;
  present: boolean;
  currentValue: unknown;
  expectedValue: unknown;
  valueMismatch: boolean;
  lastModified: string | null;
}

export interface FeatureHealth {
  name: string;
  description: string;
  severity: Severity;
  entries: MetadataEntry[];
  missingRequired: number;
  missingOptional: number;
  mismatchedValues: number;
  status: HealthStatus;
}

export interface LobHealth {
  envId: string;
  lobId: string;
  status: HealthStatus;
  score: number;
  totalRequired: number;
  presentRequired: number;
  missingRequired: number;
  totalMismatched: number;
  totalMetadataRows: number;
  features: FeatureHealth[];
  checkedAt: string;
  durationMs: number;
  error?: string;
}

export interface EnvHealth {
  envId: string;
  lobs: LobHealth[];
}

export interface DiffEntry {
  domainName: string;
  domainType: string;
  inLob1: boolean;
  inLob2: boolean;
  value1: unknown;
  value2: unknown;
  diffType: 'only_in_lob1' | 'only_in_lob2' | 'both';
}

export interface LobDiff {
  envId: string;
  lobId1: string;
  lobId2: string;
  summary1: { score: number; status: HealthStatus };
  summary2: { score: number; status: HealthStatus };
  diff: DiffEntry[];
  onlyInLob1: DiffEntry[];
  onlyInLob2: DiffEntry[];
}

export interface Environment {
  id: string;
  lobs: Array<{ id: string; label: string }>;
}
