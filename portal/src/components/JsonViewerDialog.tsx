import { useState, useCallback } from 'react';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Button from '@mui/material/Button';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Alert from '@mui/material/Alert';
import Chip from '@mui/material/Chip';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import ToggleButton from '@mui/material/ToggleButton';
import Tooltip from '@mui/material/Tooltip';
import IconButton from '@mui/material/IconButton';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CancelIcon from '@mui/icons-material/Cancel';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import SystemUpdateAltIcon from '@mui/icons-material/SystemUpdateAlt';
import type { MetadataEntry } from '../types';
import { api } from '../services/api';

interface Props {
  entry: MetadataEntry;
  lobId: string;
  onClose: () => void;
  onFix?: () => void;
  onUpdated?: () => void;
}

// ── Line-level LCS diff ──────────────────────────────────────────────────────

type DiffLine = { type: 'same' | 'removed' | 'added'; line: string };

function lineDiff(a: string[], b: string[]): DiffLine[] {
  const n = a.length, m = b.length;
  // cap to avoid O(n*m) blowup on huge payloads
  if (n * m > 200_000) {
    return [
      ...a.map(line => ({ type: 'removed' as const, line })),
      ...b.map(line => ({ type: 'added' as const, line })),
    ];
  }
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--)
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);

  const result: DiffLine[] = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) { result.push({ type: 'same', line: a[i] }); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { result.push({ type: 'removed', line: a[i] }); i++; }
    else { result.push({ type: 'added', line: b[j] }); j++; }
  }
  while (i < n) result.push({ type: 'removed', line: a[i++] });
  while (j < m) result.push({ type: 'added', line: b[j++] });
  return result;
}

// ── Syntax highlight for raw JSON blocks ────────────────────────────────────

function highlight(raw: string) {
  return raw.replace(
    /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+-]?\d+)?)/g,
    match => {
      if (/^"/.test(match)) {
        if (/:$/.test(match)) return `<span style="color:#79c0ff">${match}</span>`;
        return `<span style="color:#a5d6ff">${match}</span>`;
      }
      if (/true|false/.test(match)) return `<span style="color:#ff7b72">${match}</span>`;
      if (/null/.test(match)) return `<span style="color:#8b949e">${match}</span>`;
      return `<span style="color:#f2cc60">${match}</span>`;
    }
  );
}

// ── Sub-components ───────────────────────────────────────────────────────────

function CopyButton({ text }: { text: string }) {
  return (
    <Tooltip title="Copy JSON">
      <IconButton
        size="small"
        onClick={() => navigator.clipboard.writeText(text)}
        sx={{ position: 'absolute', top: 6, right: 6, color: '#8b949e', '&:hover': { color: '#e6edf3' }, zIndex: 1 }}
      >
        <ContentCopyIcon fontSize="small" />
      </IconButton>
    </Tooltip>
  );
}

function JsonBlock({ value, label, labelColor = '#8b949e', maxHeight = 400 }: {
  value: unknown;
  label?: string;
  labelColor?: string;
  maxHeight?: number;
}) {
  const raw = JSON.stringify(value, null, 2);
  return (
    <Box>
      {label && (
        <Typography variant="overline" fontWeight={700} display="block" mb={0.5} sx={{ color: labelColor }}>
          {label}
        </Typography>
      )}
      <Box sx={{ position: 'relative' }}>
        <CopyButton text={raw} />
        <Box sx={{ bgcolor: '#0d1117', border: '1px solid #30363d', borderRadius: 1.5, p: 2, pr: 5, overflowX: 'auto', maxHeight, overflowY: 'auto' }}>
          <pre
            style={{ margin: 0, fontSize: 13, fontFamily: 'monospace', whiteSpace: 'pre-wrap', wordBreak: 'break-word', color: '#e6edf3', lineHeight: 1.6 }}
            dangerouslySetInnerHTML={{ __html: highlight(raw) }}
          />
        </Box>
      </Box>
    </Box>
  );
}

