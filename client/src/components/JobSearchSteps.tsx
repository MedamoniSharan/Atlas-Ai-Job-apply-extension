import { useRef, useState } from 'react';
import type { ChangeEvent } from 'react';

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
          <svg
            className="job-steps-arrow"
            viewBox="0 0 384 512"
            aria-hidden="true"
          >
            <path d="M352 128c0-17.7-14.3-32-32-32L96 96c-17.7 0-32 14.3-32 32s14.3 32 32 32l146.7 0L41.4 361.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0L288 205.3 288 352c0 17.7 14.3 32 32 32s32-14.3 32-32l0-224z" />
          </svg>
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
