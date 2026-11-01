// Explainer page (owner, 1 Nov 2026): says what BSVEX is and what is built, with no trading or deposits.
// Replaces the bare holding page (27 Oct). Nothing here touches funds; trading stays closed until the contracts are
// audited and tested on testnet. Plan: VexVoid/BSVEX-PLAN.md §9; design: docs/amm-design.md.
const REPO = "https://github.com/b0ase/bsvex";

const STATUS: Array<{ done: boolean; text: string; href?: string }> = [
  { done: true, text: "Pool design and pricing maths, with tests", href: `${REPO}/pull/3` },
  { done: true, text: "Simulated chain to test pools before real money", href: `${REPO}/pull/3` },
  { done: true, text: "Pool contracts compiled and measured", href: `${REPO}/pull/4` },
  { done: true, text: "Pool contract made about half the size", href: `${REPO}/pull/5` },
  { done: false, text: "Independent security audit" },
  { done: false, text: "Testnet pools" },
  { done: false, text: "Trading, liquidity and the open indexer on mainnet" },
];

export default function Home() {
  return (
    <main className="page">
      <section className="hero">
        <h1 className="mark" aria-label="BSVEX">
          BSVE<span className="x">X</span>
        </h1>
        <p className="lede">An open exchange for BSV-21 tokens, run by contracts on Bitcoin. Nobody holds your coins.</p>
        <p className="soon">NOT OPEN YET</p>
      </section>

      <section className="how">
        <h2>How it will work</h2>
        <div className="cards">
          <div className="card">
            <b>One pool per token</b>
            <span>Each token gets a pool of BSV and tokens held by a smart contract on chain, not by us.</span>
          </div>
          <div className="card">
            <b>Swap from your wallet</b>
            <span>You trade straight from bWalletX. The contract sets the price from what is in the pool.</span>
          </div>
          <div className="card">
            <b>Anyone can add liquidity</b>
            <span>Put BSV and tokens into a pool and receive a pool token that tracks your share.</span>
          </div>
          <div className="card">
            <b>Every trade is public</b>
            <span>Fees are fixed in the contract and every trade is a Bitcoin transaction anyone can check.</span>
          </div>
        </div>
      </section>

      <section className="status">
        <h2>Where we are</h2>
        <ul>
          {STATUS.map((s) => (
            <li key={s.text}>
              <span className={s.done ? "tag done" : "tag"}>{s.done ? "Built, in review" : "Not open yet"}</span>
              {s.href ? (
                <a href={s.href} target="_blank" rel="noopener">
                  {s.text}
                </a>
              ) : (
                s.text
              )}
            </li>
          ))}
        </ul>
      </section>

      <section className="open">
        <h2>Open source</h2>
        <p>
          The contracts, maths and indexer are open source under the Open BSV License. The work is in review on GitHub:
          read the code, run the tests, or build your own front end.
        </p>
        <a className="btn" href={REPO} target="_blank" rel="noopener">
          See the code on GitHub
        </a>
      </section>

      <footer className="foot">
        <p>
          Nothing here is live: don&rsquo;t send funds. BSVEX is part of the{" "}
          <a href="https://bwalletx.com/family">bWalletX family</a>.
        </p>
      </footer>
    </main>
  );
}
