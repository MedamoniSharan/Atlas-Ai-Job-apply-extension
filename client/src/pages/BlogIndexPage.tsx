import { Link } from 'react-router-dom';
import { CosmosDreamFooter } from '../components/CosmosDreamFooter';
import { LandingNavbar } from '../components/LandingNavbar';
import { SeoHead } from '../components/SeoHead';
import { BLOG_INDEX_DESCRIPTION, BLOG_POSTS } from '../content/blog';
import { breadcrumbJsonLd, webPageJsonLd } from '../lib/jsonLd';
import '../styles/landing-fonts.css';

function formatDate(iso: string) {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-IN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

export function BlogIndexPage() {
  return (
    <div className="landing legal-page">
      <SeoHead
        title="Guides"
        description={BLOG_INDEX_DESCRIPTION}
        path="/blog"
        jsonLd={[
          webPageJsonLd({
            name: 'Cosmo Guides',
            description: BLOG_INDEX_DESCRIPTION,
            path: '/blog',
          }),
          breadcrumbJsonLd([
            { name: 'Home', path: '/' },
            { name: 'Guides', path: '/blog' },
          ]),
        ]}
      />
      <LandingNavbar />
      <main className="legal-main">
        <div className="legal-card">
          <p className="legal-eyebrow">
            <Link to="/">Cosmo</Link>
            <span aria-hidden> / </span>
            Guides
          </p>
          <h1 className="legal-title">Guides</h1>
          <p className="legal-updated">
            Naukri co-pilot, safe auto apply, tracking, plans, and install
          </p>
          <div className="legal-body">
            <p>
              Practical articles for job seekers using Cosmo on Naukri. Also see
              the <Link to="/faq">FAQ</Link> and{' '}
              <Link to="/support">Support</Link>.
            </p>
            <ul className="blog-index-list">
              {BLOG_POSTS.map((post) => (
                <li key={post.slug}>
                  <Link to={`/blog/${post.slug}`}>
                    <strong>{post.title}</strong>
                  </Link>
                  <p>{post.description}</p>
                  <p className="blog-index-date">
                    {formatDate(post.datePublished)}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </main>
      <CosmosDreamFooter />
    </div>
  );
}
