import { useQuery } from '@tanstack/react-query';
import { InfiniteRibbon } from '@/components/ui/infinite-ribbon';
import { fetchPublicOffers } from '../lib/api';

function offerLine(message: string, couponCode?: string | null) {
  const code = couponCode?.trim();
  return code ? `${message} — use code ${code}` : message;
}

type OfferChorusRibbonProps = {
  /** Mid-page print bands vs compact hero chorus. */
  variant?: 'section' | 'hero';
};

/**
 * Crossed scrolling offer chorus. Renders nothing when no active offers —
 * admin "off" means don't show this banner (no fallback copy).
 */
export function OfferChorusRibbon({ variant = 'section' }: OfferChorusRibbonProps) {
  const { data: offers = [] } = useQuery({
    queryKey: ['public', 'offers'],
    queryFn: async () => {
      const res = await fetchPublicOffers();
      if (!res.success) return [];
      return res.data ?? [];
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  const primary = offers[0];
  if (!primary) return null;

  const line = offerLine(primary.message, primary.couponCode);
  const href = primary.linkUrl?.trim() || '/#pricing';
  const rootClass =
    variant === 'hero'
      ? 'independence-ribbon independence-ribbon--hero'
      : 'independence-ribbon';

  return (
    <section className={rootClass} aria-label="Current offer">
      <a className="independence-ribbon__link" href={href}>
        <div className="independence-ribbon__stage">
          <InfiniteRibbon
            className="independence-ribbon__band independence-ribbon__band--saffron"
            duration={variant === 'hero' ? 32 : 38}
            rotation={4}
            repeat={6}
          >
            ★ {line} ★
          </InfiniteRibbon>
          <InfiniteRibbon
            className="independence-ribbon__band independence-ribbon__band--green"
            duration={variant === 'hero' ? 32 : 38}
            reverse
            rotation={-4}
            repeat={6}
          >
            ★ {line} ★
          </InfiniteRibbon>
        </div>
      </a>
    </section>
  );
}
