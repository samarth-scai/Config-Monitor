import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import Button from '@mui/material/Button';
import Alert from '@mui/material/Alert';
import CircularProgress from '@mui/material/CircularProgress';
import Table from '@mui/material/Table';
import TableHead from '@mui/material/TableHead';
import TableBody from '@mui/material/TableBody';
import TableRow from '@mui/material/TableRow';
import TableCell from '@mui/material/TableCell';
import Chip from '@mui/material/Chip';
import Tabs from '@mui/material/Tabs';
import Tab from '@mui/material/Tab';
import Tooltip from '@mui/material/Tooltip';
import IconButton from '@mui/material/IconButton';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import CompareArrowsIcon from '@mui/icons-material/CompareArrows';
import { api } from '../services/api';
import { StatusChip } from '../components/StatusChip';
import type { Environment, LobDiff, DiffEntry } from '../types';

function ValueCell({ value }: { value: unknown }) {
  if (value === null) return <Typography variant="caption" color="text.disabled">—</Typography>;
  const str = JSON.stringify(value, null, 2);
  const preview = str.length > 60 ? str.slice(0, 60) + '…' : str;
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
      <Tooltip title={<pre style={{ fontSize: 11, maxWidth: 400, whiteSpace: 'pre-wrap' }}>{str}</pre>} arrow>
        <Typography variant="caption" fontFamily="monospace" sx={{ cursor: 'help' }}>{preview}</Typography>
      </Tooltip>
      <IconButton size="small" onClick={() => navigator.clipboard.writeText(str)}>
        <ContentCopyIcon sx={{ fontSize: 12 }} />
      </IconButton>
    </Box>
  );
}

