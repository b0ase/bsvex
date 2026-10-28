/**
 * Constant-product AMM maths, integer-only (bigint).
 *
 * Every expression here is written so it can be expressed one-to-one in
 * sCrypt (bigint add/sub/mul/div, no floats). The on-chain contract
 * (src/AmmPool.ts) uses the same formulas; the mock chain (src/mockchain.ts)
 * uses these functions to validate transactions the way the contract would.
 *
 * Units: `sats` are BSV satoshis, `tokens` are BSV-21 base units, `lp` are
 * LP-share base units. Fees are in basis points (1 bp = 0.01%).
 */

export const BPS = 10_000n
/** LP shares locked forever at pool creation (Uniswap v2 style) so the
 *  first depositor cannot make a share worth an unbounded amount. */
export const MIN_LIQUIDITY = 1_000n
/** Protocol fee output is never below this (dust guard). */
export const MIN_PROTOCOL_FEE = 1n

export class AmmError extends Error {}

export function req(cond: boolean, msg: string): asserts cond {
  if (!cond) throw new AmmError(msg)
}

export interface PoolState {
  /** BSV reserve held by the pool state output (sats). */
  sats: bigint
  /** BSV-21 reserve held by the token vault output. */
  tokens: bigint
  /** LP shares in circulation (including the locked MIN_LIQUIDITY). */
  lpSupply: bigint
  /** LP fee, bp. Stays in the pool. */
  lpFeeBps: bigint
  /** Protocol fee, bp. Paid out as a separate sats output. */
  protocolFeeBps: bigint
}

export function isqrt(n: bigint): bigint {
  req(n >= 0n, 'isqrt of negative')
  if (n < 2n) return n
  let x = n
  let y = (x + 1n) / 2n
  while (y < x) {
    x = y
    y = (x + n / x) / 2n
  }
  return x
}

/** ceil(a*b/c) for non-negative ints. Fees round UP (against the trader). */
export function mulDivUp(a: bigint, b: bigint, c: bigint): bigint {
  return (a * b + c - 1n) / c
}

/** Uniswap v2 getAmountOut with the LP fee applied to the input. Rounds DOWN
 *  (against the trader, in favour of the pool). */
export function amountOut(amountIn: bigint, reserveIn: bigint, reserveOut: bigint, lpFeeBps: bigint): bigint {
  req(amountIn > 0n, 'amountIn must be > 0')
  req(reserveIn > 0n && reserveOut > 0n, 'empty pool')
  const inWithFee = amountIn * (BPS - lpFeeBps)
  return (inWithFee * reserveOut) / (reserveIn * BPS + inWithFee)
}

export function protocolFee(amountSats: bigint, protocolFeeBps: bigint): bigint {
  const f = mulDivUp(amountSats, protocolFeeBps, BPS)
  return f < MIN_PROTOCOL_FEE ? MIN_PROTOCOL_FEE : f
}

export interface SwapResult {
  next: PoolState
  /** What the trader receives (sats or tokens). */
  out: bigint
  /** Sats paid to the protocol fee address. */
  protocolFee: bigint
}

/**
 * BSV -> token. The protocol fee is skimmed from the sats going in, so the
 * fee output is always in sats (never a token output, which would cost an
 * extra indexing fee).
 */
export function swapSatsForTokens(s: PoolState, satsIn: bigint, minTokensOut: bigint): SwapResult {
  req(satsIn > 0n, 'satsIn must be > 0')
  const pFee = protocolFee(satsIn, s.protocolFeeBps)
  req(satsIn > pFee, 'input does not cover protocol fee')
  const net = satsIn - pFee
  const out = amountOut(net, s.sats, s.tokens, s.lpFeeBps)
  req(out > 0n, 'zero output')
  req(out >= minTokensOut, 'slippage: tokens out below minimum')
  req(out < s.tokens, 'insufficient token reserve')
  const next = { ...s, sats: s.sats + net, tokens: s.tokens - out }
  assertK(s, next)
  return { next, out, protocolFee: pFee }
}

