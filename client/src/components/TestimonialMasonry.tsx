import { useState } from 'react';
import { ChevronLeft, ChevronRight, Quote } from 'lucide-react';

type Testimonial = {
  id: string;
  name: string;
  handle: string;
  avatar: string;
  body: string;
  lines?: string[];
};

const columns: Testimonial[][] = [
  [
    {
      id: 'ananya',
      name: 'Ananya R.',
      handle: '@ananya_builds',
      avatar: 'ananya',
      body: 'Went from doom-scrolling Naukri to 40 Easy Applies in a week.\n\nCosmo matched my prefs and paced the applies so it never felt spammy.',
    },
    {
      id: 'karthik',
      name: 'Karthik M.',
      handle: '@km_dev',
      avatar: 'karthik',
      body: 'If you’re serious about Naukri applications, Cosmo is a must-have. I’ve been using it to:',
      lines: [
        'Scan roles that match my stack',
        'Queue Easy Apply in one session',
        'Keep a clean tracker of every apply',
        'Stay under daily safety caps',
        'Plus, the co-pilot UI is just 🤌',
      ],
    },
    {
      id: 'meera',
      name: 'Meera S.',
      handle: '@meerajobs',
      avatar: 'meera',
      body: 'Cosmo is fantastic and way too useful for what it costs.\n\nTried manual apply marathons for months — nothing beats preference-matched scans + assisted Easy Apply.',
    },
    {
      id: 'arjun',
      name: 'Arjun P.',
      handle: '@arjuncodes',
      avatar: 'arjun',
      body: 'The human-paced apply flow is consistently solid.\n\nHighly recommend if you’re hunting while still working full-time.',
    },
  ],
  [
    {
      id: 'priya',
      name: 'Priya N.',
      handle: '@priya_pm',
      avatar: 'priya',
      body: 'Applying more with Cosmo these days.\n\n🎯 Preference filters that stick\n⚡ Easy Apply assists\n📋 Tracker sync to the dashboard\n📈 Clear weekly volume\n\nWorth trying if Naukri eats your evenings.',
    },
    {
      id: 'rahul',
      name: 'Rahul K.',
      handle: '@rahulk_fe',
      avatar: 'rahul',
      body: 'Hit a 2-week apply streak with Cosmo.\n\nMore interviews showing up than when I clicked through listings myself.',
    },
    {
      id: 'isha',
      name: 'Isha V.',
      handle: '@isha_designs',
      avatar: 'isha',
      body: 'If you want consistent Naukri volume without tab chaos, Cosmo is perfect.\n\nIt’s worth it even if you only run a couple of sessions a week.',
    },
    {
      id: 'vikram',
      name: 'Vikram D.',
      handle: '@vikram_swe',
      avatar: 'vikram',
      body: 'This is my go-to for Naukri Easy Apply sessions.\n\nDistraction-free prefs, one work tab, and applies that sync back to Cosmo.',
    },
  ],
  [
    {
      id: 'neha',
      name: 'Neha T.',
      handle: '@neha_product',
      avatar: 'neha',
      body: 'My favorite tool for Naukri applications is Cosmo.\n\nIt offers:',
      lines: [
        'Preference-matched scans',
        'Assisted Easy Apply',
        'A tracker that’s actually usable',
        'I genuinely love the workflow.',
      ],
    },
    {
      id: 'aditya',
      name: 'Aditya S.',
      handle: '@adi_backend',
      avatar: 'aditya',
      body: 'For months I tried random apply scripts and browser macros.\n\nThen I found Cosmo — seven weeks of steady sessions later, it’s still the only flow I trust.',
    },
    {
      id: 'sana',
      name: 'Sana F.',
      handle: '@sana_frontend',
      avatar: 'sana',
      body: 'Just started using Cosmo and I already apply more often.\nLooks like evenings are for prep calls, not clicking Apply 40 times.',
    },
    {
      id: 'rohan',
      name: 'Rohan J.',
      handle: '@rohan_jobs',
      avatar: 'rohan',
      body: 'I recommend Cosmo — I use it to scan, Easy Apply, and keep every application in one dashboard.',
    },
  ],
];

function renderBody(testimonial: Testimonial) {
  const parts = testimonial.body.split('Cosmo');
  return (
    <>
      {parts.map((part, partIndex) => (
        <span key={`${testimonial.id}-part-${partIndex}`}>
          {part}
          {partIndex < parts.length - 1 ? (
            <span className="testimonials__brand">Cosmo</span>
          ) : null}
        </span>
      ))}
      {testimonial.lines ? (
        <ul className="testimonials__lines">
          {testimonial.lines.map((line) => (
            <li key={`${testimonial.id}-${line}`}>{line}</li>
          ))}
        </ul>
      ) : null}
    </>
  );
}

export function TestimonialMasonry() {
  const [page, setPage] = useState(0);
  const activeColumns = columns.map((_column, columnIndex) => {
    const shift = (page + columnIndex) % columns.length;
    return columns[(columnIndex + shift) % columns.length];
  });

  return (
    <section className="testimonials" aria-label="Customer testimonials">
      <div className="testimonials__inner">
        <div className="testimonials__nav" aria-label="Testimonial pages">
          <button
            type="button"
            aria-label="Previous testimonials"
            disabled={page === 0}
            onClick={() => setPage((current) => Math.max(0, current - 1))}
            className="testimonials__nav-btn"
          >
            <ChevronLeft size={21} strokeWidth={1.6} aria-hidden="true" />
          </button>
          <button
            type="button"
            aria-label="Next testimonials"
            disabled={page === columns.length - 1}
            onClick={() =>
              setPage((current) => Math.min(columns.length - 1, current + 1))
            }
            className="testimonials__nav-btn"
          >
            <ChevronRight size={21} strokeWidth={1.6} aria-hidden="true" />
          </button>
        </div>

        <div className="testimonials__grid">
          {activeColumns.map((column, columnIndex) => (
            <div className="testimonials__column" key={`column-${columnIndex}`}>
              {column.map((testimonial) => (
                <article key={testimonial.id} className="testimonials__card">
                  <div className="testimonials__card-inner">
                    <img
                      className="testimonials__avatar"
                      src={`https://api.dicebear.com/9.x/notionists/svg?seed=${encodeURIComponent(testimonial.avatar)}`}
                      alt=""
                      width={48}
                      height={48}
                      loading="lazy"
                    />
                    <div className="testimonials__copy">
                      <header className="testimonials__meta">
                        <strong>{testimonial.name}</strong>
                        <span>{testimonial.handle}</span>
                      </header>
                      <div className="testimonials__body">
                        {renderBody(testimonial)}
                      </div>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          ))}
        </div>

        <p className="testimonials__footnote">
          <Quote size={14} aria-hidden="true" />
          <span>What people are saying about Cosmo</span>
        </p>
      </div>
    </section>
  );
}
