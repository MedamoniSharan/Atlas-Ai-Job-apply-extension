import Lottie from 'lottie-react';
import { useEffect, useState } from 'react';

type EmptyJobsIllustrationProps = {
  message?: string;
  className?: string;
};

export function EmptyJobsIllustration({
  message = 'No matches yet. Start the co-pilot on Naukri to fill this row.',
  className = '',
}: EmptyJobsIllustrationProps) {
  const [animationData, setAnimationData] = useState<object | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetch('/employee-search.json')
      .then((res) => {
        if (!res.ok) throw new Error('Failed to load illustration');
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

  return (
    <div className={`dash-empty dash-empty--illus ${className}`.trim()}>
      {animationData ? (
        <Lottie
          className="dash-empty__lottie"
          animationData={animationData}
          loop
          autoplay
        />
      ) : null}
      <p className="dash-empty__copy">{message}</p>
    </div>
  );
}
