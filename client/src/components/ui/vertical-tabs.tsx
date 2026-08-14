import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '@/lib/utils';
import { TutorialVideo } from '@/components/TutorialVideo';
import { DiaTextReveal } from '@/components/ui/dia-text-reveal';
const STEPS = [
  {
    id: '01',
    title: 'Install the extension',
    description:
      'Add Cosmo Job Assistant from the Chrome Web Store and pin it to your toolbar.',
  },
  {
    id: '02',
    title: 'Sign in to Cosmo',
    description:
      'Open cosmovai.in and sign in with Google so the extension syncs your session.',
  },
  {
    id: '03',
    title: 'Set your preferences',
    description:
      'Choose titles, keywords, location, salary, and work mode so Cosmo knows what to scan.',
  },
  {
    id: '04',
    title: 'Open Naukri & start',
    description:
      'Stay logged into Naukri, open the Cosmo panel, grant consent, then start scanning and Easy Apply.',
  },
] as const;

const AUTO_PLAY_DURATION = 5000;

export function VerticalTabs() {
  const [activeIndex, setActiveIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);

  const handleNext = useCallback(() => {
    setActiveIndex((prev) => (prev + 1) % STEPS.length);
  }, []);

  const handleTabClick = (index: number) => {
    if (index === activeIndex) return;
    setActiveIndex(index);
    setIsPaused(false);
  };

  useEffect(() => {
    if (isPaused) return;

    const interval = setInterval(() => {
      handleNext();
    }, AUTO_PLAY_DURATION);

    return () => clearInterval(interval);
  }, [activeIndex, isPaused, handleNext]);

  return (
    <section
      id="how-to"
      className="w-full bg-white py-8 md:py-16 lg:py-24"
      aria-labelledby="vertical-tabs-title"
    >
      <div className="mx-auto w-full max-w-5xl px-4 md:px-8 lg:px-12">
        <div className="grid grid-cols-1 items-center gap-10 lg:grid-cols-12 lg:gap-8">
          <div className="order-2 flex flex-col justify-center pt-4 lg:order-1 lg:col-span-7">
            <div className="mb-12 space-y-1">
              <h2
                id="vertical-tabs-title"
                className="text-balance text-3xl font-medium tracking-tighter text-black md:text-4xl lg:text-5xl"
              >
              <DiaTextReveal
                text="How to install Cosmo"
                colors={[
                  '#ff0040',
                  '#ff8a00',
                  '#ffee00',
                  '#00c853',
                  '#00b0ff',
                  '#7c4dff',
                  '#e040fb',
                ]}
                textColor="#121212"
                duration={3.2}
                delay={0.1}
                once={false}
                startOnView
                className="text-3xl font-medium tracking-tighter md:text-4xl lg:text-5xl"
              />
              </h2>
              <span className="ml-0.5 block text-[10px] font-medium uppercase tracking-[0.3em] text-black/45">
                (Setup)
              </span>
            </div>

            <div className="flex flex-col space-y-0">
              {STEPS.map((step, index) => {
                const isActive = activeIndex === index;
                return (
                  <button
                    key={step.id}
                    type="button"
                    onClick={() => handleTabClick(index)}
                    className={cn(
                      'group relative flex w-full items-start gap-4 border-0 border-t border-solid border-black/10 bg-transparent py-6 text-left shadow-none transition-all duration-500 first:border-0 md:py-8',
                      isActive
                        ? 'text-black'
                        : 'text-black/40 hover:text-black',
                    )}
                  >
                    <div className="absolute bottom-0 left-[-16px] top-0 w-[2px] bg-black/10 md:left-[-24px]">
                      {isActive ? (
                        <motion.div
                          key={`progress-${index}-${isPaused}`}
                          className="absolute left-0 top-0 w-full origin-top bg-black"
                          initial={{ height: '0%' }}
                          animate={
                            isPaused ? { height: '0%' } : { height: '100%' }
                          }
                          transition={{
                            duration: AUTO_PLAY_DURATION / 1000,
                            ease: 'linear',
                          }}
                        />
                      ) : null}
                    </div>

                    <span className="mt-1 text-[9px] font-medium tabular-nums opacity-50 md:text-[10px]">
                      /{step.id}
                    </span>

                    <div className="flex flex-1 flex-col gap-2">
                      <span
                        className={cn(
                          'text-2xl font-normal tracking-tight transition-colors duration-500 md:text-3xl lg:text-4xl',
                          isActive ? 'text-black' : '',
                        )}
                      >
                        {step.title}
                      </span>

                      <AnimatePresence mode="wait">
                        {isActive ? (
                          <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            transition={{
                              duration: 0.3,
                              ease: [0.23, 1, 0.32, 1],
                            }}
                            className="overflow-hidden"
                          >
                            <p className="max-w-sm pb-2 text-sm font-normal leading-relaxed text-black/60 md:text-base">
                              {step.description}
                            </p>
                          </motion.div>
                        ) : null}
                      </AnimatePresence>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div
            className="order-1 flex justify-center lg:order-2 lg:col-span-5 lg:justify-end"
            onMouseEnter={() => setIsPaused(true)}
            onMouseLeave={() => setIsPaused(false)}
          >
            <TutorialVideo
              shortsPlayer
              showCaption={false}
              hideFallbackLink
              autoplayOnView
              className="install-steps__video w-full max-w-[315px]"
            />
          </div>
        </div>
      </div>
    </section>
  );
}

export default VerticalTabs;
