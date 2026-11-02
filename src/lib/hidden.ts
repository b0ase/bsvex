/**
 * LEGAL-RULED. Do not edit without the CEO / legal. Source: bitcoin-corp/legal/BSVEX-COPY-RULING-2026-11-02.md, item 7.
 * Third-party BSV-21 tickers we choose not to display on bsvex.com: brand-infringing names and abusive or misleading
 * names. Matched case-insensitively on the whole ticker (spaces, dots and • separators ignored), so "test" also hides
 * "TEST" and "NIKE AIR MAX". They stay on chain; we just don't list them, and "Tokens listed" counts after hiding.
 */
export const HIDDEN_TICKERS = ["NIKE•AIR•MAX", "SCAM", "PSYOP", "test"] as const;

const norm = (s: string) => s.trim().toLowerCase().replace(/[•·._\s-]/g, "");
const HIDDEN = new Set(HIDDEN_TICKERS.map(norm));

export const isHidden = (ticker: string) => HIDDEN.has(norm(ticker));
