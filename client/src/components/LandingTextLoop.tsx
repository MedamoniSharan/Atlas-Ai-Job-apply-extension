import TextLoop from './TextLoop';

export function LandingTextLoop() {
  return (
    <section className="landing-text-loop" aria-label="Cosmo highlights">
      <TextLoop
        text="Cosmo ✦ Naukri Auto Apply"
        shape="wave"
        speed={90}
        direction="forward"
        separator="✦"
        curviness={28}
        fontSize={34}
        fontWeight={800}
        letterSpacing={2}
        uppercase
        color="#ffffff"
        ribbon
        ribbonColor="#15362b"
        ribbonWidth={64}
        viewHeight={148}
        pauseOnHover={false}
      />
    </section>
  );
}
