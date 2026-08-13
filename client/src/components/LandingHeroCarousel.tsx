import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchPublicBanners } from '../lib/api';

/**
 * Image carousel between landing navbar and hero.
 * Driven by Admin → Banners. Hidden when none are active.
 */
export function LandingHeroCarousel() {
  const { data: banners = [] } = useQuery({
    queryKey: ['public', 'banners'],
    queryFn: async () => {
      const res = await fetchPublicBanners();
      if (!res.success) return [];
      return res.data ?? [];
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  const slides = banners.filter((b) => !!b.imageUrl?.trim());
  const [index, setIndex] = useState(0);

  useEffect(() => {
    setIndex(0);
  }, [slides.length]);

  useEffect(() => {
    if (slides.length < 2) return;
    const id = window.setInterval(() => {
      setIndex((i) => (i + 1) % slides.length);
    }, 4500);
    return () => window.clearInterval(id);
  }, [slides.length]);

  if (!slides.length) return null;

  const current = slides[Math.min(index, slides.length - 1)];
  const href = current.linkUrl?.trim() || '/#pricing';
  const src = current.imageUrl.trim();
  const alt = current.altText?.trim() || 'Promotion';

  return (
    <section className="landing-hero-carousel" aria-label="Promotions">
      <div className="landing-hero-carousel__frame">
        <a className="landing-hero-carousel__link" href={href} aria-label={alt}>
          <img
            className="landing-hero-carousel__img"
            src={src}
            alt={alt}
            decoding="async"
            draggable={false}
          />
        </a>
        {slides.length > 1 ? (
          <div className="landing-hero-carousel__dots" role="tablist">
            {slides.map((slide, i) => (
              <button
                key={slide.bannerId}
                type="button"
                role="tab"
                aria-selected={i === index}
                aria-label={`Slide ${i + 1}`}
                className={`landing-hero-carousel__dot${
                  i === index ? ' is-active' : ''
                }`}
                onClick={() => setIndex(i)}
              />
            ))}
          </div>
        ) : null}
      </div>
    </section>
  );
}
