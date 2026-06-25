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
import type { FeatureHealth, MetadataEntry } from '../types';
import { MetadataEditor } from './MetadataEditor';
import { JsonViewerDialog } from './JsonViewerDialog';

const severityColor: Record<string, string> = {
  critical: '#d32f2f',
  high: '#f57c00',
  medium: '#1976d2',
  low: '#388e3c',
};

interface Props {
  feature: FeatureHealth;
  envId: string;
  lobId: string;
  searchQuery?: string;
  onFixed?: () => void;
}

type SortCol = 'domain_name' | 'domain_type';
type SortDir = 'asc' | 'desc';

function entryRowStyle(entry: MetadataEntry) {
  if (entry.present && entry.valueMismatch) {
    return {
      bgcolor: '#fff8e1',
      borderLeft: '4px solid #ff9800',
      '&:hover': { bgcolor: '#fff3cd', cursor: 'pointer' },
    };
  }
  if (entry.present) {
    return {
      bgcolor: '#f0fdf4',
      borderLeft: '4px solid #22c55e',
      '&:hover': { bgcolor: '#dcfce7', cursor: 'pointer' },
    };
  }
  if (entry.optional) {
    return {
      bgcolor: '#fffbeb',
      borderLeft: '4px solid #f59e0b',
      '&:hover': { bgcolor: '#fef3c7', cursor: 'pointer' },
    };
  }
  return {
    bgcolor: '#fff0f0',
    borderLeft: '4px solid #ef4444',
    '&:hover': { bgcolor: '#fecaca', cursor: 'pointer' },
  };
}

