import { Helmet } from 'react-helmet-async';
import {
  DEFAULT_DESCRIPTION,
  DEFAULT_OG_IMAGE,
  DEFAULT_TITLE,
  SITE_NAME,
  absoluteUrl,
  titleWithBrand,
} from '../lib/seo';

export type SeoHeadProps = {
  title?: string;
  description?: string;
  path: string;
  image?: string;
  type?: 'website' | 'article';
  robots?: string;
  jsonLd?: Record<string, unknown> | Record<string, unknown>[];
  noBrandSuffix?: boolean;
};

export function SeoHead({
  title,
  description = DEFAULT_DESCRIPTION,
  path,
  image = DEFAULT_OG_IMAGE,
  type = 'website',
  robots = 'index,follow',
  jsonLd,
  noBrandSuffix = false,
}: SeoHeadProps) {
  const pageTitle = title
    ? noBrandSuffix
      ? title
      : titleWithBrand(title)
    : DEFAULT_TITLE;
  const canonical = absoluteUrl(path);
  const ogImage = absoluteUrl(image);
  const schemas = jsonLd
    ? Array.isArray(jsonLd)
      ? jsonLd
      : [jsonLd]
    : [];

  return (
    <Helmet>
      <title>{pageTitle}</title>
      <meta name="description" content={description} />
      <meta name="robots" content={robots} />
      <link rel="canonical" href={canonical} />

      <meta property="og:site_name" content={SITE_NAME} />
      <meta property="og:type" content={type} />
      <meta property="og:title" content={pageTitle} />
      <meta property="og:description" content={description} />
      <meta property="og:url" content={canonical} />
      <meta property="og:image" content={ogImage} />
      <meta property="og:locale" content="en_IN" />

      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={pageTitle} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={ogImage} />

      {schemas.map((schema, i) => (
        <script key={i} type="application/ld+json">
          {JSON.stringify(schema)}
        </script>
      ))}
    </Helmet>
  );
}
