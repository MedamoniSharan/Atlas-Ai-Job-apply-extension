import { FormEvent, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  UNINSTALL_REASON_LABELS,
  uninstallFeedbackSubmitSchema,
  type UninstallReason,
} from '@cosmo/shared';
import { CosmosDreamFooter } from '../components/CosmosDreamFooter';
import { LandingNavbar } from '../components/LandingNavbar';
import { NoIndexHead } from '../components/NoIndexHead';
import { CHROME_EXTENSION_URL } from '../lib/chromeExtension';
import { submitUninstallFeedback } from '../lib/api';
import '../styles/landing-fonts.css';

const REASONS = Object.entries(UNINSTALL_REASON_LABELS) as Array<
  [UninstallReason, string]
>;

export function UninstallFeedbackPage() {
  const [params] = useSearchParams();
  const extensionVersion = params.get('v')?.trim() || '';
  const sourceParam = params.get('src')?.trim().toLowerCase() || 'chrome';
  const source =
    sourceParam === 'edge' || sourceParam === 'firefox' || sourceParam === 'other'
      ? sourceParam
      : 'chrome';

  const [reason, setReason] = useState<UninstallReason | ''>('');
  const [comment, setComment] = useState('');
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const browser = useMemo(() => {
    const ua = navigator.userAgent;
    if (/Edg\//.test(ua)) return 'Edge';
    if (/Firefox\//.test(ua)) return 'Firefox';
    if (/Chrome\//.test(ua)) return 'Chrome';
    return 'Other';
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const parsed = uninstallFeedbackSubmitSchema.safeParse({
      reason,
      comment: comment.trim(),
      email: email.trim(),
      extensionVersion: extensionVersion || undefined,
      browser,
      source,
    });
    if (!parsed.success) {
      setError('Please pick a reason before submitting.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await submitUninstallFeedback(parsed.data);
      if (!res.success) {
        setError(res.message || 'Could not submit feedback. Please try again.');
        return;
      }
      setDone(true);
    } catch {
      setError('Could not submit feedback. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="landing legal-page">
      <NoIndexHead title="Uninstall feedback" path="/uninstall" />
      <LandingNavbar />
      <main className="legal-main">
        <div className="legal-card uninstall-card">
          <p className="legal-eyebrow">
            <Link to="/">Cosmo</Link>
            <span aria-hidden> / </span>
            Uninstall feedback
          </p>
          <h1 className="legal-title">Sorry to see you go</h1>
          <p className="legal-updated">
            Your feedback helps us improve Cosmo Job Assistant.
          </p>

          {done ? (
            <div className="legal-body uninstall-done">
              <p>Thanks — we got your feedback.</p>
              <p>
                Changed your mind? You can reinstall from the{' '}
                <a
                  href={CHROME_EXTENSION_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Chrome Web Store
                </a>
                .
              </p>
              <p>
                <Link to="/">Back to Cosmo</Link>
              </p>
            </div>
          ) : (
            <form className="uninstall-form" onSubmit={onSubmit}>
              <fieldset className="uninstall-reasons">
                <legend>Why did you uninstall?</legend>
                {REASONS.map(([value, label]) => (
                  <label key={value} className="uninstall-reason">
                    <input
                      type="radio"
                      name="reason"
                      value={value}
                      checked={reason === value}
                      onChange={() => setReason(value)}
                      required
                    />
                    <span>{label}</span>
                  </label>
                ))}
              </fieldset>

              <label className="uninstall-field">
                <span>Anything else? (optional)</span>
                <textarea
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  maxLength={1000}
                  rows={4}
                  placeholder="What could we have done better?"
                />
              </label>

              <label className="uninstall-field">
                <span>Email (optional)</span>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  maxLength={200}
                  placeholder="If you want us to follow up"
                  autoComplete="email"
                />
              </label>

              {error ? (
                <p className="uninstall-error" role="alert">
                  {error}
                </p>
              ) : null}

              <button
                type="submit"
                className="uninstall-submit"
                disabled={submitting || !reason}
              >
                {submitting ? 'Sending…' : 'Send feedback'}
              </button>
            </form>
          )}
        </div>
      </main>
      <CosmosDreamFooter />
    </div>
  );
}
