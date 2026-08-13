import { useQuery } from '@tanstack/react-query';
import { InfiniteRibbon } from '@/components/ui/infinite-ribbon';
import { fetchPublicOffers } from '../lib/api';

const FALLBACK =
  'Independence Day Sale — 40% off Pro & Max · use code INDY40 · Apply faster with Cosmo';

function offerLine(message: string, couponCode?: string | null) {
  const code = couponCode?.trim();
  return code ? `${message} — use code ${code}` : message;
}

/** Crossed Independence Day offer ribbons between Get Started and install. */
export function IndependenceOfferRibbon() {
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
  const line = primary
    ? offerLine(primary.message, primary.couponCode)
    : FALLBACK;
  const href = primary?.linkUrl?.trim() || '/#pricing';

  return (
    <section
      className="independence-ribbon"
      aria-label="Independence Day offer"
    >
      <a className="independence-ribbon__link" href={href}>
        <div className="independence-ribbon__stage">
          <InfiniteRibbon
            className="independence-ribbon__band independence-ribbon__band--saffron"
            duration={38}
            rotation={4}
            repeat={6}
          >
            ★ {line} ★
          </InfiniteRibbon>
          <InfiniteRibbon
            className="independence-ribbon__band independence-ribbon__band--green"
            duration={38}
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
