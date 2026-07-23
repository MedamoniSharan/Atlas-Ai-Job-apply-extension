import { SuccessStoriesButton } from './SuccessStoriesButton';

const steps = [
  {
    title: 'We get to know you',
    alt: 'A salary preference form',
    image:
      'https://assets.sonara.ai/blobimages/snr/images/desired-salary_lp.png',
  },
  {
    title: 'We find jobs for you',
    alt: 'A resume profile preview',
    image:
      'https://assets.sonara.ai/blobimages/snr/images/lorence-resume_lp.png',
  },
  {
    title: 'We apply for you',
    alt: 'A job role description form',
    image: 'https://assets.sonara.ai/blobimages/snr/images/role-desc_lp.png',
  },
] as const;

export function JobSearchSteps() {
  return (
    <section className="job-steps-shell" aria-labelledby="job-steps-title">
      <h2 id="job-steps-title" className="job-steps-title">
        Save time — skip the job application process
      </h2>
      <div className="job-steps-grid" aria-label="How the service works">
        {steps.map((step) => (
          <article className="job-step" key={step.title}>
            <h3 className="job-step-title">{step.title}</h3>
            <img
              className="job-step-image"
              src={step.image}
              alt={step.alt}
              width={342}
              height={240}
              loading="lazy"
            />
          </article>
        ))}
      </div>
      <div className="job-steps-action">
        <SuccessStoriesButton label="Get Started" to="/login" />
      </div>
    </section>
  );
}
