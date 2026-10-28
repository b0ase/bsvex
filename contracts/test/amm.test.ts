import { describe, expect, it } from 'vitest'
import * as m from '../src/math.js'
import { MockChain, TxRejected, type Output } from '../src/mockchain.js'
import * as c from '../src/client.js'

const TOKEN = 'aaaa_0'
const LP = 'bbbb_0'
const PROTO = 'protocol-fee-address'

function setup(opts: { sats?: bigint; tokens?: bigint } = {}) {
  const chain = new MockChain()
  const ref = c.createPool(chain, {
    tokenId: TOKEN,
    lpTokenId: LP,
    protocolAddr: PROTO,
    sats: opts.sats ?? 100_000_000n, // 1 BSV
    tokens: opts.tokens ?? 1_000_000_000n,
    lpFeeBps: 25n,
    protocolFeeBps: 5n,
    lpOwner: 'seeder',
  })
  chain.mint([
    { sats: 10_000_000n, script: { kind: 'p2pkh', owner: 'alice' } },
    { sats: 10_000_000n, script: { kind: 'p2pkh', owner: 'bob' } },
    { sats: 1n, script: { kind: 'p2pkh', owner: 'bob' }, bsv21: { id: TOKEN, amt: 50_000_000n } },
  ])
  return { chain, ref }
}

const k = (s: m.PoolState) => s.sats * s.tokens

