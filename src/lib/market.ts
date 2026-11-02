/**
 * Read-only token data from the public 1Sat index (api.1sat.app), refreshed every 5 min, plus each token's deploy time
 * from WhatsOnChain's public API. Nothing here trades and no prices or sales are shown (CEO copy ruling, 2 Nov 2026:
 * bitcoin-corp/legal/BSVEX-COPY-RULING-2026-11-02.md). Third-party pictures are never shown (no safety scan yet), only
 * names, dates and ids.
 */
import { isHidden } from "./hidden";

const API = "https://api.1sat.app/1sat";
const WOC_STATUS = "https://api.whatsonchain.com/v1/bsv/main/txs/status"; // up to 20 txids per call

/** at: deploy block time in ms, 0 if unknown (unconfirmed or the lookup failed). */
export type Token = { id: string; symbol: string; at: number };

/** Neutral on-chain page for a token: its deploy transaction on the Bitails block explorer (not a trading venue). */
export const explorerUrl = (tokenId: string) => `https://bitails.io/tx/${encodeURIComponent(tokenId.split("_")[0])}`;

async function get<T>(path: string): Promise<T | null> {
  try {
    const r = await fetch(`${API}${path}`, { next: { revalidate: 300 } });
    return r.ok ? ((await r.json()) as T) : null;
  } catch {
    return null;
  }
}

type RawToken = { token_id: string; symbol?: string; is_blacklisted?: boolean };

/** Mass-market family site: names with obvious swearing are left off the board (they stay on chain). */
const RUDE = /f[u#*@]ck|sh[i1!]t|c[u*]nt|b[i1]tch|n[i1]gg|wh[o0]re|p[o0]rn|dick|pussy|cock/i;
const clean = (name: string) => !RUDE.test(name.replace(/[•·._\s-]/g, ""));

/** Deploy times for the "Newest" sort. 1Sat's list isn't in date order, so we ask WhatsOnChain (20 txids a call). */
async function deployTimes(txids: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  for (let i = 0; i < txids.length; i += 20) {
    if (i) await new Promise((r) => setTimeout(r, 350)); // stay under WoC's 3 requests/second
    try {
      const r = await fetch(WOC_STATUS, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ txids: txids.slice(i, i + 20) }),
        next: { revalidate: 3600 },
      });
      if (!r.ok) continue;
      for (const s of (await r.json()) as Array<{ txid: string; blocktime?: number }>) if (s.blocktime) out.set(s.txid, s.blocktime * 1000);
    } catch {
      // leave these unknown; they sort last under "Newest"
    }
  }
  return out;
}

export async function getTokens(): Promise<Token[]> {
  const raw = (await get<RawToken[]>("/bsv21/tokens?limit=200")) ?? [];
  const shown = raw.filter((t) => t.symbol && !t.is_blacklisted && clean(t.symbol) && !isHidden(t.symbol));
  const times = await deployTimes([...new Set(shown.map((t) => t.token_id.split("_")[0]))]);
  return shown.map((t) => ({ id: t.token_id, symbol: t.symbol!.trim().slice(0, 32), at: times.get(t.token_id.split("_")[0]) ?? 0 }));
}
