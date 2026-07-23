import Lottie from 'lottie-react';
import { useEffect, useState } from 'react';

type JobsStudyLottieProps = {
  className?: string;
};

export function JobsStudyLottie({ className = '' }: JobsStudyLottieProps) {
  const [animationData, setAnimationData] = useState<object | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetch('/jobs-study-discussion.json')
      .then((res) => {
        if (!res.ok) throw new Error('Failed to load jobs illustration');
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
    <div
      className={`dash-stat-card__lottie dash-stat-card__lottie--jobs ${className}`.trim()}
      aria-hidden
    >
      <Lottie animationData={animationData} loop autoplay />
    </div>
  );
}
