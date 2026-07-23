import Lottie from 'lottie-react';
import { useEffect, useState } from 'react';

type SubscriptionCelebrateProps = {
  className?: string;
};

export function SubscriptionCelebrate({ className = '' }: SubscriptionCelebrateProps) {
  const [animationData, setAnimationData] = useState<object | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetch('/subscription-celebrate.json')
      .then((res) => {
        if (!res.ok) throw new Error('Failed to load celebration animation');
        return res.json();
      })
      .then((data: object) => {
        if (!cancelled) setAnimationData(data);
      })
      .catch(() => {
        if (!cancelled) setAnimationData(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!animationData) return null;

  return (
    <div className={`dash-stat-card__lottie ${className}`.trim()} aria-hidden>
      <Lottie animationData={animationData} loop autoplay />
    </div>
  );
}
