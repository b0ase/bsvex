// Holding page (owner, 27 Oct 2026). The old "burn L1 tokens for BSV" site is retired: it promised a service we
// don't run. Minimal by rule: name + COMING SOON™, nothing else. Plan: VexVoid/BSVEX-PLAN.md.
export default function Home() {
  return (
    <main className="hold">
      <h1 className="mark" aria-label="BSVEX">
        BSVE<span className="x">X</span>
      </h1>
      <p className="soon">COMING SOON™</p>
    </main>
  );
}
