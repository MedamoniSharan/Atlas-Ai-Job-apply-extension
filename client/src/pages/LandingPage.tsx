import { Navigate } from 'react-router-dom';
import { ChromeInstallCta } from '../components/ChromeInstallCta';
import { HeroAutoApply } from '../components/HeroAutoApply';
import { JobSearchSteps } from '../components/JobSearchSteps';
import { LandingNavbar } from '../components/LandingNavbar';
import { SproutJobsMarquee } from '../components/SproutJobsMarquee';
import { TrustedCompanyMarquee } from '../components/TrustedCompanyMarquee';
import { useAuthStore } from '../store/authStore';

export function LandingPage() {
  const accessToken = useAuthStore((s) => s.accessToken);
  if (accessToken) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div className="landing" id="top">
      <LandingNavbar />

      <HeroAutoApply />

      <TrustedCompanyMarquee />

      <SproutJobsMarquee />

      <JobSearchSteps />

      <div id="get-extension">
        <ChromeInstallCta />
      </div>
    </div>
  );
}
