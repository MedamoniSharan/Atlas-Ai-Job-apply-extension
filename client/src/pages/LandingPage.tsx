import { Navigate } from 'react-router-dom';
import { HeroAutoApply } from '../components/HeroAutoApply';
import { JobSearchSteps } from '../components/JobSearchSteps';
import { LandingNavbar } from '../components/LandingNavbar';
import { CosmosDreamFooter } from '../components/CosmosDreamFooter';
import { PricingPlans } from '../components/PricingPlans';
import { SproutJobsMarquee } from '../components/SproutJobsMarquee';
import { TrustedCompanyMarquee } from '../components/TrustedCompanyMarquee';
import { useAuthStore } from '../store/authStore';
import '../styles/landing-fonts.css';

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

      <PricingPlans />

      <div id="get-extension">
        <CosmosDreamFooter />
      </div>
    </div>
  );
}
