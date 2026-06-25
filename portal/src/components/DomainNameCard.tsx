import { useState } from 'react';
import Accordion from '@mui/material/Accordion';
import AccordionSummary from '@mui/material/AccordionSummary';
import AccordionDetails from '@mui/material/AccordionDetails';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Chip from '@mui/material/Chip';
import Table from '@mui/material/Table';
import TableHead from '@mui/material/TableHead';
import TableBody from '@mui/material/TableBody';
import TableRow from '@mui/material/TableRow';
import TableCell from '@mui/material/TableCell';
import TableSortLabel from '@mui/material/TableSortLabel';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CancelIcon from '@mui/icons-material/Cancel';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import BuildIcon from '@mui/icons-material/Build';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import type { MetadataEntry } from '../types';
import { JsonViewerDialog } from './JsonViewerDialog';
import { MetadataEditor } from './MetadataEditor';

interface Props {
  domainName: string;
  entries: MetadataEntry[];
  envId: string;
  lobId: string;
  searchQuery?: string;
  onFixed?: () => void;
}

type SortDir = 'asc' | 'desc';

function rowStyle(entry: MetadataEntry) {
  if (entry.present && entry.valueMismatch)
    return { bgcolor: '#fff8e1', borderLeft: '4px solid #ff9800', '&:hover': { bgcolor: '#fff3cd', cursor: 'pointer' } };
  if (entry.present)
    return { bgcolor: '#f0fdf4', borderLeft: '4px solid #22c55e', '&:hover': { bgcolor: '#dcfce7', cursor: 'pointer' } };
  if (entry.optional)
    return { bgcolor: '#fffbeb', borderLeft: '4px solid #f59e0b', '&:hover': { bgcolor: '#fef3c7', cursor: 'pointer' } };
  return { bgcolor: '#fff0f0', borderLeft: '4px solid #ef4444', '&:hover': { bgcolor: '#fecaca', cursor: 'pointer' } };
}

function StatusIcon({ entry }: { entry: MetadataEntry }) {
  if (entry.present && entry.valueMismatch)
    return <Tooltip title="Value differs from snapshot"><ErrorOutlineIcon fontSize="small" sx={{ color: '#ff9800', display: 'block' }} /></Tooltip>;
  if (entry.present)
    return <CheckCircleIcon fontSize="small" sx={{ color: '#22c55e', display: 'block' }} />;
  if (entry.optional)
    return <WarningAmberIcon fontSize="small" sx={{ color: '#f59e0b', display: 'block' }} />;
  return <CancelIcon fontSize="small" sx={{ color: '#ef4444', display: 'block' }} />;
}

