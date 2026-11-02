/**
 * LEGAL-RULED. Do not edit without the CEO / legal. Source: bitcoin-corp/legal/BSVEX-COPY-RULING-2026-11-02.md, item 7.
 * Third-party BSV-21 tickers we choose not to display on bsvex.com. Matched case-insensitively on the whole ticker
 * (spaces, dots and • separators ignored), so "test" also hides "TEST". They stay on chain; we just don't list them,
 * and "tokens listed" counts after hiding.
 */

// Hide: third-party brands, real people, weapons, anything implying official or state backing, test tokens, and our
// own group's tokens (bCorp/NPG; a group company listing its own tokens on its own board reads as self-promotion).
// Legal ruling: CEO 2 Nov 2026.
// Group tokens are hidden two ways: by ticker (below) and by deploy key (HIDDEN_DEPLOY_KEYS), so anything a group key
// deploys later is hidden automatically. Third-party keys that deploy brand / real-person names are hidden by key too,
// in a SEPARATE list (THIRD_PARTY_HIDDEN_KEYS); never mix them up with group keys. Issuers' own tokens (e.g. 1SAT,
// MNEE) stay visible, listed for information.
export const HIDDEN_TICKERS = [
  // Third-party brands
  "NIKE•AIR•MAX",
  "Genshin Impact",
  "YOURS.ORG",
  "TERANODE",
  // CHERRY: third party, not group (RB, 2 Nov 2026). Not our CherryX venture's token; hidden as a brand name.
  "CHERRY",
  // Real people
  "Nikola Jokić",
  "ELON",
  "Petition4Craig",
  // Weapons
  "AK47",
  "BSVGUN",
  // Implies official or state backing
  "Strategic Bitcoin SV Reserve",
  "Bitcoin",
  "BSV",
  "NUSD",
  // Abusive or misleading
  "SCAM",
  "PSYOP",
  "TERRORNODE",
  "TARD",
  // Test tokens
  "test",
  "TESTY",
  "VESTTEST",
  "TBTEST",
  "SPTEST",
  // Our own group (bCorp/NPG). Deployed by a group key (also caught by HIDDEN_DEPLOY_KEYS):
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
  "402",
  "$INDEXTOKEN",
] as const;

/**
 * Group deploy keys (bCorp/NPG): any BSV-21 token whose deploy transaction has an input signed by one of these public
 * keys is hidden, now and in future. Public keys only, read from public chain data; no secrets.
 */
export const HIDDEN_DEPLOY_KEYS = [
  // 13TKx3GpyugVsbFbfNbWiEDG1peNGWWFEn: deployed $BOASE, $NINJAPUNKGIRLS (x2), $bWriter, $1SHOT, $BOARDROOM, 1FeeX, PATH402.com
  "023ac31e68824c508654c8365d8cb3feeec3aa42acebeaa779d9f23c413cfa1b12",
] as const;

const norm = (s: string) => s.normalize("NFC").trim().toLowerCase().replace(/[•·._\s-]/g, "");
const HIDDEN = new Set<string>(HIDDEN_TICKERS.map(norm));

/**
 * Third-party deploy keys hidden under the brand / real-person rule. NOT group keys. Public keys only.
 */
export const THIRD_PARTY_HIDDEN_KEYS = [
  // Third party, not group (RB, 2 Nov 2026). 124D8P18AsJvmFAUSNnhwB5qC3CLfgsbK7: deployed CHERRY, Genshin Impact,
  // Nikola Jokić (x2), BSV and DOOKIE.
  "032a8eb0fae5123389b8ae40db53a0d4336e1072a51da17ba4246d33cd082ff11d",
] as const;

export const isHidden = (ticker: string) => HIDDEN.has(norm(ticker));

const KEYS = new Set<string>([...HIDDEN_DEPLOY_KEYS, ...THIRD_PARTY_HIDDEN_KEYS].map((k) => k.toLowerCase()));
export const isHiddenDeployer = (keys: readonly string[]) => keys.some((k) => KEYS.has(k.toLowerCase()));
