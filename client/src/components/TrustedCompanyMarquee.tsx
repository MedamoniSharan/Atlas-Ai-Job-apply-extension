import * as React from 'react';

type CompanyLogo = {
  name: string;
  src: string;
  width: number;
  height: number;
  fit?: 'cover' | 'contain';
};

export type TrustedCompanyMarqueeProps = {
  title?: string;
  logos?: CompanyLogo[];
  speedSeconds?: number;
};

const defaultLogos: CompanyLogo[] = [
  {
    name: 'Company logo one',
    src: 'https://framerusercontent.com/images/InX7j1rY68VSwzDzV1t4J8uOFc.png?scale-down-to=512&width=640&height=217',
    width: 105,
    height: 36,
  },
  {
    name: 'Company logo two',
    src: 'https://framerusercontent.com/images/OTzCycynYVCb7RdP3a40StypA.png?scale-down-to=512&width=700&height=211',
    width: 121,
    height: 36,
  },
  {
    name: 'Company logo three',
    src: 'https://framerusercontent.com/images/MN5qULmW3TFtS3p1YCCIQ9rJQAo.png?scale-down-to=1024&width=1280&height=305',
    width: 155,
    height: 40,
    fit: 'contain',
  },
  {
    name: 'Company logo four',
    src: 'https://framerusercontent.com/images/GSYKz0Bw3P4O1jMlwur1vQs8.png?width=372&height=480',
    width: 30,
    height: 39,
  },
  {
    name: 'Company logo five',
    src: 'https://framerusercontent.com/images/0n1i5PdzNMz6WnE55S4WhzyYmk.png?scale-down-to=1024&width=1280&height=167',
    width: 143,
    height: 19,
  },
  {
    name: 'Company logo six',
    src: 'https://framerusercontent.com/images/zKbPa6YVKpyeA9gfp6WFds8HdU.png?scale-down-to=2048&width=2400&height=1908',
    width: 50,
    height: 40,
  },
  {
    name: 'Company logo seven',
    src: 'https://framerusercontent.com/images/7H0jp8eiv9IRWBZJtZziQYohi3c.png?scale-down-to=1024&width=1200&height=1200',
    width: 39,
    height: 39,
  },
];

const LogoSet = ({ logos }: { logos: CompanyLogo[] }) => (
  <ul className="trusted-logo-set" aria-hidden="true">
    {logos.map((logo, index) => (
      <li className="trusted-logo-item" key={`${logo.name}-${index}`}>
        <img
          src={logo.src}
          alt=""
          width={logo.width}
          height={logo.height}
          loading="lazy"
          style={{
            objectFit: logo.fit ?? 'cover',
          }}
        />
      </li>
    ))}
  </ul>
);

export const TrustedCompanyMarquee = ({
  title = 'Get Hired by top companies worldwide',
  logos = defaultLogos,
  speedSeconds = 28,
}: TrustedCompanyMarqueeProps) => {
  const repeatedLogos = [...logos, ...logos, ...logos];
  return (
    <section className="trusted-companies" aria-label="Trusted companies">
      <p className="trusted-companies-title">{title}</p>
      <div
        className="trusted-marquee"
        style={
          {
            '--marquee-speed': `${speedSeconds}s`,
          } as React.CSSProperties
        }
      >
        <div className="trusted-marquee-track">
          <LogoSet logos={repeatedLogos} />
          <LogoSet logos={repeatedLogos} />
        </div>
      </div>
    </section>
  );
};
