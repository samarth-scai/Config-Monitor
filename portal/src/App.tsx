import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import { Layout } from './components/Layout';
import { Dashboard } from './pages/Dashboard';
import { LobDetail } from './pages/LobDetail';
import { CrossLobDiff } from './pages/CrossLobDiff';

const theme = createTheme({
  typography: {
    fontFamily: 'Inter, system-ui, sans-serif',
  },
  palette: {
    background: { default: '#f5f6fa' },
  },
  components: {
    MuiCard: { defaultProps: { elevation: 0 } },
    MuiButton: { defaultProps: { disableElevation: true } },
  },
});

export default function App() {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <BrowserRouter>
        <Layout>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/lob" element={<LobDetail />} />
            <Route path="/diff" element={<CrossLobDiff />} />
          </Routes>
        </Layout>
      </BrowserRouter>
    </ThemeProvider>
  );
}
