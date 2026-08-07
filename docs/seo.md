# Cosmo SEO / GEO / AEO

Production site: `https://www.cosmovai.in`

## What ships in the build

- Default meta, Open Graph, and Twitter tags in `client/index.html`
- Per-route head via `SeoHead` (`react-helmet-async`)
- `client/public/robots.txt`, `sitemap.xml`, `llms.txt`, `og-default.png`
- JSON-LD (Organization, WebSite, SoftwareApplication, FAQPage, Article, BreadcrumbList, WebPage)
- Static HTML prerender for public routes (`client/scripts/prerender.mjs` after `vite build`)
- Public content: `/support`, `/faq`, `/blog`, `/blog/:slug`

## After deploy checklist

1. **Google Search Console** — add/verify `https://www.cosmovai.in`, submit `https://www.cosmovai.in/sitemap.xml`.
2. **Bing Webmaster Tools** — same sitemap URL.
3. **View source** (not DevTools Elements) on `/`, `/faq`, `/blog/naukri-easy-apply-copilot-guide` and confirm:
   - `<title>`, meta description, canonical
   - `og:*` / `twitter:*`
   - `application/ld+json`
   - Meaningful text inside `#root` (prerender shell)
4. **Social debuggers**
   - [Facebook Sharing Debugger](https://developers.facebook.com/tools/debug/)
   - [LinkedIn Post Inspector](https://www.linkedin.com/post-inspector/)
   - [Twitter/X Card Validator](https://cards-dev.twitter.com/validator)
5. **Chrome Web Store** — keep listing description aligned with Naukri co-pilot keywords and `llms.txt` facts.
6. **Analytics** — privacy policy currently states analytics are not used; only add GA4/Plausible after updating legal copy.

## Local verification

```bash
npm run build --workspace=@cosmo/client
# inspect client/dist/index.html and client/dist/faq/index.html
npx --workspace=@cosmo/client vite preview
```

## noindex routes

`/login`, `/register`, `/admin/*`, and authenticated app routes set `robots=noindex,nofollow` and are disallowed in `robots.txt`.
