import Chip from '@mui/material/Chip';
import type { HealthStatus } from '../types';

interface Props {
  status: HealthStatus;
  size?: 'small' | 'medium';
}

const config: Record<HealthStatus, { label: string; color: 'success' | 'warning' | 'error' | 'default' }> = {
  healthy:     { label: 'Healthy',     color: 'success' },
  partial:     { label: 'Partial',     color: 'warning' },
  degraded:    { label: 'Degraded',    color: 'warning' },
  broken:      { label: 'Broken',      color: 'error'   },
  critical:    { label: 'Critical',    color: 'error'   },
  warning:     { label: 'Warning',     color: 'warning' },
  unreachable: { label: 'Unreachable', color: 'default' },
};

export function StatusChip({ status, size = 'small' }: Props) {
  const { label, color } = config[status] ?? { label: status, color: 'default' };
  return <Chip label={label} color={color} size={size} variant="filled" />;
}
