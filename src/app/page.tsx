// bsvex.com (owner, 1 Nov 2026): bMusicX's family look with BlastPad's structure (ticker, stats, board, live rail).
// Read-only BSV-21 data from 1sat.market's public API; BSVEX's own pools are not open yet. Plan: docs/amm-design.md.
import { Shell } from "@/components/Shell";
import { Board } from "@/components/Board";
import { getSales, getTokens, sats, ago } from "@/lib/market";

export const revalidate = 300;
const REPO = "https://github.com/b0ase/bsvex";

const STATUS: Array<[boolean, string, string?]> = [
  [true, "Live: BSV-21 token board and recent 1Sat market sales, read from 1sat.market"],
  [true, "Live: connect bWalletX"],
  [false, "Built, in review: pool design, maths, simulated chain, compiled contracts", `${REPO}/pulls`],
  [false, "Not open yet: security audit, testnet pools"],
  [false, "Not open yet: swapping and adding liquidity in BSVEX pools"],
];

export default async function Home() {
  const [tokens, sales] = await Promise.all([getTokens(), getSales()]);
  const top = [...tokens].sort((a, b) => b.outputs - a.outputs)[0];
  const latest = [...sales].sort((a, b) => b.at - a.at)[0];
  const tick = sales.slice(0, 12);
  return (
    <div className="bx">
      <Shell />

      <section className="bx-hero">
        <div className="bx-eq" aria-hidden="true">
          {Array.from({ length: 64 }, (_, i) => (
            <span key={i} style={{ animationDelay: `${(i * 137) % 1000}ms`, height: `${20 + ((i * 53) % 70)}%` }} />
          ))}
        </div>
        <div className="bx-ghost" aria-hidden="true">BSVEX</div>
        <div className="xs-wrap bx-hero-in">
          <h1 className="xs-h1">
            BSVE<i>X</i>
          </h1>
          <p className="xs-lede">Every BSV-21 token in one place, with recent sales from 1sat.market. Our open, on-chain exchange is not open yet.</p>
          <div className="bx-btns">
            <a className="xs-btn bx-acc" href="#board">
              Browse tokens
            </a>
            <a className="xs-btn xs-ghost" href="#status">
              How BSVEX works
            </a>
            <a className="xs-btn xs-gold" href="https://bwalletx.com/get">
              Get bWalletX
            </a>
          </div>
        </div>
      </section>

      {tick.length > 0 && (
        <div className="bx-ticker" aria-label="Recent 1Sat market sales">
          <span className="bx-live">● RECENT SALES</span>
          <div className="bx-tape">
            {[...tick, ...tick].map((s, i) => (
              <span key={i}>
                <b>{s.name}</b> sold <em>{sats(s.sats)}</em> {ago(s.at)}
              </span>
            ))}
          </div>
        </div>
      )}

      <main className="xs-wrap bx-main">
        <div className="bx-stats">
          <div>
            <small>Tokens tracked</small>
            <b>{tokens.length.toLocaleString("en-GB")}</b>
          </div>
          <div>
            <small>Latest 1Sat sale</small>
            <b>{latest ? ago(latest.at) : "—"}</b>
          </div>
          <div>
            <small>Most active token</small>
            <b>{top?.symbol ?? "—"}</b>
          </div>
          <div>
            <small>BSVEX pools</small>
            <b className="bx-dim">Not open yet</b>
          </div>
        </div>

        <div className="bx-cols">
          <section id="board">
            <p className="xs-eye">The board</p>
            <h2 className="bx-h2">
              Already on <i>BSV</i>.
            </h2>
            <p className="bx-sub">BSV-21 tokens indexed by 1Sat, by on-chain activity. Tap one to trade it on 1sat.market.</p>
            {tokens.length ? <Board tokens={tokens} /> : <p className="bx-empty">The token list didn&rsquo;t load. Try again in a minute.</p>}
          </section>

          <aside id="sales" className="bx-rail">
            {top && (
              <div className="bx-king">
                <p className="xs-eye">Most active</p>
                <span className="bx-mono big" aria-hidden="true">{top.symbol.replace(/[^A-Za-z0-9]/g, "").slice(0, 2).toUpperCase()}</span>
                <b>{top.symbol}</b>
                <span>{top.outputs.toLocaleString("en-GB")} outputs on chain</span>
              </div>
            )}
            <div className="bx-feed">
              <p className="xs-eye">Recent 1Sat sales</p>
              {sales.slice(0, 14).map((s) => (
                <div key={s.outpoint} className="bx-row">
                  <span className="nm">{s.name}</span>
                  <span className="pr">{sats(s.sats)}</span>
                  <span className="t">{ago(s.at)}</span>
                </div>
              ))}
              {!sales.length && <p className="bx-empty">No recent sales loaded.</p>}
            </div>
          </aside>
        </div>

        <section id="status" className="bx-status">
          <p className="xs-eye">How BSVEX works</p>
          <h2 className="bx-h2">
            An open exchange, run by <i>contracts</i>.
          </h2>
          <div className="bx-how">
            <div><b>One pool per token</b><span>Held by a smart contract on chain, not by us.</span></div>
            <div><b>Swap from bWalletX</b><span>The contract prices each trade from what&rsquo;s in the pool.</span></div>
            <div><b>Anyone adds liquidity</b><span>And gets a pool token that tracks their share.</span></div>
            <div><b>Every trade is public</b><span>Fees are fixed in the contract; every trade is a Bitcoin transaction.</span></div>
          </div>
          <ul>
            {STATUS.map(([live, text, href]) => (
              <li key={text}>
                <span className={live ? "st live" : "st"}>{live ? "Live" : text.startsWith("Built") ? "In review" : "Not open yet"}</span>
                {href ? <a href={href}>{text.replace(/^[^:]+: /, "")}</a> : text.replace(/^[^:]+: /, "")}
              </li>
            ))}
          </ul>
        </section>
      </main>

      <footer className="xs-wrap bx-foot">
        <p>
          Token data and sales: <a href="https://1sat.market">1sat.market</a>. Tokens can lose all their value; nothing here is
          investment advice. BSVEX is open source (<a href={REPO}>GitHub</a>) and part of the{" "}
          <a href="https://bwalletx.com/family">bWalletX family</a>.
        </p>
      </footer>
    </div>
  );
}
