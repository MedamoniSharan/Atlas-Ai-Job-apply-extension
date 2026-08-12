import { FormEvent, KeyboardEvent, useEffect, useMemo, useRef, useState } from 'react';
import { Check, X } from 'lucide-react';
import {
  DEFAULT_JOB_PREFERENCES,
  KEYWORD_SUGGESTIONS,
  LOCATION_SUGGESTIONS,
  MIN_PREF_KEYWORDS,
  MIN_PREF_TITLES,
  TITLE_SUGGESTIONS,
  canonicalizePreferenceValue,
  resolveJobPreferences,
  suggestPreferenceValues,
  type JobPreferences,
  type WorkMode,
} from '@cosmo/shared';
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
  catalog: readonly string[];
  hint?: string;
  minCount?: number;
  onChange: (next: string[]) => void;
};

function ChipField({
  label,
  values,
  placeholder,
  catalog,
  hint,
  minCount,
  onChange,
}: ChipFieldProps) {
  const [draft, setDraft] = useState('');
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const draftRef = useRef(draft);
  const valuesRef = useRef(values);
  const onChangeRef = useRef(onChange);
  const inputRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  draftRef.current = draft;
  valuesRef.current = values;
  onChangeRef.current = onChange;

  const suggestions = useMemo(
    () =>
      draft.trim()
        ? suggestPreferenceValues(draft, catalog, {
            exclude: values,
            limit: 8,
          })
        : [],
    [draft, catalog, values]
  );

  function addChips(raw: string, base = valuesRef.current) {
    const parts = raw
      .split(/[,|\n]/)
      .map((s) => s.trim())
      .filter(Boolean)
      .map((part) => canonicalizePreferenceValue(part, catalog))
      .filter(Boolean);
    if (parts.length === 0) return base;
    const seen = new Set(base.map((v) => v.toLowerCase()));
    const next = [...base];
    for (const part of parts) {
      const key = part.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      next.push(part);
    }
    onChangeRef.current(next);
    setDraft('');
    setOpen(false);
    setActiveIndex(0);
    return next;
  }

  useEffect(() => {
    const form = inputRef.current?.form;
    if (!form) return;

    const onFormSubmit = () => {
      const raw = draftRef.current;
      if (raw.trim()) addChips(raw);
    };
    form.addEventListener('submit', onFormSubmit, true);
    return () => form.removeEventListener('submit', onFormSubmit, true);
  }, [catalog]);

  useEffect(() => {
    function onDocPointerDown(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onDocPointerDown);
    return () => document.removeEventListener('mousedown', onDocPointerDown);
  }, []);

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown' && suggestions.length) {
      e.preventDefault();
      setOpen(true);
      setActiveIndex((i) => (i + 1) % suggestions.length);
      return;
    }
    if (e.key === 'ArrowUp' && suggestions.length) {
      e.preventDefault();
      setOpen(true);
      setActiveIndex((i) => (i <= 0 ? suggestions.length - 1 : i - 1));
      return;
    }
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      if (open && suggestions[activeIndex]) {
        addChips(suggestions[activeIndex]!);
        return;
      }
      const exact = canonicalizePreferenceValue(draft, catalog);
      if (exact) {
        addChips(exact);
        return;
      }
      if (suggestions[0]) addChips(suggestions[0]);
      return;
    }
    if (e.key === 'Escape') {
      setOpen(false);
      return;
    }
    if (e.key === 'Backspace' && draft === '' && values.length > 0) {
      onChange(values.slice(0, -1));
    }
  }

  const short =
    typeof minCount === 'number' && values.length < minCount
      ? `${values.length}/${minCount}`
      : null;

  return (
    <div className="chip-field" ref={rootRef}>
      <span className="chip-field__label">
        {label}
        {short ? (
          <span className="chip-field__count is-short">{short}</span>
        ) : typeof minCount === 'number' ? (
          <span className="chip-field__count">{values.length}</span>
        ) : null}
      </span>
      <div className="chip-field__control">
        <div
          className={`chip-field__box${
            typeof minCount === 'number' && values.length < minCount
              ? ' is-incomplete'
              : ''
          }`}
        >
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
            ref={inputRef}
            className="chip-field__input"
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              setOpen(true);
              setActiveIndex(0);
            }}
            onKeyDown={onKeyDown}
            onFocus={() => {
              if (draft.trim()) setOpen(true);
            }}
            onBlur={() => {
              window.setTimeout(() => {
                if (draftRef.current.trim()) addChips(draftRef.current);
              }, 120);
            }}
            placeholder={values.length === 0 ? placeholder : 'Add another…'}
            autoComplete="off"
            role="combobox"
            aria-expanded={open && suggestions.length > 0}
            aria-autocomplete="list"
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
        {open && suggestions.length > 0 ? (
          <ul className="chip-field__menu" role="listbox">
            {suggestions.map((item, index) => (
              <li key={item}>
                <button
                  type="button"
                  className={`chip-field__option${
                    index === activeIndex ? ' is-active' : ''
                  }`}
                  role="option"
                  aria-selected={index === activeIndex}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    addChips(item);
                    inputRef.current?.focus();
                  }}
                >
                  {item}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      <span className="chip-field__hint">
        {hint ?? 'Press Enter or pick a suggestion'}
      </span>
    </div>
  );
}

export function PreferencesForm({
  onSaved,
  submitLabel = 'Save preferences',
}: PreferencesFormProps) {
  const [prefs, setPrefs] = useState<JobPreferences>(DEFAULT_JOB_PREFERENCES);
  const prefsRef = useRef(prefs);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  prefsRef.current = prefs;

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const res = await fetchPreferences();
      if (cancelled) return;
      if (res.success) {
        setPrefs(resolveJobPreferences(res.data));
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!message) return;
    const timer = window.setTimeout(() => setMessage(''), 3200);
    return () => window.clearTimeout(timer);
  }, [message]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setMessage('');

    await new Promise((r) => setTimeout(r, 0));
    const next = prefsRef.current;

    if (next.titles.length < MIN_PREF_TITLES) {
      setError(`Add at least ${MIN_PREF_TITLES} job titles.`);
      return;
    }
    if (next.keywords.length < MIN_PREF_KEYWORDS) {
      setError(`Add at least ${MIN_PREF_KEYWORDS} keywords.`);
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
    <>
      {message && (
        <div className="app-toast" role="status" aria-live="polite">
          <span className="app-toast__icon" aria-hidden="true">
            <Check size={14} strokeWidth={2.6} />
          </span>
          <p>{message}</p>
        </div>
      )}
      <form className="prefs-form" onSubmit={onSubmit}>
        <ChipField
          label="Job titles"
          values={prefs.titles}
          catalog={TITLE_SUGGESTIONS}
          placeholder="Software Engineer"
          minCount={MIN_PREF_TITLES}
          hint={`Add at least ${MIN_PREF_TITLES} titles · pick spaced Naukri-style names`}
          onChange={(titles) => setPrefs((p) => ({ ...p, titles }))}
        />
        <ChipField
          label="Keywords"
          values={prefs.keywords}
          catalog={KEYWORD_SUGGESTIONS}
          placeholder="Spring Boot, React.js"
          minCount={MIN_PREF_KEYWORDS}
          hint={`Add at least ${MIN_PREF_KEYWORDS} keywords · names with spaces like Naukri`}
          onChange={(keywords) => setPrefs((p) => ({ ...p, keywords }))}
        />
        <ChipField
          label="Locations"
          values={prefs.locations}
          catalog={LOCATION_SUGGESTIONS}
          placeholder="Bengaluru, Remote"
          hint="Match Naukri city filter names"
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
              checked={prefs.autoScanEnabled !== false}
              onChange={(e) =>
                setPrefs((p) => ({ ...p, autoScanEnabled: e.target.checked }))
              }
            />
            Auto-scan Naukri from preferences
          </label>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={prefs.autoApplyEnabled !== false}
              onChange={(e) =>
                setPrefs((p) => ({ ...p, autoApplyEnabled: e.target.checked }))
              }
            />
            Auto-apply Easy Apply jobs (requires Naukri login)
          </label>
        </div>

        {error && <p className="error">{error}</p>}
        <button className="primary-btn" type="submit" disabled={saving}>
          {saving ? 'Saving…' : submitLabel}
        </button>
      </form>
    </>
  );
}
