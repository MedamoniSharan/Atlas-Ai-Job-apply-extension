import { useEffect } from 'react';
import type { Application } from '@atlas/shared';

type ApplicationDetailDrawerProps = {
  app: Application | null;
  onClose: () => void;
};

function MetaRow({ label, value }: { label: string; value?: string | null }) {
  if (!value?.trim()) return null;
  return (
    <div className="job-drawer__meta-row">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function statusLabel(app: Application): string {
  if (app.metadata?.skipped) return 'Skipped';
  if (app.status === 'applied' || app.metadata?.source === 'auto_apply') {
    return 'Applied';
  }
  if (app.status === 'detected' || app.metadata?.source === 'auto_scan') {
    return 'Matched';
  }
  return app.status;
}

export function ApplicationDetailDrawer({
  app,
  onClose,
}: ApplicationDetailDrawerProps) {
  useEffect(() => {
    if (!app) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [app, onClose]);

  if (!app) return null;

  const detailLabels =
    app.metadata?.detailLabels &&
    typeof app.metadata.detailLabels === 'object' &&
    !Array.isArray(app.metadata.detailLabels)
      ? (app.metadata.detailLabels as Record<string, string>)
      : null;
  const sections =
    app.metadata?.sections &&
    typeof app.metadata.sections === 'object' &&
    !Array.isArray(app.metadata.sections)
      ? (app.metadata.sections as Record<string, string>)
      : null;
  const pageText =
    typeof app.metadata?.pageText === 'string' ? app.metadata.pageText : null;

  const facts = [
    { label: 'Experience', value: app.experience },
    { label: 'Salary', value: app.salary },
    { label: 'Location', value: app.location },
    { label: 'Posted', value: app.postedAt },
    { label: 'Openings', value: app.openings },
    { label: 'Applicants', value: app.applicants },
    { label: 'Role', value: app.role },
    { label: 'Department', value: app.department },
    { label: 'Industry', value: app.industry },
    { label: 'Employment', value: app.employmentType },
    { label: 'Role category', value: app.roleCategory },
    { label: 'Education', value: app.education },
    {
      label: 'Rating',
      value:
        app.rating || app.reviews
          ? [app.rating, app.reviews].filter(Boolean).join(' · ')
          : undefined,
    },
    ...(detailLabels
      ? Object.entries(detailLabels).map(([label, value]) => ({ label, value }))
      : []),
  ].filter((f) => f.value?.trim());

  // Dedupe facts by label (prefer first / structured fields).
  const seenLabels = new Set<string>();
  const uniqueFacts = facts.filter((f) => {
    const key = f.label.toLowerCase();
    if (seenLabels.has(key)) return false;
    seenLabels.add(key);
    return true;
  });

  const sectionEntries = sections
    ? Object.entries(sections).filter(
        ([key, text]) =>
          text.trim().length > 20 &&
          key !== 'aboutCompany' &&
          key !== 'jobDescription' &&
          key !== 'keySkills' &&
          key !== 'jobHighlights'
      )
    : [];

  return (
    <div className="job-drawer" role="presentation">
      <button
        type="button"
        className="job-drawer__backdrop"
        aria-label="Close job details"
        onClick={onClose}
      />
      <aside
        className="job-drawer__panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="job-drawer-title"
      >
        <header className="job-drawer__head">
          <div className="job-drawer__brand">
            {app.companyLogo ? (
              <img
                className="job-drawer__logo"
                src={app.companyLogo}
                alt=""
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="job-drawer__logo job-drawer__logo--fallback" aria-hidden>
                {app.company.slice(0, 2).toUpperCase()}
              </div>
            )}
            <div className="job-drawer__titles">
              <p className="job-drawer__company">{app.company}</p>
              <h2 id="job-drawer-title">{app.title}</h2>
              <div className="job-drawer__chips">
                <span className="job-drawer__chip">{statusLabel(app)}</span>
                <span className="job-drawer__chip job-drawer__chip--muted">
                  {app.platform}
                </span>
                {app.metadata?.source ? (
                  <span className="job-drawer__chip job-drawer__chip--muted">
                    {app.metadata.source.replace('_', ' ')}
                  </span>
                ) : null}
              </div>
            </div>
          </div>
          <button
            type="button"
            className="job-drawer__close"
            onClick={onClose}
            aria-label="Close"
          >
            ×
          </button>
        </header>

        <div className="job-drawer__body">
          {app.metadata?.skipReason ? (
            <p className="job-drawer__skip">
              Skipped: {app.metadata.skipReason}
            </p>
          ) : null}

          {uniqueFacts.length > 0 ? (
            <section className="job-drawer__section">
              <h3>Job details</h3>
              <dl className="job-drawer__meta">
                {uniqueFacts.map((f) => (
                  <MetaRow key={f.label} label={f.label} value={f.value} />
                ))}
              </dl>
            </section>
          ) : null}

          {app.skills && app.skills.length > 0 ? (
            <section className="job-drawer__section">
              <h3>Skills</h3>
              <div className="job-drawer__skills">
                {app.skills.map((skill) => (
                  <span key={skill} className="job-drawer__skill">
                    {skill}
                  </span>
                ))}
              </div>
            </section>
          ) : null}

          {app.highlights && app.highlights.length > 0 ? (
            <section className="job-drawer__section">
              <h3>Highlights</h3>
              <ul className="job-drawer__list">
                {app.highlights.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </section>
          ) : null}

          {app.description ? (
            <section className="job-drawer__section">
              <h3>Description</h3>
              <p className="job-drawer__prose">{app.description}</p>
            </section>
          ) : null}

          {sectionEntries.map(([key, text]) => (
            <section key={key} className="job-drawer__section">
              <h3>
                {key
                  .replace(/([A-Z])/g, ' $1')
                  .replace(/^./, (c) => c.toUpperCase())
                  .trim()}
              </h3>
              <p className="job-drawer__prose">{text}</p>
            </section>
          ))}

          {app.aboutCompany ? (
            <section className="job-drawer__section">
              <h3>About company</h3>
              <p className="job-drawer__prose">{app.aboutCompany}</p>
            </section>
          ) : null}

          {!app.description && pageText ? (
            <section className="job-drawer__section">
              <h3>Page content</h3>
              <p className="job-drawer__prose">{pageText}</p>
            </section>
          ) : null}

          {!app.description &&
          !app.aboutCompany &&
          !app.skills?.length &&
          !pageText &&
          uniqueFacts.length === 0 ? (
            <p className="job-drawer__empty">
              Full details will appear after Atlas opens this job on Naukri.
              Open the listing to view everything on the site.
            </p>
          ) : null}
        </div>

        <footer className="job-drawer__foot">
          {app.url ? (
            <a
              className="dash-btn dash-btn--primary"
              href={app.url}
              target="_blank"
              rel="noreferrer"
            >
              Open on Naukri
            </a>
          ) : null}
          <button
            type="button"
            className="dash-btn dash-btn--ghost"
            onClick={onClose}
          >
            Close
          </button>
        </footer>
      </aside>
    </div>
  );
}
