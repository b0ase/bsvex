import { describe, expect, it } from 'vitest'
import * as m from '../src/math.js'
import { PROTOCOL_FEE_ADDRESS, PROTOCOL_FEE_BPS, LP_FEE_BPS, POOL_CAP_SATS, protocolFeeBpsFor } from '../src/config.js'
import { fixedCosts, quoteBuy, quoteSell } from '../src/quote.js'

const pool = (sats: bigint, tokens: bigint, family: 'ours' | 'thirdParty' = 'ours') =>
  m.initPool(sats, tokens, LP_FEE_BPS, protocolFeeBpsFor(family)).next

describe('owner decisions 28 Oct', () => {
  it('fee schedule and fee address', () => {
    expect(PROTOCOL_FEE_ADDRESS).toBe('1MMxztpc9fj5o5Mtp8CFqPwXJfeycCTw3L')
    expect(LP_FEE_BPS).toBe(25n)
    expect(PROTOCOL_FEE_BPS).toEqual({ ours: 5n, thirdParty: 10n })
    expect(POOL_CAP_SATS).toBe(100_000_000n)
  })
  it('third-party tokens pay twice the protocol fee', () => {
    const a = quoteBuy(pool(50_000_000n, 5_000_000n, 'ours'), 1_000_000n, 0n, 100n)
    const b = quoteBuy(pool(50_000_000n, 5_000_000n, 'thirdParty'), 1_000_000n, 0n, 100n)
    expect(a.protocolFee).toBe(500n)
    expect(b.protocolFee).toBe(1000n)
  })
  it('quote includes the index fee the user pays (3 token outputs on a buy)', () => {
    const q = quoteBuy(pool(50_000_000n, 5_000_000n), 1_000_000n, 0n, 100n)
    expect(q.fixed.indexFee).toBe(3_000n)
    expect(q.fixed.minerFee).toBe(2_642n) // 26,414 bytes at 100 sat/kB (Phase D; was 50,581)
    expect(q.totalSatsIn).toBe(1_000_000n + q.fixed.total)
  })
  it('sell quote nets out fixed costs; token change adds an index fee', () => {
    const s = pool(50_000_000n, 5_000_000n)
    expect(quoteSell(s, 10_000n, 0n, 50n, true).fixed.indexFee).toBe(3_000n)
    expect(quoteSell(s, 10_000n, 0n, 50n).netSatsOut).toBe(quoteSell(s, 10_000n, 0n, 50n).out - fixedCosts('swapTokensForSats', 50n).total)
  })
  it('refuses a buy that would take the pool over the 1 BSV cap', () => {
    expect(() => quoteBuy(pool(99_900_000n, 5_000_000n), 200_000n, 0n, 100n)).toThrow(/pool cap/)
  })
})
