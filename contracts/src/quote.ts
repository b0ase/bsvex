/**
 * Full-cost quote shown before the user signs (owner rule: real costs go into
 * prices; the user pays the index fee). Pool maths from math.ts plus the fixed
 * per-tx costs measured in Phase C.
 */
import * as m from './math.js'
import { INDEX_FEE_PER_TOKEN_OUTPUT_SATS, MEASURED_TX_BYTES, POOL_CAP_SATS, PoolOp, TOKEN_OUTPUTS } from './config.js'

export interface FixedCosts {
  minerFee: bigint
  indexFee: bigint
  dust: bigint
  total: bigint
}

/** Miner fee at `satsPerKb`, index fee per token output, 1 sat dust per token output. */
export function fixedCosts(op: PoolOp, satsPerKb: bigint, extraTokenOutputs = 0n): FixedCosts {
  const bytes = BigInt(MEASURED_TX_BYTES[op])
  const minerFee = (bytes * satsPerKb + 999n) / 1000n
  const outs = TOKEN_OUTPUTS[op] + extraTokenOutputs
  const indexFee = outs * INDEX_FEE_PER_TOKEN_OUTPUT_SATS
  const dust = outs
  return { minerFee, indexFee, dust, total: minerFee + indexFee + dust }
}

export interface SwapQuote extends m.SwapResult {
  fixed: FixedCosts
  /** Sats the trader spends in total (BSV -> token). */
  totalSatsIn?: bigint
  /** Sats the trader nets after fixed costs (token -> BSV). */
  netSatsOut?: bigint
}

export function quoteBuy(s: m.PoolState, satsIn: bigint, minOut: bigint, satsPerKb: bigint): SwapQuote {
  const r = m.swapSatsForTokens(s, satsIn, minOut)
  m.req(r.next.sats <= POOL_CAP_SATS, 'pool cap (1 BSV until audited)')
  const fixed = fixedCosts('swapSatsForTokens', satsPerKb)
  return { ...r, fixed, totalSatsIn: satsIn + fixed.total }
}

export function quoteSell(s: m.PoolState, tokensIn: bigint, minOut: bigint, satsPerKb: bigint, needsTokenChange = false): SwapQuote {
  const r = m.swapTokensForSats(s, tokensIn, minOut)
  const fixed = fixedCosts('swapTokensForSats', satsPerKb, needsTokenChange ? 1n : 0n)
  return { ...r, fixed, netSatsOut: r.out - fixed.total }
}
