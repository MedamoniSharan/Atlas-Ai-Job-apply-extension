import { Link } from 'react-router-dom';

export function ComingSoonPage({
  title,
  blurb,
}: {
  title: string;
  blurb: string;
}) {
  return (
    <div className="dash dash-coming">
      <div className="dash-callout">
        <div>
          <h2>{title}</h2>
          <p>{blurb}</p>
        </div>
        <Link className="dash-btn dash-btn--primary" to="/dashboard">
          Back to Dashboard
        </Link>
      </div>
    </div>
  );
}
