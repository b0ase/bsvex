"use client";
import { useMemo, useState } from "react";
import { explorerUrl, type Token } from "@/lib/market";

// CEO copy ruling (2 Nov 2026): A–Z by default plus Newest; no activity ranking, no prices, no trade links.
const FILTERS = ["A–Z", "Newest"] as const;
const PAGE = 24;

const since = (ms: number) => new Date(ms).toLocaleDateString("en-GB", { month: "short", year: "numeric", timeZone: "UTC" });
const shortId = (id: string) => `${id.slice(0, 6)}…${id.slice(-6)}`;

/** Token board: sort chips + search + cards. Read-only; each card opens the token's deploy transaction on a block explorer. */
export function Board({ tokens }: { tokens: Token[] }) {
  const [f, setF] = useState<(typeof FILTERS)[number]>("A–Z");
  const [q, setQ] = useState("");
  const [all, setAll] = useState(false);
  const list = useMemo(() => {
    const m = tokens.filter((t) => !q || t.symbol.toLowerCase().includes(q.toLowerCase()));
    if (f === "Newest") return [...m].sort((a, b) => b.at - a.at);
    return [...m].sort((a, b) => a.symbol.localeCompare(b.symbol, "en", { sensitivity: "base" }));
  }, [tokens, f, q]);
  const shown = all ? list : list.slice(0, PAGE);
  return (
    <>
      <div className="bx-filters">
        {FILTERS.map((x) => (
          <button key={x} type="button" className={x === f ? "chip on" : "chip"} aria-pressed={x === f} onClick={() => setF(x)}>
            {x}
          </button>
        ))}
        <input className="bx-search" placeholder="Filter by name" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Filter tokens by name" />
      </div>
      <div className="bx-grid">
        {shown.map((t) => (
          <a key={t.id} className="bx-tok" href={explorerUrl(t.id)} target="_blank" rel="noopener noreferrer">
            <span className="bx-mono" aria-hidden="true">{t.symbol.replace(/[^A-Za-z0-9]/g, "").slice(0, 2).toUpperCase() || "?"}</span>
            <b>{t.symbol}</b>
            <span className="bx-meta">{t.at ? `Deployed ${since(t.at)}` : shortId(t.id)}</span>
            <span className="bx-go">Details</span>
          </a>
        ))}
        {!list.length && <p className="bx-empty">No tokens match.</p>}
      </div>
      {list.length > PAGE && (
        <div className="bx-more">
          <button type="button" className="chip" onClick={() => setAll(!all)}>
            {all ? "Show fewer" : `Show all ${list.length}`}
          </button>
        </div>
      )}
    </>
  );
}
