/**
 * Post-build prerender: writes static HTML shells for public SEO routes.
 * Each shell clones dist/index.html, injects route meta + JSON-LD + crawler body
 * into #root so bots see content without executing JS. React replaces #root on hydrate.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.resolve(__dirname, '../dist');
const ORIGIN = 'https://www.cosmovai.in';
const OG_IMAGE = `${ORIGIN}/og-default.png`;

/** @typedef {{ path: string, title: string, description: string, type?: string, bodyHtml: string, jsonLd: object[] }} RouteSeo */

/** @type {RouteSeo[]} */
const routes = [
  {
    path: '/',
    title: 'Cosmo — Naukri job co-pilot',
    description:
      'Cosmo is a Naukri Easy Apply co-pilot and application tracker. Scan listings from your preferences, assist applies at a human pace, and sync everything to your Cosmo dashboard.',
    bodyHtml: `
      <main>
        <h1>Naukri Auto Apply</h1>
        <p>Cosmo is a Naukri Easy Apply co-pilot and application tracker by Cosmovai.</p>
        <ul>
          <li>Preference-based Naukri scans</li>
          <li>Human-paced Easy Apply assists</li>
          <li>Safety caps on daily volume</li>
          <li>Sync applies to your Cosmo dashboard</li>
        </ul>
        <p><a href="${ORIGIN}/faq">FAQ</a> · <a href="${ORIGIN}/blog">Guides</a> · <a href="${ORIGIN}/support">Support</a> · <a href="${ORIGIN}/#pricing">Pricing</a></p>
      </main>`,
    jsonLd: [
      {
        '@context': 'https://schema.org',
        '@type': 'Organization',
        name: 'Cosmovai',
        alternateName: ['Cosmo', 'Cosmo Job Assistant'],
        url: ORIGIN,
        logo: `${ORIGIN}/apple-touch-icon.png`,
        email: 'support@cosmovai.com',
      },
      {
        '@context': 'https://schema.org',
        '@type': 'WebSite',
        name: 'Cosmo',
        url: ORIGIN,
      },
      {
        '@context': 'https://schema.org',
        '@type': 'SoftwareApplication',
        name: 'Cosmo Job Assistant',
        applicationCategory: 'BrowserApplication',
        operatingSystem: 'Chrome, Edge, Firefox',
        url: ORIGIN,
      },
    ],
  },
  {
    path: '/privacy',
    title: 'Privacy Policy | Cosmo',
    description:
      'How Cosmovai and Cosmo Job Assistant collect, use, and protect your data when you sync Naukri applications and use the co-pilot.',
    bodyHtml: `<main><h1>Privacy Policy</h1><p>Read the full privacy policy for Cosmo Job Assistant on this page after JavaScript loads, or contact support@cosmovai.com.</p></main>`,
    jsonLd: [
      {
        '@context': 'https://schema.org',
        '@type': 'WebPage',
        name: 'Privacy Policy',
        url: `${ORIGIN}/privacy`,
      },
    ],
  },
  {
    path: '/terms',
    title: 'Terms of Service | Cosmo',
    description:
      'Terms of Service for Cosmo Job Assistant and the Cosmovai dashboard, including subscriptions and acceptable use.',
    bodyHtml: `<main><h1>Terms of Service</h1><p>Read the full terms for Cosmo Job Assistant on this page after JavaScript loads, or contact support@cosmovai.com.</p></main>`,
    jsonLd: [
      {
        '@context': 'https://schema.org',
        '@type': 'WebPage',
        name: 'Terms of Service',
        url: `${ORIGIN}/terms`,
      },
    ],
  },
  {
    path: '/support',
    title: 'Support | Cosmo',
    description:
      'Get help with Cosmo Job Assistant: install the Chrome extension, Google sign-in, Naukri co-pilot, billing, and security reports.',
    bodyHtml: `
      <main>
        <h1>Support</h1>
        <p>Email <a href="mailto:support@cosmovai.com">support@cosmovai.com</a> for product help, billing, or account questions.</p>
        <h2>Installing the extension</h2>
        <p>Add Cosmo Job Assistant from the Chrome Web Store, then sign in at cosmovai.in with Google.</p>
        <h2>Naukri co-pilot</h2>
        <p>Stay logged into Naukri in the same browser profile. Co-pilot requires explicit consent before assisted Easy Apply.</p>
        <p><a href="${ORIGIN}/faq">FAQ</a> · <a href="${ORIGIN}/blog">Guides</a></p>
      </main>`,
    jsonLd: [
      {
        '@context': 'https://schema.org',
        '@type': 'WebPage',
        name: 'Support — Cosmo Job Assistant',
        url: `${ORIGIN}/support`,
      },
    ],
  },
  {
    path: '/faq',
    title: 'FAQ | Cosmo',
    description:
      'Answers about Cosmo Job Assistant: Naukri Easy Apply co-pilot, human-paced assists, supported boards, pricing, install, and privacy.',
    bodyHtml: `
      <main>
        <h1>Frequently asked questions</h1>
        <h2>What is Cosmo / Cosmo Job Assistant?</h2>
        <p>Cosmo is a Naukri job co-pilot and application tracker by Cosmovai. It helps you scan Naukri listings from your preferences, assist Easy Apply at a human pace, and sync applications to your dashboard.</p>
        <h2>Does Cosmo auto-apply on Naukri?</h2>
        <p>Cosmo assists Easy Apply while you are signed into Naukri—an assisted co-pilot session, not unattended bulk apply.</p>
        <h2>Which job boards does Cosmo support today?</h2>
        <p>Today Cosmo’s co-pilot focuses on Naukri.</p>
        <p><a href="${ORIGIN}/support">Support</a> · <a href="${ORIGIN}/blog">Guides</a></p>
      </main>`,
    jsonLd: [
      {
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        mainEntity: [
          {
            '@type': 'Question',
            name: 'What is Cosmo / Cosmo Job Assistant?',
            acceptedAnswer: {
              '@type': 'Answer',
              text: 'Cosmo is a Naukri job co-pilot and application tracker by Cosmovai.',
            },
          },
          {
            '@type': 'Question',
            name: 'Which job boards does Cosmo support today?',
            acceptedAnswer: {
              '@type': 'Answer',
              text: 'Today Cosmo’s co-pilot focuses on Naukri.',
            },
          },
        ],
      },
    ],
  },
  {
    path: '/blog',
    title: 'Guides | Cosmo',
    description:
      'Guides on Naukri Easy Apply co-pilot, safe auto apply, application tracking, Cosmo plans, and installing the Chrome extension.',
    bodyHtml: `
      <main>
        <h1>Guides</h1>
        <ul>
          <li><a href="${ORIGIN}/blog/naukri-easy-apply-copilot-guide">How to use Cosmo’s Naukri Easy Apply co-pilot</a></li>
          <li><a href="${ORIGIN}/blog/naukri-auto-apply-safely">Naukri auto apply safely: human-paced vs bulk bots</a></li>
          <li><a href="${ORIGIN}/blog/sync-naukri-applications-tracker">Sync Naukri applications to a Cosmo tracker</a></li>
          <li><a href="${ORIGIN}/blog/cosmo-free-pro-max">Cosmo Free vs Pro vs Max</a></li>
          <li><a href="${ORIGIN}/blog/chrome-extension-install-consent-preferences">Chrome extension: install, consent, preferences</a></li>
        </ul>
      </main>`,
    jsonLd: [
      {
        '@context': 'https://schema.org',
        '@type': 'WebPage',
        name: 'Cosmo Guides',
        url: `${ORIGIN}/blog`,
      },
    ],
  },
];

