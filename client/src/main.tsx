import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AppLayout } from './App';
import { AuthPage } from './pages/AuthPage';
import { DashboardPage } from './pages/DashboardPage';
import { ComingSoonPage } from './pages/ComingSoonPage';
import { GetStartedPage } from './pages/GetStartedPage';
import { TrackerPage } from './pages/TrackerPage';
import { SettingsPage } from './pages/SettingsPage';
import './styles.css';

const queryClient = new QueryClient();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<AuthPage mode="login" />} />
          <Route path="/register" element={<AuthPage mode="register" />} />
          <Route element={<AppLayout />}>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/applications" element={<DashboardPage />} />
            <Route path="/get-started" element={<GetStartedPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/tracker" element={<TrackerPage />} />
            <Route
              path="/browse"
              element={
                <ComingSoonPage
                  title="Browse jobs"
                  blurb="Job browsing inside Tsenta is coming soon. Use the Naukri co-pilot to scan matches for now."
                />
              }
            />
            <Route
              path="/inbox"
              element={
                <ComingSoonPage
                  title="Inbox"
                  blurb="Recruiter messages and replies will land here. Not available in this MVP."
                />
              }
            />
            <Route
              path="/profile"
              element={
                <ComingSoonPage
                  title="Profile"
                  blurb="Profile editing will live here. Manage account details under Settings today."
                />
              }
            />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>
);
