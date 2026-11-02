/**
 * LEGAL-RULED. Do not edit without the CEO / legal. Source: bitcoin-corp/legal/BSVEX-COPY-RULING-2026-11-02.md, item 7.
 * Third-party BSV-21 tickers we choose not to display on bsvex.com. Matched case-insensitively on the whole ticker
 * (spaces, dots and • separators ignored), so "test" also hides "TEST". They stay on chain; we just don't list them,
 * and "tokens listed" counts after hiding.
 */

// Hide: third-party brands, real people, weapons, anything implying official or state backing, test tokens, and our
// own group's tokens (bCorp/NPG; a group company listing its own tokens on its own board reads as self-promotion).
// Legal ruling: CEO 2 Nov 2026.
export const HIDDEN_TICKERS = [
  // Third-party brands
  "NIKE•AIR•MAX",
  "Genshin Impact",
  "YOURS.ORG",
  // Real people
  "Nikola Jokić",
  "ELON",
  // Weapons
  "AK47",
  "BSVGUN",
  // Implies official or state backing
  "Strategic Bitcoin SV Reserve",
  // Abusive or misleading
  "SCAM",
  "PSYOP",
  "TERRORNODE",
  // Test tokens
  "test",
  "TESTY",
  "VESTTEST",
  "TBTEST",
  "SPTEST",
  // Our own group (bCorp/NPG). Same deploy key as $BOASE:
  "$BOASE",
  "$NINJAPUNKGIRLS",
  "$bWriter",
  "$1SHOT",
  "$BOARDROOM",
  "1FeeX",
  "PATH402.com",
  // Our own group, by name (our products and brands):
  "BWALLETX",
  "BMUSICX",
  "BMOVIESX",
  "B0ASEX",
  "RICHARDWBOASE",
  "VEXVOID",
  "$NERD",
  "CHERRY",
] as const;

const norm = (s: string) => s.normalize("NFC").trim().toLowerCase().replace(/[•·._\s-]/g, "");
const HIDDEN = new Set<string>(HIDDEN_TICKERS.map(norm));

export const isHidden = (ticker: string) => HIDDEN.has(norm(ticker));
