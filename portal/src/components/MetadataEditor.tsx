import { useState } from 'react';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';
import Alert from '@mui/material/Alert';
import Tabs from '@mui/material/Tabs';
import Tab from '@mui/material/Tab';
import IconButton from '@mui/material/IconButton';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import { api } from '../services/api';
import type { MetadataEntry } from '../types';

interface Props {
  entry: MetadataEntry;
  envId: string;
  lobId: string;
  onClose: () => void;
  onFixed: () => void;
}

export function MetadataEditor({ entry, envId, lobId, onClose, onFixed }: Props) {
  const [tab, setTab] = useState(0);
  const [value, setValue] = useState('[]');
  const [jsonError, setJsonError] = useState('');
  const [sql, setSql] = useState('');
  const [loadingSql, setLoadingSql] = useState(false);
  const [applying, setApplying] = useState(false);
  const [applyResult, setApplyResult] = useState<{ ok: boolean; msg: string } | null>(null);

  const validate = (v: string) => {
    try {
      JSON.parse(v);
      setJsonError('');
      return true;
    } catch (e: unknown) {
      setJsonError(String(e));
      return false;
    }
  };

  const handleValueChange = (v: string) => {
    setValue(v);
    if (v) validate(v);
  };

  const loadSql = async () => {
    setLoadingSql(true);
    try {
      const res = await api.getSql(envId, lobId, entry.domainName, entry.domainType, value);
      setSql(res.sql);
    } catch (e: unknown) {
      const err = e as { message?: string };
      setSql(`-- Error generating SQL: ${err?.message || 'unknown'}`);
    } finally {
      setLoadingSql(false);
    }
  };

  const handleApply = async () => {
    if (!validate(value)) return;
    setApplying(true);
    setApplyResult(null);
    try {
      let parsed;
      try { parsed = JSON.parse(value); } catch { parsed = []; }
      await api.applyFix(envId, lobId, {
        domainName: entry.domainName,
        domainType: entry.domainType,
        domainValues: parsed,
      });
      setApplyResult({ ok: true, msg: 'Applied successfully via CK API. Refresh to see updated status.' });
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string; hint?: string } }; message?: string };
      const detail = err?.response?.data?.error || err?.message || 'Unknown error';
      const hint = err?.response?.data?.hint;
      setApplyResult({ ok: false, msg: detail + (hint ? `\nHint: ${hint}` : '') });
    } finally {
      setApplying(false);
    }
  };

  return (
    <Dialog open onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>
        Fix Missing Config
        <Typography variant="caption" display="block" color="text.secondary" fontFamily="monospace">
          {entry.domainName} / {entry.domainType}
        </Typography>
        <Typography variant="body2" color="text.secondary" mt={0.5}>{entry.description}</Typography>
      </DialogTitle>

      <DialogContent dividers>
        <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2 }}>
          <Tab label="JSON Editor" />
          <Tab label="Generate SQL" onClick={loadSql} />
        </Tabs>

        {tab === 0 && (
          <Box>
            <Typography variant="body2" color="text.secondary" mb={1}>
              Enter the <code>domain_values</code> JSON array for this entry.
              Copy from a working LOB via the Cross-LOB Diff page, or enter a new value.
            </Typography>
            <TextField
              fullWidth
              multiline
              rows={10}
              value={value}
              onChange={e => handleValueChange(e.target.value)}
              error={!!jsonError}
              helperText={jsonError || 'Must be a valid JSON array'}
              inputProps={{ style: { fontFamily: 'monospace', fontSize: 13 } }}
            />
            {applyResult && (
              <Alert severity={applyResult.ok ? 'success' : 'error'} sx={{ mt: 2, whiteSpace: 'pre-line' }}>
                {applyResult.msg}
              </Alert>
            )}
          </Box>
        )}

        {tab === 1 && (
          <Box>
            <Typography variant="body2" color="text.secondary" mb={1}>
              Run this SQL directly on the <strong>{lobId}</strong> database after setting up a write tunnel.
            </Typography>
            <Box sx={{ position: 'relative' }}>
              <TextField
                fullWidth
                multiline
                rows={8}
                value={loadingSql ? 'Generating...' : sql || 'Click "Generate SQL" tab to load.'}
                InputProps={{ readOnly: true, style: { fontFamily: 'monospace', fontSize: 12 } }}
              />
              {sql && (
                <IconButton
                  size="small"
                  sx={{ position: 'absolute', top: 8, right: 8 }}
                  onClick={() => navigator.clipboard.writeText(sql)}
                >
                  <ContentCopyIcon fontSize="small" />
                </IconButton>
              )}
            </Box>
            <Alert severity="warning" sx={{ mt: 2 }}>
              Running SQL directly bypasses channelkart's cache invalidation. After running, restart the CK service
              or call <code>POST /api/metadata/refresh</code> on the CK backend to clear caches.
            </Alert>
          </Box>
        )}
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        {tab === 0 && (
          <Button
            variant="contained"
            onClick={handleApply}
            disabled={applying || !!jsonError}
            color="primary"
          >
            {applying ? 'Applying...' : 'Apply via CK API'}
          </Button>
        )}
        {applyResult?.ok && (
          <Button variant="outlined" color="success" onClick={onFixed}>Done</Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