const blogPosts = [
  {
    slug: 'naukri-easy-apply-copilot-guide',
    title: 'How to use Cosmo’s Naukri Easy Apply co-pilot',
    description:
      'Step-by-step guide to installing Cosmo, setting preferences, consenting to co-pilot, and assisting Naukri Easy Apply at a human pace.',
    datePublished: '2026-08-01',
  },
  {
    slug: 'naukri-auto-apply-safely',
    title: 'Naukri auto apply safely: human-paced co-pilot vs bulk bots',
    description:
      'Why Cosmo uses human-paced assisted Easy Apply with safety caps instead of unattended bulk apply bots on Naukri.',
    datePublished: '2026-08-02',
  },
  {
    slug: 'sync-naukri-applications-tracker',
    title: 'Sync Naukri applications to a Cosmo tracker dashboard',
    description:
      'How Cosmo syncs Naukri application activity into one dashboard so you can track assisted applies and follow-ups.',
    datePublished: '2026-08-03',
  },
  {
    slug: 'cosmo-free-pro-max',
    title: 'Cosmo Free vs Pro vs Max — who should pick what',
    description:
      'Compare Cosmo Free, Pro, and Max for Naukri co-pilot volume, scans, and human-paced sessions.',
    datePublished: '2026-08-04',
  },
  {
    slug: 'chrome-extension-install-consent-preferences',
    title: 'Chrome extension job assistant: install, consent, and preferences',
    description:
      'Install Cosmo Job Assistant, grant co-pilot consent, and set preferences before assisting Naukri Easy Apply.',
    datePublished: '2026-08-05',
  },
];