export function FeatureStatusCard({ feature, envId, lobId, searchQuery = '', onFixed }: Props) {
  const [viewEntry, setViewEntry] = useState<MetadataEntry | null>(null);
  const [editorEntry, setEditorEntry] = useState<MetadataEntry | null>(null);
  const [sortCol, setSortCol] = useState<SortCol>('domain_name');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  const handleSort = (col: SortCol) => {
    if (sortCol === col) {
      setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortCol(col);
      setSortDir('asc');
    }
  };

  const q = searchQuery.toLowerCase().trim();

  const visibleEntries = feature.entries
    .filter(e =>
      !q ||
      e.domainName.toLowerCase().includes(q) ||
      e.domainType.toLowerCase().includes(q)
    )
    .slice()
    .sort((a, b) => {
      const aVal = sortCol === 'domain_name' ? a.domainName : a.domainType;
      const bVal = sortCol === 'domain_name' ? b.domainName : b.domainType;
      return sortDir === 'asc'
        ? aVal.localeCompare(bVal)
        : bVal.localeCompare(aVal);
    });

  if (q && visibleEntries.length === 0) return null;

  const defaultExpanded = feature.missingRequired > 0 || feature.mismatchedValues > 0 || feature.status === 'broken' || feature.status === 'degraded' || !!q;

  const statusIcon =
    feature.status === 'healthy'
      ? <CheckCircleIcon sx={{ color: '#22c55e' }} />
      : feature.status === 'partial'
        ? <WarningAmberIcon sx={{ color: '#f59e0b' }} />
        : <CancelIcon sx={{ color: '#ef4444' }} />;

  return (
    <>
      <Accordion
        disableGutters
        elevation={0}
        defaultExpanded={defaultExpanded}
        sx={{
          border: '1px solid',
          borderColor: feature.status === 'healthy' ? '#bbf7d0' : feature.status === 'partial' ? '#fde68a' : '#fecaca',
          borderRadius: '8px !important',
          mb: 1.5,
          '&:before': { display: 'none' },
          overflow: 'hidden',
        }}
      >
        <AccordionSummary
          expandIcon={<ExpandMoreIcon />}
          sx={{
            bgcolor: feature.status === 'healthy' ? '#f0fdf4' : feature.status === 'partial' ? '#fffbeb' : '#fff5f5',
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, width: '100%', pr: 1 }}>
            {statusIcon}
            <Box sx={{ flex: 1 }}>
              <Typography fontWeight={600}>{feature.name}</Typography>
              <Typography variant="caption" color="text.secondary">{feature.description}</Typography>
            </Box>
            <Chip
              label={feature.severity.toUpperCase()}
              size="small"
              sx={{ bgcolor: severityColor[feature.severity] + '18', color: severityColor[feature.severity], fontWeight: 700, fontSize: '0.65rem' }}
            />
            {feature.missingRequired > 0 && (
              <Chip label={`${feature.missingRequired} missing`} size="small" color="error" />
            )}
            {feature.mismatchedValues > 0 && (
              <Chip label={`${feature.mismatchedValues} mismatch`} size="small" sx={{ bgcolor: '#fff3e0', color: '#e65100', fontWeight: 600 }} />
            )}
            {feature.missingRequired === 0 && feature.missingOptional > 0 && (
              <Chip label={`${feature.missingOptional} optional`} size="small" color="warning" variant="outlined" />
            )}
            <Chip
              label={q ? `${visibleEntries.length} of ${feature.entries.length}` : `${feature.entries.filter(e => e.present).length}/${feature.entries.length}`}
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
                    active={sortCol === 'domain_name'}
                    direction={sortCol === 'domain_name' ? sortDir : 'asc'}
                    onClick={() => handleSort('domain_name')}
                    sx={{ fontSize: '0.72rem', fontWeight: 700, color: 'text.secondary', '&.Mui-active': { color: 'text.primary' } }}
                  >
                    domain_name
                  </TableSortLabel>
                </TableCell>

                <TableCell sx={{ fontWeight: 700, fontSize: '0.72rem', color: 'text.secondary' }}>
                  <TableSortLabel
                    active={sortCol === 'domain_type'}
                    direction={sortCol === 'domain_type' ? sortDir : 'asc'}
                    onClick={() => handleSort('domain_type')}
                    sx={{ fontSize: '0.72rem', fontWeight: 700, color: 'text.secondary', '&.Mui-active': { color: 'text.primary' } }}
                  >
                    domain_type
                  </TableSortLabel>
                </TableCell>

                <TableCell sx={{ fontWeight: 700, fontSize: '0.72rem', color: 'text.secondary' }}>
                  DESCRIPTION
                </TableCell>
                <TableCell sx={{ fontWeight: 700, fontSize: '0.72rem', color: 'text.secondary', width: 48, pr: 2 }} />
              </TableRow>
            </TableHead>
            <TableBody>
              {visibleEntries.map(entry => (
                <TableRow
                  key={`${entry.domainName}::${entry.domainType}`}
                  onClick={() => setViewEntry(entry)}
                  sx={entryRowStyle(entry)}
                >
                  <TableCell sx={{ pl: 2, py: 1.2 }}>
                    {entry.present && entry.valueMismatch
                      ? <Tooltip title="Value differs from reference snapshot"><ErrorOutlineIcon fontSize="small" sx={{ color: '#ff9800', display: 'block' }} /></Tooltip>
                      : entry.present
                        ? <CheckCircleIcon fontSize="small" sx={{ color: '#22c55e', display: 'block' }} />
                        : entry.optional
                          ? <WarningAmberIcon fontSize="small" sx={{ color: '#f59e0b', display: 'block' }} />
                          : <CancelIcon fontSize="small" sx={{ color: '#ef4444', display: 'block' }} />}
                  </TableCell>

                  <TableCell sx={{ py: 1.2 }}>
                    <Typography
                      variant="body2"
                      fontFamily="monospace"
                      fontWeight={600}
                      sx={{ color: entry.present ? '#15803d' : entry.optional ? '#b45309' : '#b91c1c' }}
                    >
                      {entry.domainName}
                    </Typography>
                  </TableCell>

                  <TableCell sx={{ py: 1.2 }}>
                    <Typography
                      variant="body2"
                      fontFamily="monospace"
                      sx={{ color: entry.present ? '#166534' : entry.optional ? '#92400e' : '#991b1b' }}
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
                        <IconButton
                          size="small"
                          color="error"
                          onClick={e => { e.stopPropagation(); setEditorEntry(entry); }}
                        >
                          <BuildIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    ) : (
                      <Tooltip title="View JSON payload">
                        <IconButton
                          size="small"
                          sx={{ color: '#22c55e' }}
                          onClick={e => { e.stopPropagation(); setViewEntry(entry); }}
                        >
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
