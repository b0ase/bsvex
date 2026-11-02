/**
 * Read-only token data from the public 1Sat index (api.1sat.app), refreshed every 5 min, plus each token's deploy time
 * and deploy signer from WhatsOnChain's public API. Nothing here trades and no prices or sales are shown (CEO copy ruling, 2 Nov 2026:
 * bitcoin-corp/legal/BSVEX-COPY-RULING-2026-11-02.md). Third-party pictures are never shown (no safety scan yet), only
 * names, dates and ids.
 */
import { unstable_cache } from "next/cache";
import { isHidden, isHiddenDeployer } from "./hidden";

const API = "https://api.1sat.app/1sat";
const WOC_TXS = "https://api.whatsonchain.com/v1/bsv/main/txs"; // decoded txs, up to 20 txids per call

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

type Deploy = { at: number; keys: string[] }; // block time in ms (0 if unconfirmed); public keys that signed its inputs
type RawTx = { txid: string; blocktime?: number; vin?: Array<{ scriptSig?: { asm?: string } }> };

/**
 * Deploy time (for "Newest") and deploy signers (for HIDDEN_DEPLOY_KEYS) of up to 20 deploy txs. Full decoded txs can
 * be large (inscriptions), so the raw responses are never cached; only this small result is, for a day (deploy txs
 * don't change). Throws on failure so a failed lookup isn't cached.
 */
const deployChunk = unstable_cache(
  async (txids: string[]): Promise<Record<string, Deploy>> => {
    const r = await fetch(WOC_TXS, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ txids }), cache: "no-store" });
    if (!r.ok) throw new Error(`WhatsOnChain ${r.status}`);
    const out: Record<string, Deploy> = {};
    for (const tx of (await r.json()) as RawTx[]) {
      const keys = (tx.vin ?? [])
        .map((v) => (v.scriptSig?.asm ?? "").split(" ").pop() ?? "")
        .filter((k) => /^(0[23][0-9a-f]{64}|04[0-9a-f]{128})$/i.test(k)); // P2PKH unlock: last push is the public key
      out[tx.txid] = { at: tx.blocktime ? tx.blocktime * 1000 : 0, keys: [...new Set(keys)] };
    }
    return out;
  },
  ["bsvex-deploy-v1"],
  { revalidate: 86400 },
);

async function deploys(txids: string[]): Promise<Map<string, Deploy>> {
  const out = new Map<string, Deploy>();
  const sorted = [...txids].sort(); // stable chunks, so cache keys repeat between runs
  for (let i = 0; i < sorted.length; i += 20) {
    if (i) await new Promise((r) => setTimeout(r, 350)); // stay under WoC's 3 requests/second
    try {
      for (const [id, d] of Object.entries(await deployChunk(sorted.slice(i, i + 20)))) out.set(id, d);
    } catch {
      // unknown: no date (sorts last under "Newest") and no signer check; group tickers are still hidden by name
    }
  }
  return out;
}

export async function getTokens(): Promise<Token[]> {
  const raw = (await get<RawToken[]>("/bsv21/tokens?limit=200")) ?? [];
  const shown = raw.filter((t) => t.symbol && !t.is_blacklisted && clean(t.symbol) && !isHidden(t.symbol));
  const info = await deploys([...new Set(shown.map((t) => t.token_id.split("_")[0]))]);
  return shown
    .map((t) => ({ t, d: info.get(t.token_id.split("_")[0]) }))
    .filter(({ d }) => !d || !isHiddenDeployer(d.keys))
    .map(({ t, d }) => ({ id: t.token_id, symbol: t.symbol!.trim().slice(0, 32), at: d?.at ?? 0 }));
}
