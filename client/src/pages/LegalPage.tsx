import { type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import privacyMarkdown from '../../../privacy-policy.md?raw';
import termsMarkdown from '../../../terms.md?raw';
import { CosmosDreamFooter } from '../components/CosmosDreamFooter';
import { LandingNavbar } from '../components/LandingNavbar';

type LegalKind = 'privacy' | 'terms';

const DOCS: Record<
  LegalKind,
  { title: string; markdown: string; updated: string }
> = {
  privacy: {
    title: 'Privacy Policy',
    markdown: privacyMarkdown,
    updated: 'July 24, 2026',
  },
  terms: {
    title: 'Terms of Service',
    markdown: termsMarkdown,
    updated: 'July 24, 2026',
  },
};

function renderMarkdown(md: string) {
  const lines = md.replace(/\r\n/g, '\n').split('\n');
  const nodes: ReactNode[] = [];
  let i = 0;
  let key = 0;
  let paragraph: string[] = [];

  const flushParagraph = () => {
    if (!paragraph.length) return;
    const text = paragraph.join(' ').trim();
    paragraph = [];
    if (!text) return;
    nodes.push(
      <p key={`p-${key++}`}>{formatInline(text)}</p>
    );
  };

  while (i < lines.length) {
    const line = lines[i] ?? '';
    const trimmed = line.trim();

    if (!trimmed) {
      flushParagraph();
      i += 1;
      continue;
    }

    if (trimmed.startsWith('# ')) {
      flushParagraph();
      nodes.push(<h1 key={`h1-${key++}`}>{trimmed.slice(2)}</h1>);
      i += 1;
      continue;
    }
    if (trimmed.startsWith('## ')) {
      flushParagraph();
      nodes.push(<h2 key={`h2-${key++}`}>{trimmed.slice(3)}</h2>);
      i += 1;
      continue;
    }
    if (trimmed.startsWith('### ')) {
      flushParagraph();
      nodes.push(<h3 key={`h3-${key++}`}>{trimmed.slice(4)}</h3>);
      i += 1;
      continue;
    }
    if (trimmed.startsWith('> ')) {
      flushParagraph();
      const quote: string[] = [];
      while (i < lines.length && (lines[i] ?? '').trim().startsWith('>')) {
        quote.push((lines[i] ?? '').trim().replace(/^>\s?/, ''));
        i += 1;
      }
      nodes.push(
        <blockquote key={`bq-${key++}`}>{formatInline(quote.join(' '))}</blockquote>
      );
      continue;
    }
    if (trimmed.startsWith('|')) {
      flushParagraph();
      const rows: string[][] = [];
      while (i < lines.length && (lines[i] ?? '').trim().startsWith('|')) {
        const raw = (lines[i] ?? '').trim();
        i += 1;
        if (/^\|[\s-:|]+\|$/.test(raw)) continue;
        rows.push(
          raw
            .slice(1, -1)
            .split('|')
            .map((c) => c.trim())
        );
      }
      if (rows.length) {
        const [header, ...body] = rows;
        nodes.push(
          <div className="legal-table-wrap" key={`t-${key++}`}>
            <table>
              <thead>
                <tr>
                  {header?.map((cell, idx) => (
                    <th key={idx}>{formatInline(cell)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {body.map((row, rIdx) => (
                  <tr key={rIdx}>
                    {row.map((cell, cIdx) => (
                      <td key={cIdx}>{formatInline(cell)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      }
      continue;
    }
    if (trimmed.startsWith('- ')) {
      flushParagraph();
      const items: string[] = [];
      while (i < lines.length && (lines[i] ?? '').trim().startsWith('- ')) {
        items.push((lines[i] ?? '').trim().slice(2));
        i += 1;
      }
      nodes.push(
        <ul key={`ul-${key++}`}>
          {items.map((item, idx) => (
            <li key={idx}>{formatInline(item)}</li>
          ))}
        </ul>
      );
      continue;
    }

    paragraph.push(trimmed);
    i += 1;
  }
  flushParagraph();
  return nodes;
}

function formatInline(text: string): ReactNode {
  const parts: ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/g;
  let last = 0;
  let match: RegExpExecArray | null;
  let k = 0;
  while ((match = re.exec(text))) {
    if (match.index > last) {
      parts.push(text.slice(last, match.index));
    }
    const token = match[0];
    if (token.startsWith('**')) {
      parts.push(<strong key={k++}>{token.slice(2, -2)}</strong>);
    } else if (token.startsWith('`')) {
      parts.push(<code key={k++}>{token.slice(1, -1)}</code>);
    } else {
      const m = token.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
      if (m) {
        parts.push(
          <a key={k++} href={m[2]} target="_blank" rel="noreferrer">
            {m[1]}
          </a>
        );
      }
    }
    last = match.index + token.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts.length === 1 ? parts[0] : parts;
}

export function LegalPage({ kind }: { kind: LegalKind }) {
  const doc = DOCS[kind];

  return (
    <div className="landing legal-page">
      <LandingNavbar />
      <main className="legal-main">
        <div className="legal-card">
          <p className="legal-eyebrow">
            <Link to="/">Cosmo</Link>
            <span aria-hidden> / </span>
            {doc.title}
          </p>
          <h1 className="legal-title">{doc.title}</h1>
          <p className="legal-updated">Effective {doc.updated}</p>
          <div className="legal-body">{renderMarkdown(doc.markdown)}</div>
        </div>
      </main>
      <CosmosDreamFooter />
    </div>
  );
}
