import { describe, expect, it } from 'vitest';
import {
  KEYWORD_SUGGESTIONS,
  TITLE_SUGGESTIONS,
  canonicalizePreferenceValue,
  compactMatchText,
  suggestPreferenceValues,
} from './preferenceSuggestions';

describe('compactMatchText', () => {
  it('strips spaces and punctuation', () => {
    expect(compactMatchText('Spring Boot')).toBe('springboot');
    expect(compactMatchText('React.js')).toBe('reactjs');
    expect(compactMatchText('spring-boot')).toBe('springboot');
  });
});

describe('canonicalizePreferenceValue', () => {
  it('returns spaced catalog label for compact input', () => {
    expect(canonicalizePreferenceValue('springboot', KEYWORD_SUGGESTIONS)).toBe(
      'Spring Boot'
    );
    expect(canonicalizePreferenceValue('SPRING BOOT', KEYWORD_SUGGESTIONS)).toBe(
      'Spring Boot'
    );
  });

  it('rejects unknown free-text', () => {
    expect(canonicalizePreferenceValue('  kko  ', KEYWORD_SUGGESTIONS)).toBe(
      ''
    );
    expect(canonicalizePreferenceValue('Neo4j', KEYWORD_SUGGESTIONS)).toBe(
      'Neo4j'
    );
  });
});

describe('suggestPreferenceValues', () => {
  it('suggests spaced names for partial skill queries', () => {
    const hits = suggestPreferenceValues('sprin', KEYWORD_SUGGESTIONS);
    expect(hits.some((h) => h === 'Spring Boot')).toBe(true);
    expect(hits.some((h) => h === 'Spring')).toBe(true);
  });

  it('suggests titles and excludes selected values', () => {
    const hits = suggestPreferenceValues('software', TITLE_SUGGESTIONS, {
      exclude: ['Software Engineer'],
      limit: 10,
    });
    expect(hits).not.toContain('Software Engineer');
    expect(hits.some((h) => /Software/.test(h))).toBe(true);
  });
});