function UnifiedDiff({ expected, current }: { expected: unknown; current: unknown }) {
  const aLines = JSON.stringify(expected, null, 2).split('\n');
  const bLines = JSON.stringify(current, null, 2).split('\n');
  const diff = lineDiff(aLines, bLines);

  const removed = diff.filter(d => d.type === 'removed').length;
  const added = diff.filter(d => d.type === 'added').length;

  return (
    <Box>
      <Box sx={{ display: 'flex', gap: 1, mb: 1, alignItems: 'center' }}>
        <Typography variant="overline" fontWeight={700} sx={{ color: '#8b949e' }}>Diff</Typography>
        <Chip label={`−${removed}`} size="small" sx={{ bgcolor: '#3d1515', color: '#ff7b72', fontWeight: 700, fontFamily: 'monospace', fontSize: '0.72rem' }} />
        <Chip label={`+${added}`} size="small" sx={{ bgcolor: '#0d2a1a', color: '#3fb950', fontWeight: 700, fontFamily: 'monospace', fontSize: '0.72rem' }} />
        <Box sx={{ flex: 1 }} />
        <CopyButton text={diff.filter(d => d.type !== 'removed').map(d => d.line).join('\n')} />
      </Box>
      <Box sx={{ bgcolor: '#0d1117', border: '1px solid #30363d', borderRadius: 1.5, overflowX: 'auto', maxHeight: 500, overflowY: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', width: '100%', fontFamily: 'monospace', fontSize: 12, lineHeight: '1.6' }}>
          <tbody>
            {diff.map((d, i) => (
              <tr
                key={i}
                style={{
                  background: d.type === 'removed' ? '#3d1515' : d.type === 'added' ? '#0d2a1a' : 'transparent',
                }}
              >
                <td style={{ width: 24, paddingLeft: 8, paddingRight: 4, userSelect: 'none', color: d.type === 'removed' ? '#ff7b72' : d.type === 'added' ? '#3fb950' : '#444c56', verticalAlign: 'top' }}>
                  {d.type === 'removed' ? '−' : d.type === 'added' ? '+' : ' '}
                </td>
                <td style={{ paddingRight: 12, whiteSpace: 'pre-wrap', wordBreak: 'break-word', color: d.type === 'removed' ? '#ff7b72' : d.type === 'added' ? '#3fb950' : '#e6edf3', verticalAlign: 'top' }}>
                  {d.line}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Box>
    </Box>
  );
}

function SideBySide({ expected, current }: { expected: unknown; current: unknown }) {
  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
      <JsonBlock value={expected} label="Expected (snapshot)" labelColor="#22c55e" maxHeight={380} />
      <JsonBlock value={current} label="Current (DB)" labelColor="#ff9800" maxHeight={380} />
    </Box>
  );
}

// ── Main dialog ──────────────────────────────────────────────────────────────

export function JsonViewerDialog({ entry, lobId, onClose, onFix, onUpdated }: Props) {
  const isMismatch = entry.present && entry.valueMismatch;
  const [view, setView] = useState<'diff' | 'side'>('diff');
  const [updating, setUpdating] = useState(false);
  const [updateDone, setUpdateDone] = useState(false);

  const acceptDbValue = useCallback(async () => {
    setUpdating(true);
    try {
      await api.updateSnapshotEntry(lobId, entry.domainName, entry.domainType, entry.currentValue);
      setUpdateDone(true);
      onUpdated?.();
    } finally {
      setUpdating(false);
    }
  }, [lobId, entry, onUpdated]);

  const statusColor = isMismatch ? '#ff9800' : entry.present ? '#22c55e' : entry.optional ? '#f59e0b' : '#ef4444';
  const StatusIcon = isMismatch ? ErrorOutlineIcon : entry.present ? CheckCircleIcon : entry.optional ? WarningAmberIcon : CancelIcon;

  return (
    <Dialog open onClose={onClose} maxWidth="md" fullWidth PaperProps={{ sx: { borderRadius: 2 } }}>
      <DialogTitle sx={{ pb: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5 }}>
          <StatusIcon sx={{ color: statusColor, mt: 0.3, flexShrink: 0 }} />
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
              <Typography
                component="span"
                fontWeight={700}
                fontFamily="monospace"
                sx={{ bgcolor: isMismatch ? '#fff8e1' : entry.present ? '#f0fdf4' : '#fff0f0', px: 0.8, py: 0.2, borderRadius: 1, fontSize: '1rem', color: statusColor }}
              >
                {entry.domainName}
              </Typography>
              <Typography component="span" color="text.disabled" fontWeight={300}>/</Typography>
              <Typography
                component="span"
                fontWeight={700}
                fontFamily="monospace"
                sx={{ bgcolor: isMismatch ? '#fff8e1' : entry.present ? '#f0fdf4' : '#fff0f0', px: 0.8, py: 0.2, borderRadius: 1, fontSize: '1rem', color: statusColor }}
              >
                {entry.domainType}
              </Typography>
              {entry.optional && (
                <Chip label="optional" size="small" variant="outlined" sx={{ fontSize: '0.65rem', height: 20 }} />
              )}
              {isMismatch && (
                <Chip label="VALUE MISMATCH" size="small" sx={{ bgcolor: '#fff3e0', color: '#e65100', fontWeight: 700, fontSize: '0.65rem' }} />
              )}
            </Box>
            <Typography variant="caption" color="text.secondary" display="block" mt={0.5}>
              {entry.description}
            </Typography>
            {entry.lastModified && (
              <Typography variant="caption" color="text.disabled" display="block">
                Last modified: {new Date(entry.lastModified).toLocaleString()}
              </Typography>
            )}
          </Box>
        </Box>
      </DialogTitle>

      <DialogContent dividers>
        {!entry.present ? (
          <Alert severity={entry.optional ? 'warning' : 'error'} icon={<StatusIcon fontSize="inherit" />}>
            <Typography fontWeight={600}>
              {entry.optional ? 'Entry not configured (optional)' : 'Entry missing — required for this feature'}
            </Typography>
            <Typography variant="body2" mt={0.5}>
              No row exists in <code>ck_metadata</code> for this <code>domain_name / domain_type</code> pair.
              {!entry.optional && ' This is likely causing the feature failure.'}
            </Typography>
          </Alert>
        ) : isMismatch ? (
          <Box>
            <Alert severity="warning" sx={{ mb: 2 }}>
              <Typography fontWeight={600}>Value differs from reference snapshot</Typography>
              <Typography variant="body2" mt={0.5}>
                Lines in <span style={{ color: '#ff7b72', fontWeight: 700 }}>red (−)</span> are in the snapshot but not the DB.&nbsp;
                Lines in <span style={{ color: '#3fb950', fontWeight: 700 }}>green (+)</span> are in the DB but not the snapshot.
              </Typography>
            </Alert>

            <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 1.5 }}>
              <ToggleButtonGroup
                size="small"
                value={view}
                exclusive
                onChange={(_, v) => v && setView(v)}
              >
                <ToggleButton value="diff" sx={{ fontSize: '0.72rem', px: 1.5 }}>Diff</ToggleButton>
                <ToggleButton value="side" sx={{ fontSize: '0.72rem', px: 1.5 }}>Side by side</ToggleButton>
              </ToggleButtonGroup>
            </Box>

            {view === 'diff'
              ? <UnifiedDiff expected={entry.expectedValue} current={entry.currentValue} />
              : <SideBySide expected={entry.expectedValue} current={entry.currentValue} />
            }
          </Box>
        ) : (
          <JsonBlock value={entry.currentValue} label="domain_values" labelColor="#4ade80" />
        )}
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose}>Close</Button>
        {!entry.present && onFix && (
          <Button variant="contained" color={entry.optional ? 'warning' : 'error'} onClick={onFix}>
            Fix this entry
          </Button>
        )}
        {isMismatch && (
          <Tooltip title="Overwrite the reference snapshot entry with the current DB value">
            <span>
              <Button
                variant="contained"
                startIcon={updateDone ? <CheckCircleIcon /> : <SystemUpdateAltIcon />}
                disabled={updating || updateDone}
                onClick={acceptDbValue}
                sx={{ bgcolor: updateDone ? '#22c55e' : '#1976d2', '&:hover': { bgcolor: updateDone ? '#16a34a' : '#1565c0' } }}
              >
                {updating ? 'Updating…' : updateDone ? 'Reference updated' : 'Accept DB value as reference'}
              </Button>
            </span>
          </Tooltip>
        )}
      </DialogActions>
    </Dialog>
  );
}
