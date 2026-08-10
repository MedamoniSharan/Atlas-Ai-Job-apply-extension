import { Link, Navigate, useParams } from 'react-router-dom';
import { CosmosDreamFooter } from '../components/CosmosDreamFooter';
import { LandingNavbar } from '../components/LandingNavbar';
import { SeoHead } from '../components/SeoHead';
import { TutorialVideo } from '../components/TutorialVideo';
import { getBlogPost } from '../content/blog';
import { CHROME_EXTENSION_URL } from '../lib/chromeExtension';
import {
  articleJsonLd,
  breadcrumbJsonLd,
} from '../lib/jsonLd';
import '../styles/landing-fonts.css';

function formatDate(iso: string) {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-IN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

export function BlogPostPage() {
  const { slug = '' } = useParams();
  const post = getBlogPost(slug);

  if (!post) {
    return <Navigate to="/blog" replace />;
  }

  const path = `/blog/${post.slug}`;

  return (
    <div className="landing legal-page">
      <SeoHead
        title={post.title}
        description={post.description}
        path={path}
        type="article"
        jsonLd={[
          articleJsonLd({
            title: post.title,
            description: post.description,
            path,
            datePublished: post.datePublished,
            dateModified: post.dateModified,
          }),
          breadcrumbJsonLd([
            { name: 'Home', path: '/' },
            { name: 'Guides', path: '/blog' },
            { name: post.title, path },
          ]),
        ]}
      />
      <LandingNavbar />
      <main className="legal-main">
        <article className="legal-card">
          <p className="legal-eyebrow">
            <Link to="/">Cosmo</Link>
            <span aria-hidden> / </span>
            <Link to="/blog">Guides</Link>
            <span aria-hidden> / </span>
            Article
          </p>
          <h1 className="legal-title">{post.title}</h1>
          <p className="legal-updated">
            Published {formatDate(post.datePublished)}
            {post.dateModified
              ? ` · Updated ${formatDate(post.dateModified)}`
              : ''}
          </p>
          <div className="legal-body">
            {post.videoUrl ? <TutorialVideo /> : null}
            {post.sections.map((section, i) => (
              <section key={i}>
                {section.heading ? <h2>{section.heading}</h2> : null}
                {section.paragraphs.map((p, j) => (
                  <p key={j}>{p}</p>
                ))}
                {section.list ? (
                  <ul>
                    {section.list.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                ) : null}
              </section>
            ))}

            <h2>Next steps</h2>
            <ul>
              {post.videoUrl ? (
                <li>
                  <a
                    href={post.videoUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Watch the step-by-step video on YouTube
                  </a>
                </li>
              ) : null}
              <li>
                <a
                  href={CHROME_EXTENSION_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Add Cosmo from the Chrome Web Store
                </a>
              </li>
              <li>
                <Link to="/#pricing">Compare Free, Pro, and Max</Link>
              </li>
              <li>
                <Link to="/faq">Read the FAQ</Link>
              </li>
              <li>
                <Link to="/support">Contact support</Link>
              </li>
            </ul>
          </div>
        </article>
      </main>
      <CosmosDreamFooter />
    </div>
  );
}
