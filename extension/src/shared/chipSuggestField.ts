import {
  canonicalizePreferenceValue,
  suggestPreferenceValues,
} from '@cosmo/shared';
import { clearChildren } from './dom';

export type ChipSuggestField = {
  getValues: () => string[];
  setValues: (next: string[]) => void;
  flushDraft: () => void;
};

type ChipSuggestOptions = {
  root: HTMLElement;
  catalog: readonly string[];
  placeholder: string;
  minCount?: number;
};

/**
 * Naukri-style chips + local autocomplete for the extension popup.
 * Expects `root` to contain `.chip-suggest__box`, `.chip-suggest__chips`,
 * `.chip-suggest__input`, `.chip-suggest__menu`, and optional `.chip-suggest__count`.
 */
export function mountChipSuggestField(
  options: ChipSuggestOptions
): ChipSuggestField {
  const { root, catalog, placeholder, minCount } = options;
  const box = root.querySelector('.chip-suggest__box') as HTMLElement;
  const chipsEl = root.querySelector('.chip-suggest__chips') as HTMLElement;
  const input = root.querySelector(
    '.chip-suggest__input'
  ) as HTMLInputElement;
  const menu = root.querySelector('.chip-suggest__menu') as HTMLElement;
  const countEl = root.querySelector(
    '.chip-suggest__count'
  ) as HTMLElement | null;

  let values: string[] = [];
  let activeIndex = -1;
  let suggestions: string[] = [];

  input.placeholder = placeholder;

  function updateCount() {
    if (!countEl || typeof minCount !== 'number') return;
    countEl.textContent = `${values.length}/${minCount}`;
    countEl.classList.toggle('is-short', values.length < minCount);
    box.classList.toggle('is-incomplete', values.length < minCount);
  }

  function hideMenu() {
    menu.classList.add('hidden');
    clearChildren(menu);
    suggestions = [];
    activeIndex = -1;
  }

  function renderChips() {
    clearChildren(chipsEl);
    for (const value of values) {
      const chip = document.createElement('span');
      chip.className = 'chip-suggest__chip';
      const label = document.createElement('span');
      label.textContent = value;
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'chip-suggest__remove';
      remove.setAttribute('aria-label', `Remove ${value}`);
      remove.textContent = '×';
      remove.addEventListener('click', () => {
        values = values.filter((v) => v !== value);
        renderChips();
        updateCount();
        refreshSuggestions();
      });
      chip.append(label, remove);
      chipsEl.appendChild(chip);
    }
    input.placeholder = values.length === 0 ? placeholder : 'Add another…';
    updateCount();
  }

  function highlightActive() {
    const items = Array.from(
      menu.querySelectorAll('.chip-suggest__option')
    ) as HTMLElement[];
    items.forEach((el, i) => {
      el.classList.toggle('is-active', i === activeIndex);
    });
    items[activeIndex]?.scrollIntoView({ block: 'nearest' });
  }

  function renderMenu() {
    clearChildren(menu);
    if (!suggestions.length) {
      hideMenu();
      return;
    }
    menu.classList.remove('hidden');
    suggestions.forEach((item, index) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'chip-suggest__option';
      btn.textContent = item;
      btn.addEventListener('mousedown', (e) => {
        e.preventDefault();
        commitValue(item);
      });
      if (index === activeIndex) btn.classList.add('is-active');
      menu.appendChild(btn);
    });
  }

  function refreshSuggestions() {
    const draft = input.value;
    if (!draft.trim()) {
      hideMenu();
      return;
    }
    suggestions = suggestPreferenceValues(draft, catalog, {
      exclude: values,
      limit: 8,
    });
    activeIndex = suggestions.length ? 0 : -1;
    renderMenu();
  }

  function addValue(raw: string) {
    const canonical = canonicalizePreferenceValue(raw, catalog);
    if (!canonical) return;
    const key = canonical.toLowerCase();
    if (values.some((v) => v.toLowerCase() === key)) return;
    values = [...values, canonical];
    renderChips();
  }

  function commitValue(raw: string) {
    addValue(raw);
    input.value = '';
    hideMenu();
    input.focus();
  }

  function flushDraft() {
    const raw = input.value;
    if (raw.trim()) {
      addValue(raw);
      input.value = '';
      hideMenu();
    }
  }

  input.addEventListener('input', () => {
    refreshSuggestions();
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' && suggestions.length) {
      e.preventDefault();
      activeIndex = (activeIndex + 1) % suggestions.length;
      highlightActive();
      return;
    }
    if (e.key === 'ArrowUp' && suggestions.length) {
      e.preventDefault();
      activeIndex =
        activeIndex <= 0 ? suggestions.length - 1 : activeIndex - 1;
      highlightActive();
      return;
    }
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      if (activeIndex >= 0 && suggestions[activeIndex]) {
        commitValue(suggestions[activeIndex]!);
        return;
      }
      const exact = canonicalizePreferenceValue(input.value, catalog);
      if (exact) {
        commitValue(exact);
        return;
      }
      if (suggestions[0]) commitValue(suggestions[0]);
      return;
    }
    if (e.key === 'Escape') {
      hideMenu();
      return;
    }
    if (e.key === 'Backspace' && input.value === '' && values.length > 0) {
      values = values.slice(0, -1);
      renderChips();
    }
  });

  input.addEventListener('blur', () => {
    window.setTimeout(() => {
      if (input.value.trim()) flushDraft();
      else hideMenu();
    }, 120);
  });

  box.addEventListener('click', (e) => {
    if (e.target === box || e.target === chipsEl) input.focus();
  });

  hideMenu();
  renderChips();

  return {
    getValues: () => [...values],
    setValues: (next) => {
      values = [...next];
      input.value = '';
      hideMenu();
      renderChips();
    },
    flushDraft,
  };
}
