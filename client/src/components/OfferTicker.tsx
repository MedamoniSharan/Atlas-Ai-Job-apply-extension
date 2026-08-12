import { useQuery } from '@tanstack/react-query';
import { fetchPublicOffers } from '../lib/api';

export function OfferTicker() {
  const { data: offers = [] } = useQuery({
    queryKey: ['public', 'offers'],
    queryFn: async () => {
      const res = await fetchPublicOffers();
      if (!res.success) return [];
      return res.data ?? [];
    },
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
  });

  if (!offers.length) return null;

  const parts = offers.map((o) => {
    const code = o.couponCode?.trim();
    const text = code ? `${o.message} — use code ${code}` : o.message;
    if (o.linkUrl) {
      return (
        <a key={o.offerId} href={o.linkUrl} className="offer-ticker__link">
          {text}
        </a>
      );
    }
    return (
      <span key={o.offerId} className="offer-ticker__item">
        {text}
      </span>
    );
  });

  const track = (
    <>
      {parts}
      {parts}
    </>
  );

  return (
    <div className="offer-ticker" role="region" aria-label="Current offers">
      <div className="offer-ticker__track">{track}</div>
    </div>
  );
}