describe('swaps', () => {
  it('BSV -> token pays the trader, the pool and the protocol', () => {
    const { chain, ref } = setup()
    const before = c.poolState(chain, ref)
    const quote = m.swapSatsForTokens(before, 1_000_000n, 0n)
    c.swapSatsForTokens(chain, ref, 'alice', 1_000_000n, quote.out)
    const after = c.poolState(chain, ref)
    expect(c.balance(chain, 'alice', TOKEN)).toBe(quote.out)
    expect(c.balance(chain, PROTO)).toBe(quote.protocolFee)
    expect(quote.protocolFee).toBe(500n) // 5 bp of 1,000,000
    expect(after.sats).toBe(before.sats + 1_000_000n - 500n)
    expect(k(after)).toBeGreaterThan(k(before))
    // ~1% of reserve in, minus 0.30% total fees and price impact.
    expect(quote.out).toBeGreaterThan(9_800_000n)
    expect(quote.out).toBeLessThan(9_900_000n)
  })

  it('token -> BSV pays the protocol fee in sats', () => {
    const { chain, ref } = setup()
    const before = c.poolState(chain, ref)
    const quote = m.swapTokensForSats(before, 10_000_000n, 0n)
    const bobBefore = c.balance(chain, 'bob')
    c.swapTokensForSats(chain, ref, 'bob', 10_000_000n, quote.out)
    expect(c.balance(chain, 'bob') - bobBefore).toBe(quote.out)
    expect(c.balance(chain, 'bob', TOKEN)).toBe(40_000_000n)
    expect(c.balance(chain, PROTO)).toBe(quote.protocolFee)
    expect(k(c.poolState(chain, ref))).toBeGreaterThan(k(before))
  })

  it('round trip loses only fees and rounding, never gains', () => {
    const { chain, ref } = setup()
    const start = c.balance(chain, 'alice')
    c.swapSatsForTokens(chain, ref, 'alice', 2_000_000n, 0n)
    const got = c.balance(chain, 'alice', TOKEN)
    c.swapTokensForSats(chain, ref, 'alice', got, 0n)
    const end = c.balance(chain, 'alice')
    expect(end).toBeLessThan(start)
    // Round trip costs roughly 2 x 0.30% plus 1 sat of token dust per leg.
    expect(start - end).toBeLessThan(2_000_000n * 61n / 10_000n + 10n)
  })

  it('min-out reverts both ways (contract rejects, nothing moves)', () => {
    const { chain, ref } = setup()
    const s = c.poolState(chain, ref)
    const q1 = m.swapSatsForTokens(s, 1_000_000n, 0n)
    expect(() => c.swapSatsForTokens(chain, ref, 'alice', 1_000_000n, q1.out + 1n)).toThrow(/slippage/)
    const q2 = m.swapTokensForSats(s, 1_000_000n, 0n)
    expect(() => c.swapTokensForSats(chain, ref, 'bob', 1_000_000n, q2.out + 1n)).toThrow(TxRejected)
    expect(c.poolState(chain, ref)).toEqual(s)
  })

  it('rejects a tx that underpays the protocol fee or overpays the trader', () => {
    const { chain, ref } = setup()
    const s = c.poolState(chain, ref)
    const q = m.swapSatsForTokens(s, 1_000_000n, 0n)
    const pool = chain.get(ref.pool).script as Extract<Output['script'], { kind: 'pool' }>
    const forged = (out: bigint, fee: bigint): Output[] => [
      { sats: q.next.sats, script: { ...pool, state: q.next } },
      { sats: 1n, script: { kind: 'vault', poolId: ref.poolId }, bsv21: { id: TOKEN, amt: q.next.tokens } },
      { sats: 1n, script: { kind: 'p2pkh', owner: 'alice' }, bsv21: { id: TOKEN, amt: out } },
      { sats: fee, script: { kind: 'p2pkh', owner: PROTO } },
    ]
    expect(() => c.swapSatsForTokens(chain, ref, 'alice', 1_000_000n, 0n, { outputs: forged(q.out, q.protocolFee - 1n) })).toThrow(/output 3/)
    expect(() => c.swapSatsForTokens(chain, ref, 'alice', 1_000_000n, 0n, { outputs: forged(q.out + 1n, q.protocolFee) })).toThrow(TxRejected)
  })

  it('vault cannot be spent without its pool', () => {
    const { chain, ref } = setup()
    expect(() =>
      chain.submit({
        inputs: [ref.vault],
        outputs: [{ sats: 1n, script: { kind: 'p2pkh', owner: 'thief' }, bsv21: { id: TOKEN, amt: 1n } }],
        signers: ['thief'],
      }),
    ).toThrow(/vault/)
  })

  it('a pool spend that drops or mislabels the token output is rejected by the indexer rules', () => {
    const chain = new MockChain()
    const t = chain.mint([{ sats: 2n, script: { kind: 'p2pkh', owner: 'x' }, bsv21: { id: TOKEN, amt: 5n } }])
    expect(() =>
      chain.submit({ inputs: [{ txid: t, vout: 0 }], outputs: [{ sats: 2n, script: { kind: 'p2pkh', owner: 'y' }, bsv21: { id: TOKEN, amt: 5n } }], signers: ['x'] }),
    ).toThrow(/1 sat/)
  })
})

