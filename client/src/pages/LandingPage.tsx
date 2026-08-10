import { Navigate } from 'react-router-dom';
import { HeroAutoApply } from '../components/HeroAutoApply';
import { JobSearchSteps } from '../components/JobSearchSteps';
import { LandingTextLoop } from '../components/LandingTextLoop';
import { LandingNavbar } from '../components/LandingNavbar';
import { LandingTutorialSection } from '../components/LandingTutorialSection';
import { CosmosDreamFooter } from '../components/CosmosDreamFooter';
import { PricingPlans } from '../components/PricingPlans';
import { RateUsSection } from '../components/RateUsSection';
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

      <LandingTextLoop />

      <JobSearchSteps />

      <LandingTutorialSection />

      <TestimonialMasonry />

      <PricingPlans />

      <RateUsSection />

      <div id="get-extension">
        <CosmosDreamFooter />
      </div>
    </div>
  );
}