/** token -> BSV. The protocol fee is skimmed from the sats coming out. */
export function swapTokensForSats(s: PoolState, tokensIn: bigint, minSatsOut: bigint): SwapResult {
  req(tokensIn > 0n, 'tokensIn must be > 0')
  const gross = amountOut(tokensIn, s.tokens, s.sats, s.lpFeeBps)
  const pFee = protocolFee(gross, s.protocolFeeBps)
  req(gross > pFee, 'output does not cover protocol fee')
  const out = gross - pFee
  req(out >= minSatsOut, 'slippage: sats out below minimum')
  req(gross < s.sats, 'insufficient sats reserve')
  const next = { ...s, sats: s.sats - gross, tokens: s.tokens + tokensIn }
  assertK(s, next)
  return { next, out, protocolFee: pFee }
}

/** k must never decrease. Enforced on chain as well as implied by the maths. */
export function assertK(prev: PoolState, next: PoolState): void {
  req(next.sats * next.tokens >= prev.sats * prev.tokens, 'invariant: k decreased')
}

export interface AddResult {
  next: PoolState
  /** Tokens the depositor must put in for `sats` (rounded up, in favour of the pool). */
  tokensIn: bigint
  /** LP shares minted to the depositor. */
  lpOut: bigint
}

/** First deposit sets the price. MIN_LIQUIDITY shares stay locked forever. */
export function initPool(sats: bigint, tokens: bigint, lpFeeBps: bigint, protocolFeeBps: bigint): AddResult {
  req(sats > 0n && tokens > 0n, 'initial reserves must be > 0')
  req(lpFeeBps >= 0n && protocolFeeBps >= 0n && lpFeeBps + protocolFeeBps < 1_000n, 'fees out of range (< 10%)')
  const root = isqrt(sats * tokens)
  req(root > MIN_LIQUIDITY, 'initial liquidity too small')
  const next: PoolState = { sats, tokens, lpSupply: root, lpFeeBps, protocolFeeBps }
  return { next, tokensIn: tokens, lpOut: root - MIN_LIQUIDITY }
}

export function addLiquidity(s: PoolState, satsIn: bigint, maxTokensIn: bigint, minLpOut: bigint): AddResult {
  req(satsIn > 0n, 'satsIn must be > 0')
  const tokensIn = mulDivUp(satsIn, s.tokens, s.sats)
  req(tokensIn <= maxTokensIn, 'slippage: token deposit above maximum')
  const lpOut = (satsIn * s.lpSupply) / s.sats
  req(lpOut > 0n, 'deposit too small for one LP share')
  req(lpOut >= minLpOut, 'slippage: LP out below minimum')
  const next = { ...s, sats: s.sats + satsIn, tokens: s.tokens + tokensIn, lpSupply: s.lpSupply + lpOut }
  return { next, tokensIn, lpOut }
}

export interface RemoveResult {
  next: PoolState
  satsOut: bigint
  tokensOut: bigint
}

export function removeLiquidity(s: PoolState, lpIn: bigint, minSatsOut: bigint, minTokensOut: bigint): RemoveResult {
  req(lpIn > 0n, 'lpIn must be > 0')
  req(lpIn <= s.lpSupply - MIN_LIQUIDITY, 'cannot burn locked liquidity')
  const satsOut = (lpIn * s.sats) / s.lpSupply
  const tokensOut = (lpIn * s.tokens) / s.lpSupply
  req(satsOut > 0n && tokensOut > 0n, 'withdrawal too small')
  req(satsOut >= minSatsOut && tokensOut >= minTokensOut, 'slippage: withdrawal below minimum')
  const next = { ...s, sats: s.sats - satsOut, tokens: s.tokens - tokensOut, lpSupply: s.lpSupply - lpIn }
  return { next, satsOut, tokensOut }
}

/** Value of one LP share, scaled by 1e12, in sats-times-tokens space: sqrt(k)/L.
 *  Must never fall across swaps, adds or removes (rounding only ever helps LPs). */
export function shareValueScaled(s: PoolState): bigint {
  return (isqrt(s.sats * s.tokens) * 1_000_000_000_000n) / s.lpSupply
}
