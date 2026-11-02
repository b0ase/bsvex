// bsvex.com (owner, 1 Nov 2026): bMusicX's family look with BlastPad's structure (stats, board).
// Copy follows the CEO ruling of 2 Nov 2026 (bitcoin-corp/legal/BSVEX-COPY-RULING-2026-11-02.md): the site informs about
// what's on BSV and must not invite anyone to buy, sell or provide liquidity. No trade links, prices, sales, activity
// rankings or pool descriptions here; pool design stays in the GitHub docs.
import { Shell } from "@/components/Shell";
import { Board } from "@/components/Board";
import { getTokens } from "@/lib/market";

export const revalidate = 300;
const REPO = "https://github.com/b0ase/bsvex";

const CATS: Array<{ ic: string; t: string; d: string; live?: boolean; href?: string }> = [
  { ic: "◎", t: "Tokens", d: "BSV-21 tokens on chain, listed for information.", live: true, href: "#board" },
  { ic: "◆", t: "Art", d: "Fixed-price editions of art you minted, sold from bWalletX." },
  { ic: "♪", t: "Music", d: "Fixed-price editions of singles and albums you minted on bMusicX." },
  { ic: "▶", t: "Movies", d: "Fixed-price editions of films and clips you minted on bMoviesX and bVideoX." },
  { ic: "✦", t: "Names", d: "$names, PoW notes and tickets as fixed-price editions." },
];

const STATUS: Array<[boolean, string]> = [
  [true, "Browsing BSV-21 tokens on chain, listed for information (data from the public 1Sat index)"],
  [true, "Connect bWalletX"],
  [false, "Selling fixed-price editions of art, music and films you minted, straight from bWalletX"],
];

export default async function Home() {
  const tokens = await getTokens();
  return (
    <div className="bx">
      <Shell />

      <section className="bx-hero">
        <div className="bx-tiles" aria-hidden="true" />
        <div className="bx-ghost" aria-hidden="true">BSVEX</div>
        <div className="xs-wrap bx-hero-in">
          <h1 className="xs-h1">
            BSVE<i>X</i>
          </h1>
          <p className="xs-lede">
            See what&rsquo;s on BSV: tokens, art, music and films minted in bWalletX. Browsing only. Nothing is bought or sold
            on this site.
          </p>
          <div className="bx-btns">
            <a className="xs-btn bx-acc" href="#here">
              What&rsquo;s here
            </a>
            <a className="xs-btn xs-gold" href="https://bwalletx.com/get">
              Get bWalletX
            </a>
          </div>
        </div>
      </section>

      <main className="xs-wrap bx-main">
        <div className="bx-stats">
          <div>
            <small>Tokens listed</small>
            <b>{tokens.length.toLocaleString("en-GB")}</b>
          </div>
        </div>

        <section id="here" className="bx-trade">
          <p className="xs-eye">What&rsquo;s here</p>
          <h2 className="bx-h2">
            Sell what you <i>make</i> <span className="bx-later">(coming later).</span>
          </h2>
          <p className="bx-sub">
            Creators will be able to sell art, music and films they minted as fixed-price editions, straight from bWalletX. Not
            open yet.
          </p>
          <div className="bx-cats">
            {CATS.map((c) => (
              <a key={c.t} className={c.live ? "bx-cat live" : "bx-cat"} href={c.href ?? "#status"}>
                <span className="bx-cat-ic" aria-hidden="true">{c.ic}</span>
                <b>{c.t}</b>
                <span>{c.d}</span>
                <span className={c.live ? "st live" : "st"}>{c.live ? "Browse" : "Not open yet"}</span>
              </a>
            ))}
          </div>
        </section>

        <section id="board">
          <p className="xs-eye">The board</p>
          <h2 className="bx-h2">
            Already on <i>BSV</i>.
          </h2>
          <p className="bx-sub">BSV-21 tokens indexed by 1Sat, listed for information. Details opens each token&rsquo;s deploy transaction on a block explorer.</p>
          {tokens.length ? <Board tokens={tokens} /> : <p className="bx-empty">The token list didn&rsquo;t load. Try again in a minute.</p>}
        </section>

        <section id="status" className="bx-status">
          <p className="xs-eye">Status</p>
          <h2 className="bx-h2">
            Browsing <i>only</i>.
          </h2>
          <ul>
            {STATUS.map(([live, text]) => (
              <li key={text}>
                <span className={live ? "st live" : "st"}>{live ? "Live" : "Coming later"}</span>
                {text}
              </li>
            ))}
          </ul>
        </section>
      </main>

      <footer className="xs-wrap bx-foot">
        <p>
          Token data: the public 1Sat index; on-chain details: <a href="https://bitails.io">Bitails</a>. Tokens can lose all their
          value; nothing here is investment advice. BSVEX is open source (<a href={REPO}>GitHub</a>) and part of the{" "}
          <a href="https://bwalletx.com/family">bWalletX family</a>.
        </p>
        <p>
          BSVEX is run by The Bitcoin Corporation Ltd, registered in England and Wales no. 16735102, Flat 6, 315 Barking Road,
          London E13 8EE.
        </p>
      </footer>
    </div>
  );
}
