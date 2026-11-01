"use client";
import { useMemo, useState } from "react";
import type { Token } from "@/lib/market";

const FILTERS = ["Most active", "Newest", "A–Z"] as const;

/** Token board (BlastPad's board structure): filter chips + search + cards. Read-only; trades happen on 1sat.market. */
export function Board({ tokens }: { tokens: Token[] }) {
  const [f, setF] = useState<(typeof FILTERS)[number]>("Most active");
  const [q, setQ] = useState("");
  const list = useMemo(() => {
    const m = tokens.filter((t) => !q || t.symbol.toLowerCase().includes(q.toLowerCase()));
    if (f === "Most active") return [...m].sort((a, b) => b.outputs - a.outputs);
    if (f === "A–Z") return [...m].sort((a, b) => a.symbol.localeCompare(b.symbol));
    return m; // API order: newest registered first
  }, [tokens, f, q]);
  return (
    <>
      <div className="bx-filters">
        {FILTERS.map((x) => (
          <button key={x} type="button" className={x === f ? "chip on" : "chip"} onClick={() => setF(x)}>
            {x}
          </button>
        ))}
        <input className="bx-search" placeholder="Filter by name" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Filter tokens by name" />
      </div>
      <div className="bx-grid">
        {list.slice(0, 24).map((t) => (
          <a key={t.id} className="bx-tok" href={`https://1sat.market/market/bsv21/${encodeURIComponent(t.id)}`} target="_blank" rel="noopener">
            <span className="bx-mono" aria-hidden="true">{t.symbol.replace(/[^A-Za-z0-9]/g, "").slice(0, 2).toUpperCase() || "?"}</span>
            <b>{t.symbol}</b>
            <span className="bx-meta">{t.outputs.toLocaleString("en-GB")} outputs on chain</span>
            <span className="bx-go">Trade on 1sat.market &rarr;</span>
          </a>
        ))}
        {!list.length && <p className="bx-empty">No tokens match.</p>}
      </div>
    </>
  );
}
