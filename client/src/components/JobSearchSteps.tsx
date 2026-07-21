import { useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import { ArrowUpRight } from 'lucide-react';

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
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState('');

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) setFileName(file.name);
  }

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
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,.doc,.docx"
          hidden
          onChange={handleFileChange}
        />
        <button
          className="job-steps-button"
          type="button"
          onClick={() => inputRef.current?.click()}
          aria-label="Get started by uploading your resume"
        >
          <span>{fileName ? 'Resume selected' : 'Get Started'}</span>
          <ArrowUpRight
            size={16}
            strokeWidth={2.2}
            className="job-steps-arrow icon-motion"
            aria-hidden
          />
        </button>
      </div>
      {fileName ? (
        <p className="job-steps-status" role="status">
          Selected: {fileName}
        </p>
      ) : null}
    </section>
  );
}