function DiffTable({ entries, label }: { entries: DiffEntry[]; label: string }) {
  if (entries.length === 0) return <Alert severity="success">No entries missing in {label}</Alert>;
  return (
    <Table size="small">
      <TableHead>
        <TableRow>
          <TableCell sx={{ fontWeight: 600 }}>domain_name</TableCell>
          <TableCell sx={{ fontWeight: 600 }}>domain_type</TableCell>
          <TableCell sx={{ fontWeight: 600 }}>Value (present side)</TableCell>
        </TableRow>
      </TableHead>
      <TableBody>
        {entries.map(e => (
          <TableRow key={`${e.domainName}::${e.domainType}`} sx={{ bgcolor: '#fff8f8' }}>
            <TableCell><Typography variant="body2" fontFamily="monospace">{e.domainName}</Typography></TableCell>
            <TableCell><Typography variant="body2" fontFamily="monospace">{e.domainType}</Typography></TableCell>
            <TableCell><ValueCell value={e.inLob1 ? e.value1 : e.value2} /></TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export function CrossLobDiff() {
  const [params] = useSearchParams();
  const [environments, setEnvironments] = useState<Environment[]>([]);
  const [selectedEnv, setSelectedEnv] = useState(params.get('env') || '');
  const [lob1, setLob1] = useState(params.get('lob1') || '');
  const [lob2, setLob2] = useState(params.get('lob2') || '');
  const [result, setResult] = useState<LobDiff | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [tab, setTab] = useState(0);

  useEffect(() => {
    api.getEnvironments().then(envs => {
      setEnvironments(envs);
      if (!selectedEnv && envs.length > 0) setSelectedEnv(envs[0].id);
    });
  }, []);

  const currentLobs = environments.find(e => e.id === selectedEnv)?.lobs ?? [];

  const runDiff = async () => {
    if (!selectedEnv || !lob1 || !lob2) return;
    setLoading(true);
    setError('');
    try {
      const res = await api.diffLobs(selectedEnv, lob1, lob2);
      setResult(res);
    } catch (e: unknown) {
      const err = e as { message?: string };
      setError(err?.message || 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box>
      <Typography variant="h5" fontWeight={700} mb={3}>Cross-LOB Diff</Typography>

      <Box sx={{ display: 'flex', gap: 2, mb: 3, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <FormControl size="small" sx={{ minWidth: 130 }}>
          <InputLabel>Environment</InputLabel>
          <Select value={selectedEnv} label="Environment" onChange={e => { setSelectedEnv(e.target.value); setLob1(''); setLob2(''); setResult(null); }}>
            {environments.map(e => <MenuItem key={e.id} value={e.id}>{e.id.toUpperCase()}</MenuItem>)}
          </Select>
        </FormControl>

        <FormControl size="small" sx={{ minWidth: 180 }}>
          <InputLabel>LOB 1 (base)</InputLabel>
          <Select value={lob1} label="LOB 1 (base)" onChange={e => setLob1(e.target.value)}>
            {currentLobs.filter(l => l.id !== lob2).map(l => <MenuItem key={l.id} value={l.id}>{l.label || l.id}</MenuItem>)}
          </Select>
        </FormControl>

        <CompareArrowsIcon sx={{ color: 'text.secondary', mt: 1 }} />

        <FormControl size="small" sx={{ minWidth: 180 }}>
          <InputLabel>LOB 2 (compare)</InputLabel>
          <Select value={lob2} label="LOB 2 (compare)" onChange={e => setLob2(e.target.value)}>
            {currentLobs.filter(l => l.id !== lob1).map(l => <MenuItem key={l.id} value={l.id}>{l.label || l.id}</MenuItem>)}
          </Select>
        </FormControl>

        <Button
          variant="contained"
          onClick={runDiff}
          disabled={loading || !lob1 || !lob2 || lob1 === lob2}
        >
          {loading ? 'Comparing...' : 'Compare'}
        </Button>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {loading && <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', my: 4 }}><CircularProgress size={24} /><Typography color="text.secondary">Diffing...</Typography></Box>}

      {result && !loading && (
        <>
          <Box sx={{ display: 'flex', gap: 3, mb: 3 }}>
            {[
              { label: result.lobId1, summary: result.summary1 },
              { label: result.lobId2, summary: result.summary2 },
            ].map(({ label, summary }) => (
              <Box key={label} sx={{ p: 2, border: '1px solid #e0e0e0', borderRadius: 2, flex: 1, bgcolor: '#fff' }}>
                <Typography fontWeight={700}>{label}</Typography>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.5 }}>
                  <StatusChip status={summary.status} />
                  <Typography variant="body2" color="text.secondary">{summary.score}% coverage</Typography>
                </Box>
              </Box>
            ))}
          </Box>

          <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
            <Chip label={`${result.onlyInLob1.length} only in ${result.lobId1}`} color="primary" variant="outlined" />
            <Chip label={`${result.onlyInLob2.length} only in ${result.lobId2}`} color="secondary" variant="outlined" />
            <Chip label={`${result.diff.length} total differences`} />
          </Box>

          <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2 }}>
            <Tab label={`Missing in ${result.lobId2} (${result.onlyInLob1.length})`} />
            <Tab label={`Missing in ${result.lobId1} (${result.onlyInLob2.length})`} />
            <Tab label={`All differences (${result.diff.length})`} />
          </Tabs>

          {tab === 0 && (
            <Box>
              <Alert severity="info" sx={{ mb: 2 }}>
                These entries exist in <strong>{result.lobId1}</strong> but are missing from <strong>{result.lobId2}</strong>.
                Copy the value and add it to {result.lobId2} via the LOB Detail page.
              </Alert>
              <DiffTable entries={result.onlyInLob1} label={result.lobId2} />
            </Box>
          )}

          {tab === 1 && (
            <Box>
              <Alert severity="info" sx={{ mb: 2 }}>
                These entries exist in <strong>{result.lobId2}</strong> but are missing from <strong>{result.lobId1}</strong>.
              </Alert>
              <DiffTable entries={result.onlyInLob2} label={result.lobId1} />
            </Box>
          )}

          {tab === 2 && (
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 600 }}>domain_name</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>domain_type</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>In {result.lobId1}</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>In {result.lobId2}</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {result.diff.map(e => (
                  <TableRow key={`${e.domainName}::${e.domainType}`}>
                    <TableCell><Typography variant="body2" fontFamily="monospace">{e.domainName}</Typography></TableCell>
                    <TableCell><Typography variant="body2" fontFamily="monospace">{e.domainType}</Typography></TableCell>
                    <TableCell>{e.inLob1 ? <ValueCell value={e.value1} /> : <Chip label="missing" size="small" color="error" />}</TableCell>
                    <TableCell>{e.inLob2 ? <ValueCell value={e.value2} /> : <Chip label="missing" size="small" color="error" />}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </>
      )}
    </Box>
  );
}