for (const post of blogPosts) {
  const pathName = `/blog/${post.slug}`;
  routes.push({
    path: pathName,
    title: `${post.title} | Cosmo`,
    description: post.description,
    type: 'article',
    bodyHtml: `
      <article>
        <h1>${escapeHtml(post.title)}</h1>
        <p>${escapeHtml(post.description)}</p>
        <p><a href="${ORIGIN}/blog">All guides</a> · <a href="${ORIGIN}/faq">FAQ</a> · <a href="${ORIGIN}/#pricing">Pricing</a></p>
      </article>`,
    jsonLd: [
      {
        '@context': 'https://schema.org',
        '@type': 'Article',
        headline: post.title,
        description: post.description,
        url: `${ORIGIN}${pathName}`,
        datePublished: post.datePublished,
        author: { '@type': 'Organization', name: 'Cosmovai' },
      },
    ],
  });
}

function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function injectHead(html, route) {
  const canonical = `${ORIGIN}${route.path === '/' ? '/' : route.path}`;
  const type = route.type || 'website';
  const metaBlock = `
    <title>${escapeHtml(route.title)}</title>
    <meta name="description" content="${escapeHtml(route.description)}" />
    <meta name="robots" content="index,follow" />
    <link rel="canonical" href="${canonical}" />
    <meta property="og:site_name" content="Cosmo" />
    <meta property="og:type" content="${type}" />
    <meta property="og:title" content="${escapeHtml(route.title)}" />
    <meta property="og:description" content="${escapeHtml(route.description)}" />
    <meta property="og:url" content="${canonical}" />
    <meta property="og:image" content="${OG_IMAGE}" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${escapeHtml(route.title)}" />
    <meta name="twitter:description" content="${escapeHtml(route.description)}" />
    <meta name="twitter:image" content="${OG_IMAGE}" />
    ${route.jsonLd
      .map(
        (schema) =>
          `<script type="application/ld+json">${JSON.stringify(schema)}</script>`
      )
      .join('\n    ')}
  `;

  let next = html
    .replace(/<title>[^<]*<\/title>/i, '')
    .replace(/<meta\s+name="description"[^>]*>/gi, '')
    .replace(/<meta\s+name="robots"[^>]*>/gi, '')
    .replace(/<link\s+rel="canonical"[^>]*>/gi, '')
    .replace(/<meta\s+property="og:[^"]*"[^>]*>/gi, '')
    .replace(/<meta\s+name="twitter:[^"]*"[^>]*>/gi, '');

  next = next.replace(/<head[^>]*>/i, (match) => `${match}\n${metaBlock}`);
  return next;
}

function injectBody(html, route) {
  // Keep SEO markup in the HTML source for crawlers, but hide it visually so
  // visitors never see a flash of unstyled text before React mounts.
  const shell = `<div id="root"><div data-seo-prerender hidden>${route.bodyHtml.trim()}</div></div>`;
  return html.replace(/<div id="root">[\s\S]*?<\/div>\s*<\/body>/i, `${shell}\n  </body>`);
}

function writeRoute(indexHtml, route) {
  let html = injectHead(indexHtml, route);
  html = injectBody(html, route);

  if (route.path === '/') {
    fs.writeFileSync(path.join(distDir, 'index.html'), html, 'utf8');
    return;
  }

  const outDir = path.join(distDir, route.path.replace(/^\//, ''));
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'index.html'), html, 'utf8');
}

function main() {
  const indexPath = path.join(distDir, 'index.html');
  if (!fs.existsSync(indexPath)) {
    console.error('prerender: dist/index.html missing — run vite build first');
    process.exit(1);
  }

  const indexHtml = fs.readFileSync(indexPath, 'utf8');
  for (const route of routes) {
    writeRoute(indexHtml, route);
    console.log(`prerendered ${route.path}`);
  }
  console.log(`prerender: ${routes.length} routes`);
}

main();
