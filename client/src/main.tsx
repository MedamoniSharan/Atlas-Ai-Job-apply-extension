import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GoogleOAuthProvider } from '@react-oauth/google';
import { HelmetProvider } from 'react-helmet-async';
import { AppLayout } from './App';
import { AdminLayout } from './admin/AdminLayout';
import { AdminOverviewPage } from './admin/AdminOverviewPage';
import { AdminUsersPage } from './admin/AdminUsersPage';
import { AdminSubscriptionsPage } from './admin/AdminSubscriptionsPage';
import { AdminPaymentsPage } from './admin/AdminPaymentsPage';
import { AdminPlansPage } from './admin/AdminPlansPage';
import { AdminOffersPage } from './admin/AdminOffersPage';
import { AdminCouponsPage } from './admin/AdminCouponsPage';
import { AdminAuditPage } from './admin/AdminAuditPage';
import { AdminFeedbackPage } from './admin/AdminFeedbackPage';
import { AdminLoginPage } from './admin/AdminLoginPage';
import { AuthPage } from './pages/AuthPage';
import { LandingPage } from './pages/LandingPage';
import { DashboardPage } from './pages/DashboardPage';
import { ApplicationsPage } from './pages/ApplicationsPage';
import { CompaniesPage } from './pages/CompaniesPage';
import { CompanyDetailPage } from './pages/CompanyDetailPage';
import { GetStartedPage } from './pages/GetStartedPage';
import { TrackerPage } from './pages/TrackerPage';
import { SettingsPage } from './pages/SettingsPage';
import { ProfilePage } from './pages/ProfilePage';
import { LegalPage } from './pages/LegalPage';
import { SupportPage } from './pages/SupportPage';
import { UninstallFeedbackPage } from './pages/UninstallFeedbackPage';
import { FaqPage } from './pages/FaqPage';
import { BlogIndexPage } from './pages/BlogIndexPage';
import { BlogPostPage } from './pages/BlogPostPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { googleClientId } from './lib/googleAuth';
import './styles.css';
import './styles/tailwind.css';
import './admin/admin.css';

const queryClient = new QueryClient();
const googleId = googleClientId();

const app = (
  <HelmetProvider>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/login" element={<AuthPage mode="login" />} />
          <Route path="/register" element={<AuthPage mode="register" />} />
          <Route path="/privacy" element={<LegalPage kind="privacy" />} />
          <Route path="/terms" element={<LegalPage kind="terms" />} />
          <Route path="/support" element={<SupportPage />} />
          <Route path="/uninstall" element={<UninstallFeedbackPage />} />
          <Route path="/faq" element={<FaqPage />} />
          <Route path="/blog" element={<BlogIndexPage />} />
          <Route path="/blog/:slug" element={<BlogPostPage />} />
          <Route path="/admin/login" element={<AdminLoginPage />} />
          <Route element={<AppLayout />}>
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/applications" element={<ApplicationsPage />} />
            <Route path="/companies" element={<CompaniesPage />} />
            <Route path="/companies/:companyKey" element={<CompanyDetailPage />} />
            <Route path="/get-extension" element={<GetStartedPage />} />
            <Route
              path="/get-started"
              element={<Navigate to="/get-extension" replace />}
            />
            <Route path="/browse" element={<Navigate to="/companies" replace />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/tracker" element={<TrackerPage />} />
            <Route path="/profile" element={<ProfilePage />} />
          </Route>
          <Route path="/admin" element={<AdminLayout />}>
            <Route index element={<AdminOverviewPage />} />
            <Route path="users" element={<AdminUsersPage />} />
            <Route path="subscriptions" element={<AdminSubscriptionsPage />} />
            <Route path="payments" element={<AdminPaymentsPage />} />
            <Route path="plans" element={<AdminPlansPage />} />
            <Route path="offers" element={<AdminOffersPage />} />
            <Route path="coupons" element={<AdminCouponsPage />} />
            <Route path="audit" element={<AdminAuditPage />} />
            <Route path="feedback" element={<AdminFeedbackPage />} />
          </Route>
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  </HelmetProvider>
);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {googleId ? (
      <GoogleOAuthProvider clientId={googleId}>{app}</GoogleOAuthProvider>
    ) : (
      app
    )}
  </StrictMode>
);
document.documentElement.classList.add('app-ready');
