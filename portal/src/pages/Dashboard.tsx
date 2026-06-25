import { useEffect, useState, useCallback } from 'react';
import Box from '@mui/material/Box';
import Grid from '@mui/material/Grid';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import CardActionArea from '@mui/material/CardActionArea';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import CircularProgress from '@mui/material/CircularProgress';
import Alert from '@mui/material/Alert';
import Tooltip from '@mui/material/Tooltip';
import LinearProgress from '@mui/material/LinearProgress';
import RefreshIcon from '@mui/icons-material/Refresh';
import { useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import { StatusChip } from '../components/StatusChip';
import type { Environment, LobHealth } from '../types';

const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };

function ScoreGauge({ score }: { score: number }) {
  const color = score >= 90 ? '#388e3c' : score >= 70 ? '#f57c00' : '#d32f2f';
  return (
    <Box sx={{ position: 'relative', display: 'inline-flex' }}>
      <CircularProgress variant="determinate" value={score} size={64} thickness={5} sx={{ color }} />
      <Box sx={{ top: 0, left: 0, bottom: 0, right: 0, position: 'absolute', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Typography variant="caption" fontWeight={700} color={color}>{score}%</Typography>
      </Box>
    </Box>
  );
}

function LobCard({ lob, onClick }: { lob: LobHealth; onClick: () => void }) {
  const criticalCount = lob.features?.filter(f => f.status === 'broken' && f.severity === 'critical').length ?? 0;
  const brokenFeatures = lob.features?.filter(f => f.status !== 'healthy' && f.status !== 'partial') ?? [];

  return (
    <Card elevation={0} sx={{ border: '1px solid #e0e0e0', borderRadius: 2, height: '100%' }}>
      <CardActionArea onClick={onClick} sx={{ height: '100%', alignItems: 'flex-start' }}>
        <CardContent>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1.5 }}>
            <Box>
              <Typography fontWeight={700} variant="h6" sx={{ lineHeight: 1.2 }}>{lob.lobId}</Typography>
              <Typography variant="caption" color="text.secondary">{lob.envId.toUpperCase()}</Typography>
            </Box>
            {lob.status !== 'unreachable' && <ScoreGauge score={lob.score} />}
          </Box>

          <StatusChip status={lob.status} size="medium" />

          {lob.status === 'unreachable' && (
            <Alert severity="error" sx={{ mt: 1.5, fontSize: '0.75rem' }}>{lob.error}</Alert>
          )}

          {lob.status !== 'unreachable' && (
            <Box sx={{ mt: 1.5 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                <Typography variant="caption" color="text.secondary">
                  {lob.presentRequired}/{lob.totalRequired} required keys
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {lob.totalMetadataRows} total rows
                </Typography>
              </Box>
              <LinearProgress
                variant="determinate"
                value={(lob.presentRequired / lob.totalRequired) * 100}
                sx={{
                  height: 6,
                  borderRadius: 3,
                  bgcolor: '#e0e0e0',
                  '& .MuiLinearProgress-bar': {
                    bgcolor: lob.score >= 90 ? '#388e3c' : lob.score >= 70 ? '#f57c00' : '#d32f2f',
                  },
                }}
              />

              {criticalCount > 0 && (
                <Alert severity="error" sx={{ mt: 1, fontSize: '0.75rem', py: 0 }}>
                  {criticalCount} critical feature{criticalCount > 1 ? 's' : ''} broken
                </Alert>
              )}

              {brokenFeatures.length > 0 && (
                <Box sx={{ mt: 1 }}>
                  {brokenFeatures.slice(0, 3).map(f => (
                    <Typography key={f.name} variant="caption" display="block" color="error.main">
                      • {f.name} — {f.missingRequired} missing
                    </Typography>
                  ))}
                  {brokenFeatures.length > 3 && (
                    <Typography variant="caption" color="text.secondary">
                      +{brokenFeatures.length - 3} more
                    </Typography>
                  )}
                </Box>
              )}
            </Box>
          )}

          <Typography variant="caption" color="text.secondary" display="block" mt={1}>
            Checked {lob.checkedAt ? new Date(lob.checkedAt).toLocaleTimeString() : '—'} · {lob.durationMs}ms
          </Typography>
        </CardContent>
      </CardActionArea>
    </Card>
  );
}

export function Dashboard() {
  const navigate = useNavigate();
  const [environments, setEnvironments] = useState<Environment[]>([]);
  const [selectedEnv, setSelectedEnv] = useState('');
  const [lobResults, setLobResults] = useState<LobHealth[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api.getEnvironments()
      .then(envs => {
        setEnvironments(envs);
        if (envs.length > 0) setSelectedEnv(envs[0].id);
      })
      .catch(e => setError(e.message));
  }, []);

  const runCheck = useCallback(async () => {
    if (!selectedEnv) return;
    setLoading(true);
    setError('');
    setLobResults([]);
    try {
      const env = environments.find(e => e.id === selectedEnv);
      if (!env) return;
      const results = await Promise.all(env.lobs.map(l => api.checkLob(selectedEnv, l.id)));
      setLobResults(results.sort((a, b) => a.score - b.score));
    } catch (e: unknown) {
      const err = e as { message?: string };
      setError(err?.message || 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [selectedEnv, environments]);

  useEffect(() => {
    if (selectedEnv) runCheck();
  }, [selectedEnv]);

  const sortedFeatureNames = [...new Set(
    lobResults.flatMap(l => l.features?.map(f => f.name) ?? [])
  )].sort((a, b) => {
    const fa = lobResults[0]?.features?.find(f => f.name === a);
    const fb = lobResults[0]?.features?.find(f => f.name === b);
    return (severityOrder[fa?.severity ?? 'low'] ?? 9) - (severityOrder[fb?.severity ?? 'low'] ?? 9);
  });

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
        <Typography variant="h5" fontWeight={700}>Health Dashboard</Typography>
        <Box sx={{ flex: 1 }} />
        <FormControl size="small" sx={{ minWidth: 140 }}>
          <InputLabel>Environment</InputLabel>
          <Select value={selectedEnv} label="Environment" onChange={e => setSelectedEnv(e.target.value)}>
            {environments.map(e => <MenuItem key={e.id} value={e.id}>{e.id.toUpperCase()}</MenuItem>)}
          </Select>
        </FormControl>
        <Tooltip title="Re-run health checks">
          <Button variant="outlined" startIcon={<RefreshIcon />} onClick={runCheck} disabled={loading}>
            {loading ? 'Checking...' : 'Refresh'}
          </Button>
        </Tooltip>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {loading && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, my: 4 }}>
          <CircularProgress size={24} />
          <Typography color="text.secondary">Querying databases...</Typography>
        </Box>
      )}

      {!loading && lobResults.length > 0 && (
        <>
          <Grid container spacing={2} sx={{ mb: 4 }}>
            {lobResults.map(lob => (
              <Grid item xs={12} sm={6} md={4} key={lob.lobId}>
                <LobCard
                  lob={lob}
                  onClick={() => navigate(`/lob?env=${selectedEnv}&lob=${lob.lobId}`)}
                />
              </Grid>
            ))}
          </Grid>

          {/* Feature × LOB grid */}
          <Typography variant="h6" fontWeight={600} mb={2}>Feature Health Matrix</Typography>
          <Box sx={{ overflowX: 'auto' }}>
            <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 13 }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', padding: '8px 12px', background: '#f5f5f5', borderBottom: '2px solid #e0e0e0', minWidth: 200 }}>Feature</th>
                  {lobResults.map(l => (
                    <th key={l.lobId} style={{ padding: '8px 12px', background: '#f5f5f5', borderBottom: '2px solid #e0e0e0', textAlign: 'center' }}>
                      {l.lobId}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sortedFeatureNames.map((name, i) => (
                  <tr key={name} style={{ background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                    <td style={{ padding: '6px 12px', borderBottom: '1px solid #f0f0f0', fontWeight: 500 }}>{name}</td>
                    {lobResults.map(lob => {
                      const f = lob.features?.find(ff => ff.name === name);
                      const bg = !f ? '#f5f5f5' : f.status === 'healthy' ? '#e8f5e9' : f.status === 'partial' ? '#fff8e1' : '#ffebee';
                      const symbol = !f ? '—' : f.status === 'healthy' ? '✓' : f.missingRequired > 0 ? `✗ ${f.missingRequired}` : `⚠ ${f.missingOptional}`;
                      return (
                        <td
                          key={lob.lobId}
                          style={{ padding: '6px 12px', borderBottom: '1px solid #f0f0f0', textAlign: 'center', background: bg, cursor: 'pointer' }}
                          onClick={() => navigate(`/lob?env=${selectedEnv}&lob=${lob.lobId}&feature=${encodeURIComponent(name)}`)}
                        >
                          {symbol}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </Box>
        </>
      )}
    </Box>
  );
}
