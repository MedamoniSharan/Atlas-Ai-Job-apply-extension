import { ExternalLink, Star } from 'lucide-react';
import { CHROME_EXTENSION_URL } from '../lib/chromeExtension';
import LightTunnel from './LightTunnel';

const PRODUCT_HUNT_URL =
  'https://www.producthunt.com/products/cosmo-job-assistant?utm_source=badge-featured&utm_medium=badge&utm_campaign=badge-cosmo-job-assistant';

const CHROME_REVIEW_URL = `${CHROME_EXTENSION_URL.replace(/\/?$/, '')}/reviews`;

const rateLinks = [
  {
    id: 'chrome',
    href: CHROME_REVIEW_URL,
    title: 'Rate on Chrome Web Store',
    description: 'Leave a star rating and review for Cosmo Job Assistant.',
    cta: 'Rate extension',
    mark: '/browser-logos/chrome.svg',
  },
  {
    id: 'producthunt',
    href: PRODUCT_HUNT_URL,
    title: 'Support us on Product Hunt',
    description: 'Upvote Cosmo and leave feedback on our Product Hunt page.',
    cta: 'Open Product Hunt',
    mark: '/browser-logos/producthunt.png',
  },
] as const;

export function RateUsSection() {
  return (
    <section className="rate-us" id="rate-us" aria-labelledby="rate-us-heading">
      <div className="rate-us__bg" aria-hidden="true">
        <LightTunnel
          cableColor="#2f8f6b"
          pulseColor="#ffb800"
          tunnelColor="#15362b"
          tunnelOpacity={0}
          speed={0.1}
          flowDirection="outward"
          pulseSpeed={2}
          pulseLength={0.28}
          pulseBlend={1}
          pulseWidth={1}
          cableCount={20}
          thickness={0.35}
          rimWidth={0.15}
          waviness={0.3}
          sway={0.5}
          size={1.0}
          centerX={0.0}
          centerY={0.0}
          glow={1.0}
          fadeNear={0.5}
          fadeFar={2}
          brightness={0.9}
          colorVariance
          grain
          grainIntensity={0.04}
          opacity={0.55}
          mouseInteraction={false}
        />
      </div>

      <div className="rate-us__inner">
        <div className="rate-us__intro">
          <p className="rate-us__stars" aria-hidden="true">
            {Array.from({ length: 5 }, (_, i) => (
              <Star
                key={i}
                size={20}
                strokeWidth={1.5}
                color="#FFB800"
                fill="#FFB800"
              />
            ))}
          </p>
          <h2 id="rate-us-heading">Enjoying Cosmo? Rate us</h2>
          <p>
            A quick review on the Chrome Web Store or Product Hunt helps more
            job seekers find Cosmo.
          </p>
        </div>

        <div className="rate-us__grid">
          {rateLinks.map((link) => (
            <a
              key={link.id}
              className="rate-us__link"
              href={link.href}
              target="_blank"
              rel="noopener noreferrer"
            >
              <span className="rate-us__mark" aria-hidden="true">
                <img src={link.mark} alt="" width={32} height={32} />
              </span>
              <span className="rate-us__copy">
                <strong>{link.title}</strong>
                <small>{link.description}</small>
              </span>
              <span className="rate-us__cta">
                {link.cta}
                <ExternalLink size={14} strokeWidth={2.2} aria-hidden="true" />
              </span>
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}
