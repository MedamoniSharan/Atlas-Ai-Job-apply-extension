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
        curviness={18}
        fontSize={22}
        fontWeight={800}
        letterSpacing={1.5}
        uppercase
        color="#ffffff"
        ribbon
        ribbonColor="#000000"
        ribbonWidth={40}
        viewHeight={96}
        pauseOnHover={false}
      />
    </section>
  );
}
