export type FaqItem = {
  question: string;
  answer: string;
};

export const FAQ_ITEMS: FaqItem[] = [
  {
    question: 'What is Cosmo / Cosmo Job Assistant?',
    answer:
      'Cosmo (Cosmo Job Assistant) is a Naukri job co-pilot and application tracker by Cosmovai. It helps you scan Naukri listings from your preferences, assist Easy Apply in your browser at a human pace, and sync application activity to your Cosmo dashboard.',
  },
  {
    question: 'Does Cosmo auto-apply on Naukri?',
    answer:
      'Cosmo assists Easy Apply on Naukri while you are signed into Naukri in the same browser profile. It is an assisted co-pilot session—not unattended bulk apply. You control preferences, consent, and when sessions run.',
  },
  {
    question: 'Is Cosmo unattended bulk apply or a human-paced co-pilot?',
    answer:
      'Cosmo is a human-paced co-pilot. Paid plans describe human-paced co-pilot sessions with safety caps (daily and monthly assisted applies). It is not designed as an unattended bulk-apply bot.',
  },
  {
    question: 'Which job boards does Cosmo support today?',
    answer:
      'Today Cosmo’s co-pilot focuses on Naukri. Application sync and assisted Easy Apply are built around Naukri. Other boards may appear in marketing as future direction; they are not the current co-pilot scope.',
  },
  {
    question: 'How do Free, Pro, and Max plans differ?',
    answer:
      'Free starts with core assisted applies and scan limits. Pro raises monthly assisted applies and includes human-paced co-pilot sessions for active searches. Max offers the highest monthly apply and scan capacity. Exact limits are shown on the pricing section of cosmovai.in.',
  },
  {
    question: 'How does billing work?',
    answer:
      'Paid plans are managed on the Cosmo website via Razorpay Subscriptions. For failed charges or cancellations, email support@cosmovai.com with your Cosmo account email.',
  },
  {
    question: 'How do I install the Cosmo Chrome extension?',
    answer:
      'Open the Cosmo Chrome Web Store listing from cosmovai.in (Add to Chrome), install Cosmo Job Assistant, then sign in to the Cosmo dashboard with Google so the extension can sync your session. For a full walkthrough, watch the step-by-step YouTube guide: https://www.youtube.com/shorts/1Rv02UdoHLo',
  },
  {
    question: 'What do I need before using the Naukri co-pilot?',
    answer:
      'Install the extension, sign in to Cosmo with Google, log into Naukri in the same browser profile, set your job preferences, and grant explicit consent in the co-pilot panel before assisted scanning or Easy Apply.',
  },
  {
    question: 'What can block Easy Apply assistance?',
    answer:
      'Captchas, company-site redirects, and screening questions may block or interrupt Easy Apply automation. Cosmo works within what Naukri and employers allow in the browser.',
  },
  {
    question: 'How does Cosmo handle privacy and sign-in?',
    answer:
      'Dashboard users sign in with Google. Cosmo syncs and manages job-application activity from supported sites (currently Naukri) into your dashboard. See the Privacy Policy and Terms on cosmovai.in for full details.',
  },
];

export const FAQ_PAGE_DESCRIPTION =
  'Answers about Cosmo Job Assistant: Naukri Easy Apply co-pilot, human-paced assists, supported boards, pricing, install, and privacy.';
