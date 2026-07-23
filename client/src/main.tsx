import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GoogleOAuthProvider } from '@react-oauth/google';
import { AppLayout } from './App';
import { AdminLayout } from './admin/AdminLayout';
import { AdminOverviewPage } from './admin/AdminOverviewPage';
import { AdminUsersPage } from './admin/AdminUsersPage';
import { AdminSubscriptionsPage } from './admin/AdminSubscriptionsPage';
import { AdminPaymentsPage } from './admin/AdminPaymentsPage';
import { AdminPlansPage } from './admin/AdminPlansPage';
import { AdminAuditPage } from './admin/AdminAuditPage';
import { AuthPage } from './pages/AuthPage';
import { LandingPage } from './pages/LandingPage';
import { DashboardPage } from './pages/DashboardPage';
import { ComingSoonPage } from './pages/ComingSoonPage';
import { GetStartedPage } from './pages/GetStartedPage';
import { TrackerPage } from './pages/TrackerPage';
import { SettingsPage } from './pages/SettingsPage';
import { ProfilePage } from './pages/ProfilePage';
import './styles.css';
import './admin/admin.css';

const queryClient = new QueryClient();
const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID ?? '';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <GoogleOAuthProvider clientId={googleClientId}>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route path="/login" element={<AuthPage mode="login" />} />
            <Route path="/register" element={<AuthPage mode="register" />} />
            <Route element={<AppLayout />}>
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route path="/applications" element={<DashboardPage />} />
              <Route path="/get-started" element={<GetStartedPage />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="/tracker" element={<TrackerPage />} />
              <Route
                path="/browse"
                element={
                  <ComingSoonPage
                    title="Browse jobs"
                    blurb="Job browsing inside Cosmo is coming soon. Use the Naukri co-pilot to scan matches for now."
                  />
                }
              />
              <Route path="/profile" element={<ProfilePage />} />
            </Route>
            <Route path="/admin" element={<AdminLayout />}>
              <Route index element={<AdminOverviewPage />} />
              <Route path="users" element={<AdminUsersPage />} />
              <Route path="subscriptions" element={<AdminSubscriptionsPage />} />
              <Route path="payments" element={<AdminPaymentsPage />} />
              <Route path="plans" element={<AdminPlansPage />} />
              <Route path="audit" element={<AdminAuditPage />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </QueryClientProvider>
    </GoogleOAuthProvider>
  </StrictMode>
);