describe('liquidity', () => {
  it('add then remove returns at most what went in (rounding favours the pool)', () => {
    const { chain, ref } = setup()
    const s0 = c.poolState(chain, ref)
    const add = c.addLiquidity(chain, ref, 'bob', 1_000_000n, 20_000_000n, 0n)
    expect(add.tokensIn).toBe(10_000_000n)
    expect(c.balance(chain, 'bob', LP)).toBe(add.lpOut)
    const v1 = m.shareValueScaled(c.poolState(chain, ref))
    expect(v1).toBeGreaterThanOrEqual(m.shareValueScaled(s0))
    const rem = c.removeLiquidity(chain, ref, 'bob', add.lpOut, 0n, 0n)
    expect(rem.satsOut).toBeLessThanOrEqual(1_000_000n)
    expect(rem.tokensOut).toBeLessThanOrEqual(add.tokensIn)
    expect(1_000_000n - rem.satsOut).toBeLessThan(2n)
    expect(c.balance(chain, 'bob', LP)).toBe(0n)
    expect(m.shareValueScaled(c.poolState(chain, ref))).toBeGreaterThanOrEqual(v1)
  })

  it('LPs earn the LP fee', () => {
    const { chain, ref } = setup()
    const v0 = m.shareValueScaled(c.poolState(chain, ref))
    c.swapSatsForTokens(chain, ref, 'alice', 5_000_000n, 0n)
    c.swapTokensForSats(chain, ref, 'alice', c.balance(chain, 'alice', TOKEN), 0n)
    expect(m.shareValueScaled(c.poolState(chain, ref))).toBeGreaterThan(v0)
  })

  it('add/remove slippage guards revert', () => {
    const { chain, ref } = setup()
    expect(() => c.addLiquidity(chain, ref, 'bob', 1_000_000n, 9_999_999n, 0n)).toThrow(/slippage/)
    const add = c.addLiquidity(chain, ref, 'bob', 1_000_000n, 10_000_000n, 0n)
    expect(() => c.removeLiquidity(chain, ref, 'bob', add.lpOut, 1_000_001n, 0n)).toThrow(/slippage/)
  })

  it('locked minimum liquidity can never be withdrawn', () => {
    const s = m.initPool(1_000_000n, 1_000_000n, 25n, 5n).next
    expect(() => m.removeLiquidity(s, s.lpSupply, 0n, 0n)).toThrow(/locked/)
    expect(m.removeLiquidity(s, s.lpSupply - m.MIN_LIQUIDITY, 0n, 0n).satsOut).toBe(999_000n)
  })
})

describe('invariant and rounding (fuzz)', () => {
  it('k never decreases and share value never falls over 2,000 random ops', () => {
    let seed = 42n
    const rnd = (n: bigint) => {
      seed = (seed * 6364136223846793005n + 1442695040888963407n) % 2n ** 64n
      return (seed >> 11n) % n
    }
    let s = m.initPool(50_000_000n, 21_000_000n, 25n, 5n).next
    let lpHeld = s.lpSupply - m.MIN_LIQUIDITY
    for (let i = 0; i < 2_000; i++) {
      const prevK = k(s)
      const prev = s
      const op = rnd(4n)
      try {
        if (op === 0n) s = m.swapSatsForTokens(s, 1n + rnd(s.sats / 5n), 0n).next
        else if (op === 1n) s = m.swapTokensForSats(s, 1n + rnd(s.tokens / 5n), 0n).next
        else if (op === 2n) {
          const r = m.addLiquidity(s, 1n + rnd(s.sats / 3n), 2n ** 80n, 0n)
          s = r.next
          lpHeld += r.lpOut
        } else if (lpHeld > 0n) {
          const lp = 1n + rnd(lpHeld)
          s = m.removeLiquidity(s, lp, 0n, 0n).next
          lpHeld -= lp
        }
      } catch (e) {
        expect(e).toBeInstanceOf(m.AmmError) // dust-sized ops may legitimately revert
        continue
      }
      if (op < 2n) expect(k(s)).toBeGreaterThanOrEqual(prevK)
      // Per-share value never falls: k/L^2 non-decreasing, compared exactly by cross-multiplying.
      expect(k(s) * prev.lpSupply ** 2n).toBeGreaterThanOrEqual(k(prev) * s.lpSupply ** 2n)
      expect(s.sats > 0n && s.tokens > 0n).toBe(true)
    }
  })

  it('tiny trades round to zero and revert instead of leaking value', () => {
    const s = m.initPool(100_000_000n, 1_000n, 25n, 5n).next
    expect(() => m.swapSatsForTokens(s, 2n, 0n)).toThrow(/zero output/)
    expect(m.protocolFee(1n, 5n)).toBe(1n)
  })

  it('isqrt is exact floor', () => {
    for (const n of [0n, 1n, 2n, 3n, 4n, 99n, 100n, 101n, 2n ** 64n, 2n ** 64n - 1n]) {
      const r = m.isqrt(n)
      expect(r * r <= n && (r + 1n) * (r + 1n) > n).toBe(true)
    }
  })
})