export function DomainNameCard({ domainName, entries, envId, lobId, searchQuery = '', onFixed }: Props) {
  const [viewEntry, setViewEntry] = useState<MetadataEntry | null>(null);
  const [editorEntry, setEditorEntry] = useState<MetadataEntry | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  const q = searchQuery.toLowerCase().trim();

  const visible = entries
    .filter(e => !q || e.domainName.toLowerCase().includes(q) || e.domainType.toLowerCase().includes(q))
    .slice()
    .sort((a, b) => sortDir === 'asc' ? a.domainType.localeCompare(b.domainType) : b.domainType.localeCompare(a.domainType));

  if (q && visible.length === 0) return null;

  const missing  = entries.filter(e => !e.present && !e.optional).length;
  const mismatched = entries.filter(e => e.valueMismatch).length;
  const present  = entries.filter(e => e.present).length;

  const borderColor = missing > 0 ? '#fecaca' : mismatched > 0 ? '#fed7aa' : '#bbf7d0';
  const headerBg    = missing > 0 ? '#fff5f5' : mismatched > 0 ? '#fff8e1' : '#f0fdf4';
  const defaultExpanded = missing > 0 || mismatched > 0 || !!q;

  return (
    <>
      <Accordion
        disableGutters
        elevation={0}
        defaultExpanded={defaultExpanded}
        sx={{
          border: '1px solid',
          borderColor,
          borderRadius: '8px !important',
          mb: 1.5,
          '&:before': { display: 'none' },
          overflow: 'hidden',
        }}
      >
        <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{ bgcolor: headerBg }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, width: '100%', pr: 1 }}>
            {missing > 0
              ? <CancelIcon sx={{ color: '#ef4444' }} />
              : mismatched > 0
                ? <ErrorOutlineIcon sx={{ color: '#ff9800' }} />
                : <CheckCircleIcon sx={{ color: '#22c55e' }} />}

            <Typography fontWeight={700} fontFamily="monospace" fontSize="0.95rem">
              {domainName}
            </Typography>

            <Box sx={{ flex: 1 }} />

            {missing > 0 && (
              <Chip label={`${missing} missing`} size="small" color="error" />
            )}
            {mismatched > 0 && (
              <Chip label={`${mismatched} mismatch`} size="small" sx={{ bgcolor: '#fff3e0', color: '#e65100', fontWeight: 600 }} />
            )}
            <Chip
              label={q ? `${visible.length} of ${entries.length}` : `${present}/${entries.length}`}
              size="small"
              variant="outlined"
              sx={{ fontFamily: 'monospace', fontSize: '0.7rem' }}
            />
          </Box>
        </AccordionSummary>

        <AccordionDetails sx={{ p: 0 }}>
          <Table size="small">
            <TableHead>
              <TableRow sx={{ bgcolor: '#fafafa' }}>
                <TableCell sx={{ fontWeight: 700, fontSize: '0.72rem', color: 'text.secondary', width: 36, pl: 2 }}>
                  STATUS
                </TableCell>
                <TableCell sx={{ fontWeight: 700, fontSize: '0.72rem', color: 'text.secondary' }}>
                  <TableSortLabel
                    active
                    direction={sortDir}
                    onClick={() => setSortDir(d => d === 'asc' ? 'desc' : 'asc')}
                    sx={{ fontSize: '0.72rem', fontWeight: 700, color: 'text.secondary', '&.Mui-active': { color: 'text.primary' } }}
                  >
                    domain_type
                  </TableSortLabel>
                </TableCell>
                <TableCell sx={{ fontWeight: 700, fontSize: '0.72rem', color: 'text.secondary' }}>
                  DESCRIPTION
                </TableCell>
                <TableCell sx={{ width: 48, pr: 2 }} />
              </TableRow>
            </TableHead>
            <TableBody>
              {visible.map(entry => (
                <TableRow
                  key={entry.domainType}
                  onClick={() => setViewEntry(entry)}
                  sx={rowStyle(entry)}
                >
                  <TableCell sx={{ pl: 2, py: 1.2 }}>
                    <StatusIcon entry={entry} />
                  </TableCell>

                  <TableCell sx={{ py: 1.2 }}>
                    <Typography
                      variant="body2"
                      fontFamily="monospace"
                      sx={{
                        color: entry.present && entry.valueMismatch ? '#b45309'
                          : entry.present ? '#166534'
                          : entry.optional ? '#92400e'
                          : '#991b1b',
                      }}
                    >
                      {entry.domainType}
                    </Typography>
                  </TableCell>

                  <TableCell sx={{ py: 1.2 }}>
                    <Typography variant="caption" color="text.secondary">{entry.description}</Typography>
                    {entry.optional && (
                      <Chip label="optional" size="small" variant="outlined" sx={{ ml: 1, fontSize: '0.6rem', height: 18 }} />
                    )}
                  </TableCell>

                  <TableCell sx={{ py: 1.2, pr: 2 }} onClick={e => e.stopPropagation()}>
                    {!entry.present ? (
                      <Tooltip title="Fix this entry">
                        <IconButton size="small" color="error"
                          onClick={e => { e.stopPropagation(); setEditorEntry(entry); }}>
                          <BuildIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    ) : (
                      <Tooltip title="View JSON payload">
                        <IconButton size="small"
                          sx={{ color: entry.valueMismatch ? '#ff9800' : '#22c55e' }}
                          onClick={e => { e.stopPropagation(); setViewEntry(entry); }}>
                          <OpenInNewIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </AccordionDetails>
      </Accordion>

      {viewEntry && (
        <JsonViewerDialog
          entry={viewEntry}
          lobId={lobId}
          onClose={() => setViewEntry(null)}
          onFix={!viewEntry.present ? () => { setViewEntry(null); setEditorEntry(viewEntry); } : undefined}
          onUpdated={() => { setViewEntry(null); onFixed?.(); }}
        />
      )}
      {editorEntry && (
        <MetadataEditor
          entry={editorEntry}
          envId={envId}
          lobId={lobId}
          onClose={() => setEditorEntry(null)}
          onFixed={() => { setEditorEntry(null); onFixed?.(); }}
        />
      )}
    </>
  );
}
