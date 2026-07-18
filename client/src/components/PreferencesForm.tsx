import { FormEvent, useEffect, useState } from 'react';
import {
  DEFAULT_JOB_PREFERENCES,
  type JobPreferences,
  type WorkMode,
} from '@atlas/shared';
import { fetchPreferences, savePreferences } from '../lib/api';

function parseList(value: string): string[] {
  return value
    .split(/[,|\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

type PreferencesFormProps = {
  onSaved?: (prefs: JobPreferences) => void;
  submitLabel?: string;
};

export function PreferencesForm({
  onSaved,
  submitLabel = 'Save preferences',
}: PreferencesFormProps) {
  const [prefs, setPrefs] = useState<JobPreferences>(DEFAULT_JOB_PREFERENCES);
  const [titlesText, setTitlesText] = useState('');
  const [keywordsText, setKeywordsText] = useState('');
  const [locationsText, setLocationsText] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const res = await fetchPreferences();
      if (cancelled) return;
      if (res.success) {
        setPrefs(res.data);
        setTitlesText(res.data.titles.join(', '));
        setKeywordsText(res.data.keywords.join(', '));
        setLocationsText(res.data.locations.join(', '));
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setMessage('');
    const next: JobPreferences = {
      ...prefs,
      titles: parseList(titlesText),
      keywords: parseList(keywordsText),
      locations: parseList(locationsText),
    };
    if (next.titles.length === 0 && next.keywords.length === 0) {
      setError('Add at least one job title or keyword.');
      return;
    }
    if (next.experienceMin > next.experienceMax) {
      setError('Min experience cannot exceed max experience.');
      return;
    }

    setSaving(true);
    const res = await savePreferences(next);
    setSaving(false);
    if (!res.success) {
      setError(res.message);
      return;
    }
    setPrefs(res.data.preferences);
    setTitlesText(res.data.preferences.titles.join(', '));
    setKeywordsText(res.data.preferences.keywords.join(', '));
    setLocationsText(res.data.preferences.locations.join(', '));
    setMessage('Preferences saved.');
    onSaved?.(res.data.preferences);
  }

  if (loading) {
    return <p className="muted">Loading preferences…</p>;
  }

  return (
    <form className="prefs-form" onSubmit={onSubmit}>
      <label>
        Job titles
        <textarea
          value={titlesText}
          onChange={(e) => setTitlesText(e.target.value)}
          placeholder="Software Engineer, Backend Developer"
          rows={2}
        />
      </label>
      <label>
        Keywords
        <textarea
          value={keywordsText}
          onChange={(e) => setKeywordsText(e.target.value)}
          placeholder="React, Node.js, TypeScript"
          rows={2}
        />
      </label>
      <label>
        Locations
        <textarea
          value={locationsText}
          onChange={(e) => setLocationsText(e.target.value)}
          placeholder="Bengaluru, Remote, Hyderabad"
          rows={2}
        />
      </label>

      <div className="prefs-row">
        <label>
          Experience min (yrs)
          <input
            type="number"
            min={0}
            max={50}
            value={prefs.experienceMin}
            onChange={(e) =>
              setPrefs((p) => ({
                ...p,
                experienceMin: Number(e.target.value),
              }))
            }
          />
        </label>
        <label>
          Experience max (yrs)
          <input
            type="number"
            min={0}
            max={50}
            value={prefs.experienceMax}
            onChange={(e) =>
              setPrefs((p) => ({
                ...p,
                experienceMax: Number(e.target.value),
              }))
            }
          />
        </label>
        <label>
          Min salary (LPA)
          <input
            type="number"
            min={0}
            max={500}
            step={0.5}
            value={prefs.minSalaryLpa ?? ''}
            onChange={(e) =>
              setPrefs((p) => ({
                ...p,
                minSalaryLpa:
                  e.target.value === '' ? undefined : Number(e.target.value),
              }))
            }
          />
        </label>
      </div>

      <label>
        Work mode
        <select
          value={prefs.workMode}
          onChange={(e) =>
            setPrefs((p) => ({
              ...p,
              workMode: e.target.value as WorkMode,
            }))
          }
        >
          <option value="any">Any</option>
          <option value="office">Office</option>
          <option value="hybrid">Hybrid</option>
          <option value="remote">Remote</option>
        </select>
      </label>

      <div className="prefs-toggles">
        <label className="checkbox">
          <input
            type="checkbox"
            checked={prefs.autoScanEnabled}
            onChange={(e) =>
              setPrefs((p) => ({ ...p, autoScanEnabled: e.target.checked }))
            }
          />
          Auto-scan Naukri from preferences
        </label>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={prefs.autoApplyEnabled}
            onChange={(e) =>
              setPrefs((p) => ({ ...p, autoApplyEnabled: e.target.checked }))
            }
          />
          Auto-apply Easy Apply jobs (requires Naukri login)
        </label>
        <label>
          Daily apply limit
          <input
            type="number"
            min={1}
            max={100}
            value={prefs.dailyApplyLimit}
            onChange={(e) =>
              setPrefs((p) => ({
                ...p,
                dailyApplyLimit: Number(e.target.value),
              }))
            }
          />
        </label>
      </div>

      {error && <p className="error">{error}</p>}
      {message && <p className="success">{message}</p>}
      <button className="primary-btn" type="submit" disabled={saving}>
        {saving ? 'Saving…' : submitLabel}
      </button>
    </form>
  );
}
