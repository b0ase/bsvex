/**
 * Read-only market data from the public 1Sat API (api.1sat.app, the data behind 1sat.market), refreshed every 5 min.
 * Nothing here trades; BSVEX only shows what 1Sat already publishes. Third-party pictures are never shown (no
 * safety scan yet), only names and numbers.
 */
const API = "https://api.1sat.app/1sat";

export type Token = { id: string; symbol: string; outputs: number; active: boolean };
export type Sale = { name: string; sats: number; at: number; outpoint: string };

async function get<T>(path: string): Promise<T | null> {
  try {
    const r = await fetch(`${API}${path}`, { next: { revalidate: 300 } });
    return r.ok ? ((await r.json()) as T) : null;
  } catch {
    return null;
  }
}

type RawToken = { token_id: string; symbol?: string; output_count?: number; is_active?: boolean; is_blacklisted?: boolean };
type RawSale = { outpoint: string; score: number; data?: { ordlock?: { name?: string; price?: number } } };

/** Mass-market family site: names with obvious swearing are left off the board (they stay on 1sat.market). */
const RUDE = /f[u#*@]ck|sh[i1!]t|c[u*]nt|b[i1]tch|n[i1]gg|wh[o0]re|p[o0]rn|dick|pussy|cock/i;
const clean = (name: string) => !RUDE.test(name.replace(/[•·._\s-]/g, ""));

export async function getTokens(): Promise<Token[]> {
  const raw = (await get<RawToken[]>("/bsv21/tokens?limit=200")) ?? [];
  return raw
    .filter((t) => t.symbol && !t.is_blacklisted && clean(t.symbol))
    .map((t) => ({ id: t.token_id, symbol: t.symbol!.slice(0, 32), outputs: t.output_count ?? 0, active: !!t.is_active }));
}

export async function getSales(): Promise<Sale[]> {
  const raw = (await get<RawSale[]>("/market/listings?status=sale&rev=true&limit=40")) ?? [];
  const floor = Date.UTC(2023, 0, 1) / 1000; // drop entries with broken timestamps
  return raw
    .filter((s) => s.score > floor && s.data?.ordlock?.price && clean(s.data.ordlock.name || ""))
    .map((s) => ({ name: (s.data!.ordlock!.name || "Untitled").slice(0, 48), sats: s.data!.ordlock!.price!, at: s.score * 1000, outpoint: s.outpoint }))
    .sort((a, b) => b.at - a.at);
}

export const sats = (n: number) =>
  n >= 1e8 ? `${(n / 1e8).toFixed(n >= 1e9 ? 1 : 2)} BSV` : n >= 1e6 ? `${(n / 1e6).toFixed(1)}M sats` : `${n.toLocaleString("en-GB")} sats`;

export function ago(ms: number): string {
  const s = Math.max(1, Math.round((Date.now() - ms) / 1000));
  if (s < 3600) return `${Math.round(s / 60) || 1}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
}
