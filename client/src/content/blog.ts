export type BlogSection = {
  heading?: string;
  paragraphs: string[];
  list?: string[];
};

export type BlogPost = {
  slug: string;
  title: string;
  description: string;
  datePublished: string;
  dateModified?: string;
  sections: BlogSection[];
};

export const BLOG_POSTS: BlogPost[] = [
  {
    slug: 'naukri-easy-apply-copilot-guide',
    title: 'How to use Cosmo’s Naukri Easy Apply co-pilot',
    description:
      'Step-by-step guide to installing Cosmo, setting preferences, consenting to co-pilot, and assisting Naukri Easy Apply at a human pace.',
    datePublished: '2026-08-01',
    sections: [
      {
        paragraphs: [
          'Cosmo Job Assistant helps you scan Naukri jobs that match your preferences and assist Easy Apply from your browser—then sync those applications to your Cosmo dashboard.',
        ],
      },
      {
        heading: '1. Install and sign in',
        paragraphs: [
          'Add Cosmo from the Chrome Web Store, open cosmovai.in, and sign in with Google. The extension receives your session from the dashboard so sync stays in one account.',
        ],
      },
      {
        heading: '2. Set preferences',
        paragraphs: [
          'In Cosmo, define titles, keywords, location, salary, and work mode. The co-pilot uses these preferences when scanning Naukri listings.',
        ],
      },
      {
        heading: '3. Open Naukri and start a co-pilot session',
        paragraphs: [
          'Stay logged into Naukri in the same browser profile. Open the Cosmo panel, review consent (assisted co-pilot—not unattended bulk apply), then start scanning and assisting Easy Apply at a human pace.',
        ],
      },
      {
        heading: '4. Track in the dashboard',
        paragraphs: [
          'Applications sync to your Cosmo tracker so you can see what was assisted and follow up without juggling spreadsheets.',
        ],
        list: [
          'See pricing on cosmovai.in for Free, Pro, and Max limits.',
          'Read the FAQ for captchas, redirects, and screening questions.',
        ],
      },
    ],
  },
  {
    slug: 'naukri-auto-apply-safely',
    title: 'Naukri auto apply safely: human-paced co-pilot vs bulk bots',
    description:
      'Why Cosmo uses human-paced assisted Easy Apply with safety caps instead of unattended bulk apply bots on Naukri.',
    datePublished: '2026-08-02',
    sections: [
      {
        paragraphs: [
          '“Naukri auto apply” search results often mix risky bulk bots with legitimate helpers. Cosmo is built as a human-paced co-pilot: you are present, preferences guide matching, and assisted applies respect daily and monthly safety caps.',
        ],
      },
      {
        heading: 'What “assisted” means',
        paragraphs: [
          'Cosmo helps fill and submit Easy Apply flows while you are signed into Naukri. It does not claim silent, unattended mass apply across the internet.',
        ],
      },
      {
        heading: 'Why pacing matters',
        paragraphs: [
          'Aggressive automation can trip captchas, hit employer redirects, or violate site expectations. Human-paced sessions reduce that risk and keep your search sustainable.',
        ],
        list: [
          'Consent is required in the extension panel before assisted scanning/apply.',
          'Plan limits (Free / Pro / Max) cap assisted volume—see pricing on the Cosmo site.',
        ],
      },
    ],
  },
  {
    slug: 'sync-naukri-applications-tracker',
    title: 'Sync Naukri applications to a Cosmo tracker dashboard',
    description:
      'How Cosmo syncs Naukri application activity into one dashboard so you can track assisted applies and follow-ups.',
    datePublished: '2026-08-03',
    sections: [
      {
        paragraphs: [
          'Applying on Naukri is only half the job. Cosmo syncs application activity into a dashboard tracker so you can see status, volume, and history in one place.',
        ],
      },
      {
        heading: 'What gets synced',
        paragraphs: [
          'When the extension and dashboard share your signed-in Cosmo account, assisted Easy Apply activity from Naukri can flow into Cosmo’s applications and tracker views.',
        ],
      },
      {
        heading: 'Getting started',
        list: [
          'Install Cosmo Job Assistant from the Chrome Web Store.',
          'Sign in at cosmovai.in with Google.',
          'Use the co-pilot on Naukri, then review Applications and Tracker in the dashboard.',
        ],
        paragraphs: [
          'If sync looks stalled, confirm the dashboard origin matches the extension’s configured production host and that you are online—Cosmo can queue events and retry when connectivity returns.',
        ],
      },
    ],
  },
  {
    slug: 'cosmo-free-pro-max',
    title: 'Cosmo Free vs Pro vs Max — who should pick what',
    description:
      'Compare Cosmo Free, Pro, and Max for Naukri co-pilot volume, scans, and human-paced sessions.',
    datePublished: '2026-08-04',
    sections: [
      {
        paragraphs: [
          'Cosmo plans are built around assisted applies and scans for Naukri co-pilot use—not unlimited unattended bots. Pick a plan based on how active your search is.',
        ],
      },
      {
        heading: 'Free',
        paragraphs: [
          'Best for trying Cosmo: core automation with limited assisted applies and multi-board scan allowance. Ideal if you are validating the workflow before a heavy search sprint.',
        ],
      },
      {
        heading: 'Pro',
        paragraphs: [
          'For serious searches that need more monthly assisted applies and human-paced co-pilot sessions. A fit when you are applying regularly and want higher caps without jumping to Max.',
        ],
      },
      {
        heading: 'Max',
        paragraphs: [
          'Highest monthly assisted applies and scan capacity for heavy usage. Choose Max when volume is the bottleneck and you still want paced, preference-driven assists.',
        ],
        list: [
          'See live limits and pricing on cosmovai.in/#pricing.',
          'Team plans are available via sales for ambitious teams.',
        ],
      },
    ],
  },
  {
    slug: 'chrome-extension-install-consent-preferences',
    title: 'Chrome extension job assistant: install, consent, and preferences',
    description:
      'Install Cosmo Job Assistant, grant co-pilot consent, and set preferences before assisting Naukri Easy Apply.',
    datePublished: '2026-08-05',
    sections: [
      {
        paragraphs: [
          'Cosmo Job Assistant is a browser extension plus dashboard. Setup has three pillars: install, preferences, and explicit co-pilot consent.',
        ],
      },
      {
        heading: 'Install',
        paragraphs: [
          'Use Add to Chrome from cosmovai.in or the Chrome Web Store listing for Cosmo Job Assistant. Sign in to the Cosmo dashboard with Google so the auth bridge can share your session with the extension.',
        ],
      },
      {
        heading: 'Preferences',
        paragraphs: [
          'Configure roles, keywords, location, salary, and work mode in Cosmo. The co-pilot scans Naukri against those preferences so assists stay relevant.',
        ],
      },
      {
        heading: 'Consent',
        paragraphs: [
          'Before assisted scanning or Easy Apply, acknowledge in the panel that Cosmo will assist as a co-pilot—not unattended bulk apply. You remain in control of when sessions run.',
        ],
        list: [
          'Need help? Visit Support or email support@cosmovai.com.',
          'Read Privacy and Terms on cosmovai.in for data practices.',
        ],
      },
    ],
  },
];

export function getBlogPost(slug: string): BlogPost | undefined {
  return BLOG_POSTS.find((post) => post.slug === slug);
}

export const BLOG_INDEX_DESCRIPTION =
  'Guides on Naukri Easy Apply co-pilot, safe auto apply, application tracking, Cosmo plans, and installing the Chrome extension.';
