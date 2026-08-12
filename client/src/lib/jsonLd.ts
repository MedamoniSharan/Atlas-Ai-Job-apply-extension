import {
  CHROME_STORE_URL,
  ORG_NAME,
  PRODUCT_NAME,
  SITE_NAME,
  SITE_ORIGIN,
  SUPPORT_EMAIL,
  absoluteUrl,
} from './seo';

export function organizationJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: ORG_NAME,
    alternateName: [SITE_NAME, PRODUCT_NAME],
    url: SITE_ORIGIN,
    logo: absoluteUrl('/apple-touch-icon.png'),
    email: SUPPORT_EMAIL,
    sameAs: [
      CHROME_STORE_URL,
      'https://codexcareer.com',
      'https://www.instagram.com/codex.career/',
    ],
  };
}

export function websiteJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: SITE_NAME,
    url: SITE_ORIGIN,
    description:
      'Naukri Easy Apply co-pilot and job application tracker by Cosmovai.',
    publisher: {
      '@type': 'Organization',
      name: ORG_NAME,
      url: SITE_ORIGIN,
    },
  };
}

export function softwareApplicationJsonLd(highPrice = '299') {
  return {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: PRODUCT_NAME,
    applicationCategory: 'BrowserApplication',
    operatingSystem: 'Chrome, Edge, Firefox',
    url: SITE_ORIGIN,
    downloadUrl: CHROME_STORE_URL,
    description:
      'Browser extension and dashboard that helps job seekers scan Naukri listings from their preferences and assist Easy Apply at a human pace, then sync applications to Cosmo.',
    offers: {
      '@type': 'AggregateOffer',
      lowPrice: '0',
      highPrice,
      priceCurrency: 'INR',
      offerCount: 3,
      url: absoluteUrl('/#pricing'),
    },
    publisher: {
      '@type': 'Organization',
      name: ORG_NAME,
      url: SITE_ORIGIN,
    },
  };
}

export function breadcrumbJsonLd(
  items: Array<{ name: string; path: string }>
) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: absoluteUrl(item.path),
    })),
  };
}

export function webPageJsonLd(opts: {
  name: string;
  description: string;
  path: string;
}) {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: opts.name,
    description: opts.description,
    url: absoluteUrl(opts.path),
    isPartOf: {
      '@type': 'WebSite',
      name: SITE_NAME,
      url: SITE_ORIGIN,
    },
  };
}

export function faqPageJsonLd(
  faqs: Array<{ question: string; answer: string }>
) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map((faq) => ({
      '@type': 'Question',
      name: faq.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: faq.answer,
      },
    })),
  };
}

export function articleJsonLd(opts: {
  title: string;
  description: string;
  path: string;
  datePublished: string;
  dateModified?: string;
}) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: opts.title,
    description: opts.description,
    url: absoluteUrl(opts.path),
    datePublished: opts.datePublished,
    dateModified: opts.dateModified ?? opts.datePublished,
    author: {
      '@type': 'Organization',
      name: ORG_NAME,
      url: SITE_ORIGIN,
    },
    publisher: {
      '@type': 'Organization',
      name: ORG_NAME,
      url: SITE_ORIGIN,
      logo: {
        '@type': 'ImageObject',
        url: absoluteUrl('/apple-touch-icon.png'),
      },
    },
    mainEntityOfPage: absoluteUrl(opts.path),
  };
}
