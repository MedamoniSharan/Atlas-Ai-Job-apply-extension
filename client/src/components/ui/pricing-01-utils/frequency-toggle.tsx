import { cn } from '@/lib/utils';
import { motion } from 'motion/react';

export type FREQUENCY = 'monthly' | 'yearly';

const OPTIONS: { value: FREQUENCY; label: string; badge?: string }[] = [
  { value: 'monthly', label: 'Monthly' },
  { value: 'yearly', label: 'Yearly', badge: 'Save 15%' },
];

type FrequencyToggleProps = {
  frequency: FREQUENCY;
  setFrequency: (frequency: FREQUENCY) => void;
  className?: string;
};

export function FrequencyToggle({
  frequency,
  setFrequency,
  className,
}: FrequencyToggleProps) {
  return (
    <div
      className={cn(
        'relative mx-auto inline-flex items-center rounded-full bg-[#f3f4f6] p-1',
        className,
      )}
      role="group"
      aria-label="Billing frequency"
    >
      {OPTIONS.map((option) => {
        const selected = frequency === option.value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={selected}
            onClick={() => setFrequency(option.value)}
            className={cn(
              'relative z-10 m-0 inline-flex h-11 cursor-pointer items-center justify-center gap-2 rounded-full border-0 bg-transparent px-6 text-base font-medium shadow-none outline-none transition-colors focus-visible:ring-2 focus-visible:ring-black/20',
              selected ? 'text-white' : 'text-[#8b8f98] hover:text-foreground',
            )}
          >
            {selected ? (
              <motion.span
                layoutId="pricing-frequency-pill"
                className="absolute inset-0 rounded-full bg-black"
                transition={{ type: 'spring', stiffness: 420, damping: 32 }}
              />
            ) : null}
            <span className="relative z-10">{option.label}</span>
            {option.badge ? (
              <span
                className={cn(
                  'relative z-10 rounded-full px-2.5 py-1 text-xs font-semibold leading-none',
                  selected
                    ? 'bg-white/15 text-white'
                    : 'bg-[#15362b] text-white',
                )}
              >
                {option.badge}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
