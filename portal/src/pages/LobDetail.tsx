import { useEffect, useState, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import Button from '@mui/material/Button';
import Alert from '@mui/material/Alert';
import CircularProgress from '@mui/material/CircularProgress';
import Divider from '@mui/material/Divider';
import Chip from '@mui/material/Chip';
import TextField from '@mui/material/TextField';
import InputAdornment from '@mui/material/InputAdornment';
import SearchIcon from '@mui/icons-material/Search';
import ClearIcon from '@mui/icons-material/Clear';
import IconButton from '@mui/material/IconButton';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import RefreshIcon from '@mui/icons-material/Refresh';
import CompareArrowsIcon from '@mui/icons-material/CompareArrows';
import { api } from '../services/api';
import { StatusChip } from '../components/StatusChip';
import { DomainNameCard } from '../components/DomainNameCard';
import type { LobHealth, Environment, MetadataEntry } from '../types';

export function LobDetail() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const [environments, setEnvironments] = useState<Environment[]>([]);
  const [selectedEnv, setSelectedEnv] = useState(params.get('env') || '');
  const [selectedLob, setSelectedLob] = useState(params.get('lob') || '');
  const [result, setResult] = useState<LobHealth | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const focusFeature = params.get('feature');

  useEffect(() => {
    api.getEnvironments().then(envs => {
      setEnvironments(envs);
      if (!selectedEnv && envs.length > 0) setSelectedEnv(envs[0].id);
    });
  }, []);

  const currentLobs = environments.find(e => e.id === selectedEnv)?.lobs ?? [];

  const runCheck = useCallback(async () => {
    if (!selectedEnv || !selectedLob) return;
    setLoading(true);
    setError('');
    try {
      const res = await api.checkLob(selectedEnv, selectedLob);
      setResult(res);
      setParams({ env: selectedEnv, lob: selectedLob });
    } catch (e: unknown) {
      const err = e as { message?: string };
      setError(err?.message || 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [selectedEnv, selectedLob]);

  useEffect(() => {
    if (selectedEnv && selectedLob) runCheck();
  }, [selectedEnv, selectedLob]);

  // Flatten all entries across features and group by domain_name
  const domainGroups: Map<string, MetadataEntry[]> = new Map();
  if (result) {
    for (const feature of result.features) {
      for (const entry of feature.entries) {
        if (!domainGroups.has(entry.domainName)) domainGroups.set(entry.domainName, []);
        domainGroups.get(entry.domainName)!.push(entry);
      }
    }
  }
  // Sort groups: missing/mismatch first, then alphabetically
  const sortedGroups = [...domainGroups.entries()].sort(([nameA, entriesA], [nameB, entriesB]) => {
    const hasMissingA = entriesA.some(e => !e.present && !e.optional) ? 0 : entriesA.some(e => e.valueMismatch) ? 1 : 2;
    const hasMissingB = entriesB.some(e => !e.present && !e.optional) ? 0 : entriesB.some(e => e.valueMismatch) ? 1 : 2;
    if (hasMissingA !== hasMissingB) return hasMissingA - hasMissingB;
    return nameA.localeCompare(nameB);
  });

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3, flexWrap: 'wrap' }}>
        <Button startIcon={<ArrowBackIcon />} onClick={() => navigate('/')}>Dashboard</Button>
        <Typography variant="h5" fontWeight={700}>LOB Detail</Typography>
        <Box sx={{ flex: 1 }} />

        <FormControl size="small" sx={{ minWidth: 130 }}>
          <InputLabel>Environment</InputLabel>
          <Select value={selectedEnv} label="Environment" onChange={e => { setSelectedEnv(e.target.value); setSelectedLob(''); }}>
            {environments.map(e => <MenuItem key={e.id} value={e.id}>{e.id.toUpperCase()}</MenuItem>)}
          </Select>
        </FormControl>

        <FormControl size="small" sx={{ minWidth: 180 }}>
          <InputLabel>LOB</InputLabel>
          <Select value={selectedLob} label="LOB" onChange={e => setSelectedLob(e.target.value)} disabled={!selectedEnv}>
            {currentLobs.map(l => <MenuItem key={l.id} value={l.id}>{l.label || l.id}</MenuItem>)}
          </Select>
        </FormControl>

        <Button variant="outlined" startIcon={<RefreshIcon />} onClick={runCheck} disabled={loading || !selectedLob}>
          Refresh
        </Button>

        <Button
          variant="outlined"
          startIcon={<CompareArrowsIcon />}
          onClick={() => navigate(`/diff?env=${selectedEnv}&lob1=${selectedLob}`)}
          disabled={!selectedLob}
        >
          Compare LOBs
        </Button>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {loading && (
        <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', my: 4 }}>
          <CircularProgress size={24} />
          <Typography color="text.secondary">Querying {selectedLob}...</Typography>
        </Box>
      )}

      {result && !loading && (
        <>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3, p: 2, bgcolor: '#fff', borderRadius: 2, border: '1px solid #e0e0e0' }}>
            <Box>
              <Typography variant="h6" fontWeight={700}>{result.lobId}</Typography>
              <Typography variant="caption" color="text.secondary">{result.envId.toUpperCase()} · {result.totalMetadataRows} total rows · checked {new Date(result.checkedAt).toLocaleTimeString()}</Typography>
            </Box>
            <StatusChip status={result.status} size="medium" />
            <Box sx={{ flex: 1 }} />
            <Box sx={{ textAlign: 'right' }}>
              <Typography variant="h4" fontWeight={700} color={result.score >= 90 ? 'success.main' : result.score >= 70 ? 'warning.main' : 'error.main'}>
                {result.score}%
              </Typography>
              <Typography variant="caption" color="text.secondary" display="block">
                {result.presentRequired}/{result.totalRequired} required keys correct
              </Typography>
              {result.totalMismatched > 0 && (
                <Typography variant="caption" sx={{ color: '#e65100', fontWeight: 600 }} display="block">
                  ⚠ {result.totalMismatched} value mismatch{result.totalMismatched > 1 ? 'es' : ''}
                </Typography>
              )}
            </Box>
          </Box>

          <Box sx={{ display: 'flex', gap: 1, mb: 2, flexWrap: 'wrap' }}>
            <Chip label={`${sortedGroups.length} domain_names`} size="small" variant="outlined" />
            <Chip
              label={`${sortedGroups.filter(([, e]) => e.some(x => !x.present && !x.optional)).length} with missing entries`}
              size="small" color="error" variant="outlined"
            />
            {result.totalMismatched > 0 && (
              <Chip label={`${result.totalMismatched} value mismatch`} size="small"
                sx={{ bgcolor: '#fff3e0', color: '#e65100', fontWeight: 600 }} />
            )}
          </Box>

          <TextField
            size="small"
            fullWidth
            placeholder="Search by domain_name or domain_type..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            sx={{ mb: 2, bgcolor: '#fff', borderRadius: 1 }}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon fontSize="small" sx={{ color: 'text.secondary' }} />
                </InputAdornment>
              ),
              endAdornment: searchQuery ? (
                <InputAdornment position="end">
                  <IconButton size="small" onClick={() => setSearchQuery('')}>
                    <ClearIcon fontSize="small" />
                  </IconButton>
                </InputAdornment>
              ) : null,
            }}
          />

          <Divider sx={{ mb: 2 }} />

          {sortedGroups.map(([domainName, entries]) => (
            <DomainNameCard
              key={domainName}
              domainName={domainName}
              entries={entries}
              envId={result.envId}
              lobId={result.lobId}
              searchQuery={searchQuery}
              onFixed={runCheck}
            />
          ))}
        </>
      )}
    </Box>
  );
}
