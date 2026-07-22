import { FormEvent, KeyboardEvent, useEffect, useState } from 'react';
import { X } from 'lucide-react';
import {
  DEFAULT_JOB_PREFERENCES,
  type JobPreferences,
  type WorkMode,
} from '@atlas/shared';
import { fetchPreferences, savePreferences } from '../lib/api';
import { CosmosLoader } from './CosmosLogo';

type PreferencesFormProps = {
  onSaved?: (prefs: JobPreferences) => void;
  submitLabel?: string;
};

type ChipFieldProps = {
  label: string;
  values: string[];
  placeholder: string;
  onChange: (next: string[]) => void;
};

function ChipField({ label, values, placeholder, onChange }: ChipFieldProps) {
  const [draft, setDraft] = useState('');

  function addChips(raw: string) {
    const parts = raw
      .split(/[,|\n]/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (parts.length === 0) return;
    const seen = new Set(values.map((v) => v.toLowerCase()));
    const next = [...values];
    for (const part of parts) {
      const key = part.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      next.push(part);
    }
    onChange(next);
    setDraft('');
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addChips(draft);
      return;
    }
    if (e.key === 'Backspace' && draft === '' && values.length > 0) {
      onChange(values.slice(0, -1));
    }
  }

  return (
    <div className="chip-field">
      <span className="chip-field__label">{label}</span>
      <div className="chip-field__box">
        {values.map((value) => (
          <span className="pref-chip" key={value}>
            {value}
            <button
              type="button"
              className="pref-chip__remove"
              aria-label={`Remove ${value}`}
              onClick={() => onChange(values.filter((v) => v !== value))}
            >
              <X size={12} strokeWidth={2.4} aria-hidden />
            </button>
          </span>
        ))}
        <input
          className="chip-field__input"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          onBlur={() => {
            if (draft.trim()) addChips(draft);
          }}
          placeholder={values.length === 0 ? placeholder : 'Add another…'}
        />
        <button
          type="button"
          className="chip-field__add"
          onClick={() => addChips(draft)}
          disabled={!draft.trim()}
        >
          Add
        </button>
      </div>
      <span className="chip-field__hint">Press Enter or Add to create a chip</span>
    </div>
  );
}

export function PreferencesForm({
  onSaved,
  submitLabel = 'Save preferences',
}: PreferencesFormProps) {
  const [prefs, setPrefs] = useState<JobPreferences>(DEFAULT_JOB_PREFERENCES);
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
    if (prefs.titles.length === 0 && prefs.keywords.length === 0) {
      setError('Add at least one job title or keyword.');
      return;
    }
    if (prefs.experienceMin > prefs.experienceMax) {
      setError('Min experience cannot exceed max experience.');
      return;
    }

    setSaving(true);
    const res = await savePreferences(prefs);
    setSaving(false);
    if (!res.success) {
      setError(res.message);
      return;
    }
    setPrefs(res.data.preferences);
    setMessage('Preferences saved.');
    onSaved?.(res.data.preferences);
  }

  if (loading) {
    return (
      <CosmosLoader
        label="Loading preferences…"
        className="cosmos-loader--inline"
      />
    );
  }

  return (
    <form className="prefs-form" onSubmit={onSubmit}>
      <ChipField
        label="Job titles"
        values={prefs.titles}
        placeholder="Software Engineer"
        onChange={(titles) => setPrefs((p) => ({ ...p, titles }))}
      />
      <ChipField
        label="Keywords"
        values={prefs.keywords}
        placeholder="React, Node.js"
        onChange={(keywords) => setPrefs((p) => ({ ...p, keywords }))}
      />
      <ChipField
        label="Locations"
        values={prefs.locations}
        placeholder="Bengaluru, Remote"
        onChange={(locations) => setPrefs((p) => ({ ...p, locations }))}
      />

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
      </div>

      {error && <p className="error">{error}</p>}
      {message && <p className="success">{message}</p>}
      <button className="primary-btn" type="submit" disabled={saving}>
        {saving ? 'Saving…' : submitLabel}
      </button>
    </form>
  );
}
