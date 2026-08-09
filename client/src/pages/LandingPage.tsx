import { Navigate } from 'react-router-dom';
import { HeroAutoApply } from '../components/HeroAutoApply';
import { JobSearchSteps } from '../components/JobSearchSteps';
import { LandingNavbar } from '../components/LandingNavbar';
import { CosmosDreamFooter } from '../components/CosmosDreamFooter';
import { PricingPlans } from '../components/PricingPlans';
import { SeoHead } from '../components/SeoHead';
import { SproutJobsMarquee } from '../components/SproutJobsMarquee';
import { TestimonialMasonry } from '../components/TestimonialMasonry';
import { TrustedCompanyMarquee } from '../components/TrustedCompanyMarquee';
import {
  organizationJsonLd,
  softwareApplicationJsonLd,
  websiteJsonLd,
} from '../lib/jsonLd';
import { DEFAULT_DESCRIPTION, DEFAULT_TITLE } from '../lib/seo';
import { useAuthStore } from '../store/authStore';
import '../styles/landing-fonts.css';

export function LandingPage() {
  const accessToken = useAuthStore((s) => s.accessToken);
  if (accessToken) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div className="landing" id="top">
      <SeoHead
        title={DEFAULT_TITLE}
        description={DEFAULT_DESCRIPTION}
        path="/"
        noBrandSuffix
        jsonLd={[
          organizationJsonLd(),
          websiteJsonLd(),
          softwareApplicationJsonLd(),
        ]}
      />
      <LandingNavbar />

      <HeroAutoApply />

      <TrustedCompanyMarquee />

      <SproutJobsMarquee />

      <JobSearchSteps />

      <TestimonialMasonry />

      <PricingPlans />

      <div id="get-extension">
        <CosmosDreamFooter />
      </div>
    </div>
  );
}
