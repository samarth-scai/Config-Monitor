import { useState } from 'react';
import AppBar from '@mui/material/AppBar';
import Box from '@mui/material/Box';
import Toolbar from '@mui/material/Toolbar';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Alert from '@mui/material/Alert';
import CircularProgress from '@mui/material/CircularProgress';
import Chip from '@mui/material/Chip';
import SyncIcon from '@mui/icons-material/Sync';
import CameraAltIcon from '@mui/icons-material/CameraAlt';
import MonitorHeartIcon from '@mui/icons-material/MonitorHeart';
import { Link, useLocation } from 'react-router-dom';
import { api } from '../services/api';

const NAV = [
  { label: 'Dashboard', path: '/' },
  { label: 'LOB Detail', path: '/lob' },
  { label: 'Cross-LOB Diff', path: '/diff' },
];

function SyncDialog({ onClose }: { onClose: () => void }) {
  const [status, setStatus] = useState<'idle' | 'running' | 'done' | 'error'>('idle');
  const [result, setResult] = useState<{ added: number; total: number; newEntries: unknown[] } | null>(null);
  const [error, setError] = useState('');

  const run = async (dryRun: boolean) => {
    setStatus('running');
    setError('');
    setResult(null);
    try {
      const res = await api.syncCatalog(dryRun);
      setResult(res);
      setStatus('done');
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } }; message?: string };
      setError(err?.response?.data?.error || err?.message || 'Unknown error');
      setStatus('error');
    }
  };

  return (
    <Dialog open onClose={onClose} maxWidth="sm" fullWidth PaperProps={{ sx: { borderRadius: 2 } }}>
      <DialogTitle>
        Sync Catalog from Channelkart Source
        <Typography variant="body2" color="text.secondary" mt={0.5}>
          Scans all <code>fetchByValue()</code> call sites in the Java source and adds any
          (domainName, domainType) pairs not yet in the catalog.
        </Typography>
      </DialogTitle>

      <DialogContent dividers>
        {status === 'idle' && (
          <Alert severity="info">
            The catalog currently contains manually curated entries. This scan will auto-discover
            additional entries from the source code and append them. Run <strong>Dry Run</strong> first
            to preview without writing.
          </Alert>
        )}

        {status === 'running' && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, py: 2 }}>
            <CircularProgress size={24} />
            <Typography>Scanning channelkart source...</Typography>
          </Box>
        )}

        {status === 'done' && result && (
          <Box>
            <Box sx={{ display: 'flex', gap: 2, mb: 2, flexWrap: 'wrap' }}>
              <Chip label={`${result.total} pairs found in source`} />
              <Chip
                label={`${result.added} new entries ${result.added > 0 ? 'added to catalog' : '(catalog up to date)'}`}
                color={result.added > 0 ? 'success' : 'default'}
              />
            </Box>
            {result.added === 0 && (
              <Alert severity="success">Catalog is already up to date — no new entries found.</Alert>
            )}
            {result.added > 0 && (
              <Alert severity="success">
                {result.added} new entries added to <code>catalog/metadata-catalog.yaml</code>.
                Reload the page to see updated health checks.
              </Alert>
            )}
          </Box>
        )}

        {status === 'error' && (
          <Alert severity="error">{error}</Alert>
        )}
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose}>Close</Button>
        <Button
          variant="outlined"
          onClick={() => run(true)}
          disabled={status === 'running'}
          startIcon={status === 'running' ? <CircularProgress size={14} /> : undefined}
        >
          Dry Run (preview)
        </Button>
        <Button
          variant="contained"
          onClick={() => run(false)}
          disabled={status === 'running'}
          startIcon={status === 'running' ? <CircularProgress size={14} /> : undefined}
        >
          Sync Catalog
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function SnapshotDialog({ onClose }: { onClose: () => void }) {
  const [status, setStatus] = useState<'idle' | 'running' | 'done' | 'error'>('idle');
  const [result, setResult] = useState<{ saved: number; envId: string; lobId: string } | null>(null);
  const [error, setError] = useState('');

  const take = async () => {
    setStatus('running');
    setError('');
    try {
      const res = await api.takeSnapshot('demo', 'hfcoedemo');
      setResult(res);
      setStatus('done');
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } }; message?: string };
      setError(err?.response?.data?.error || err?.message || 'Unknown error');
      setStatus('error');
    }
  };

  return (
    <Dialog open onClose={onClose} maxWidth="sm" fullWidth PaperProps={{ sx: { borderRadius: 2 } }}>
      <DialogTitle>
        Take Reference Snapshot
        <Typography variant="body2" color="text.secondary" mt={0.5}>
          Saves all current <code>ck_metadata</code> values from hfcoedemo as the reference.
          Future health checks will flag any entries whose values differ from this snapshot.
        </Typography>
      </DialogTitle>
      <DialogContent dividers>
        {status === 'idle' && (
          <Alert severity="info">
            Make sure the DB is in the <strong>correct expected state</strong> before taking a snapshot.
            Any drift from this point will be highlighted as a value mismatch (orange).
          </Alert>
        )}
        {status === 'running' && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, py: 2 }}>
            <CircularProgress size={24} />
            <Typography>Fetching values from hfcoedemo...</Typography>
          </Box>
        )}
        {status === 'done' && result && (
          <Alert severity="success">
            Snapshot saved — <strong>{result.saved}</strong> entries captured from <strong>{result.lobId}</strong>.
            Reload the health check to see mismatches.
          </Alert>
        )}
        {status === 'error' && <Alert severity="error">{error}</Alert>}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
        <Button variant="contained" onClick={take} disabled={status === 'running'} startIcon={<CameraAltIcon />}>
          Take Snapshot
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export function Layout({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const [syncOpen, setSyncOpen] = useState(false);
  const [snapOpen, setSnapOpen] = useState(false);

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: '#f5f6fa' }}>
      <AppBar position="static" elevation={0} sx={{ bgcolor: '#1a1a2e', borderBottom: '1px solid #2d2d44' }}>
        <Toolbar>
          <MonitorHeartIcon sx={{ mr: 1.5, color: '#7c6af7' }} />
          <Typography variant="h6" fontWeight={700} sx={{ flexGrow: 0, mr: 4, color: '#fff' }}>
            Config Monitor
          </Typography>
          <Typography variant="caption" sx={{ color: '#aaa', mr: 4, mt: 0.5 }}>
            CK Metadata Health Monitor
          </Typography>
          <Box sx={{ display: 'flex', gap: 1, flexGrow: 1 }}>
            {NAV.map(n => (
              <Button
                key={n.path}
                component={Link}
                to={n.path}
                size="small"
                sx={{
                  color: location.pathname === n.path ? '#7c6af7' : '#ccc',
                  fontWeight: location.pathname === n.path ? 700 : 400,
                  borderBottom: location.pathname === n.path ? '2px solid #7c6af7' : '2px solid transparent',
                  borderRadius: 0,
                }}
              >
                {n.label}
              </Button>
            ))}
          </Box>
          <Tooltip title="Take reference snapshot (for value mismatch detection)">
            <IconButton onClick={() => setSnapOpen(true)} sx={{ color: '#aaa', '&:hover': { color: '#fff' } }}>
              <CameraAltIcon />
            </IconButton>
          </Tooltip>
          <Tooltip title="Sync catalog from channelkart source code">
            <IconButton onClick={() => setSyncOpen(true)} sx={{ color: '#aaa', '&:hover': { color: '#fff' } }}>
              <SyncIcon />
            </IconButton>
          </Tooltip>
        </Toolbar>
      </AppBar>

      <Box sx={{ p: 3 }}>{children}</Box>

      {syncOpen && <SyncDialog onClose={() => setSyncOpen(false)} />}
      {snapOpen && <SnapshotDialog onClose={() => setSnapOpen(false)} />}
    </Box>
  );
}
