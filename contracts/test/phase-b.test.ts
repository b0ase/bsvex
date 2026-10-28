import { describe, expect, it } from 'vitest'
import * as m from '../src/math.js'
import { MockChain, TxRejected, type Output } from '../src/mockchain.js'
import * as c from '../src/client.js'
import { runBatch, type Intent } from '../src/batcher.js'

const TOKEN = 'aaaa_0'
const LP = 'bbbb_0'
const PROTO = 'protocol-fee-address'

function setup(indexer: 'reject' | 'burn' = 'reject') {
  const chain = new MockChain({ indexer })
  const ref = c.createPool(chain, { tokenId: TOKEN, lpTokenId: LP, protocolAddr: PROTO, sats: 100_000_000n, tokens: 1_000_000_000n, lpFeeBps: 25n, protocolFeeBps: 5n, lpOwner: 'seeder' })
  chain.mint([
    { sats: 10_000_000n, script: { kind: 'p2pkh', owner: 'alice' } },
    { sats: 10_000_000n, script: { kind: 'p2pkh', owner: 'bob' } },
    { sats: 1n, script: { kind: 'p2pkh', owner: 'bob' }, bsv21: { id: TOKEN, amt: 50_000_000n } },
  ])
  return { chain, ref }
}

const poolScript = (chain: MockChain, ref: c.PoolRef) => chain.get(ref.pool).script as Extract<Output['script'], { kind: 'pool' }>

describe('§9.1 token-inscription mismatch', () => {
  it('a token input of the wrong id is rejected by the contract even under mainnet burn semantics', () => {
    // Model the phase-A contract (no input proof) by handing the pool a token
    // input of the wrong id. With burn semantics the tx is mined.
    const { chain, ref } = setup('burn')
    chain.mint([{ sats: 1n, script: { kind: 'p2pkh', owner: 'mallory' }, bsv21: { id: 'junk_0', amt: 10_000_000n } }])
    const s = c.poolState(chain, ref)
    const r = m.swapTokensForSats(s, 10_000_000n, 0n)
    const junk = c.tokenUtxos(chain, 'mallory', 'junk_0')
    const tx = {
      inputs: [ref.pool, ref.vault, ...junk],
      outputs: [
        { sats: r.next.sats, script: { ...poolScript(chain, ref), state: r.next } },
        { sats: 1n, script: { kind: 'vault' as const, poolId: ref.poolId }, bsv21: { id: TOKEN, amt: r.next.tokens } },
        { sats: r.out, script: { kind: 'p2pkh' as const, owner: 'mallory' } },
        { sats: r.protocolFee, script: { kind: 'p2pkh' as const, owner: PROTO } },
      ],
      signers: ['mallory'],
      call: { method: 'swapTokensForSats' as const, tokensIn: 10_000_000n, minOut: 0n, trader: 'mallory' },
    }
    // The phase-B contract rejects it: the inscriptions it can read don't carry the token.
    expect(() => chain.submit(tx)).toThrow(/token inputs carry 0/)
  })

  it('the contract rejects a trader who inscribes fewer tokens than claimed', () => {
    const { chain, ref } = setup()
    chain.mint([{ sats: 1n, script: { kind: 'p2pkh', owner: 'mallory' }, bsv21: { id: TOKEN, amt: 10n } }])
    expect(() => c.swapTokensForSats(chain, ref, 'mallory', 10_000_000n, 0n)).toThrow(/insufficient tokens/)
    // Bypass the client and lie directly.
    const s = c.poolState(chain, ref)
    const r = m.swapTokensForSats(s, 10_000_000n, 0n)
    expect(() =>
      chain.submit({
        inputs: [ref.pool, ref.vault, ...c.tokenUtxos(chain, 'mallory', TOKEN)],
        outputs: [
          { sats: r.next.sats, script: { ...poolScript(chain, ref), state: r.next } },
          { sats: 1n, script: { kind: 'vault', poolId: ref.poolId }, bsv21: { id: TOKEN, amt: r.next.tokens } },
          { sats: r.out, script: { kind: 'p2pkh', owner: 'mallory' } },
          { sats: r.protocolFee, script: { kind: 'p2pkh', owner: PROTO } },
        ],
        signers: ['mallory'],
        call: { method: 'swapTokensForSats', tokensIn: 10_000_000n, minOut: 0n, trader: 'mallory' },
      }),
    ).toThrow(/token inputs carry 10, need/)
  })

  it('RESIDUAL: a well-formed but indexer-invalid input passes the contract and burns the vault', () => {
    const { chain, ref } = setup('burn')
    // An inscription that claims tokens but was never validly funded.
    chain.mint([{ sats: 1n, script: { kind: 'p2pkh', owner: 'mallory' }, bsv21: { id: TOKEN, amt: 10_000_000n }, bsv21Invalid: true }])
    // Honest clients refuse to build it.
    expect(() => c.swapTokensForSats(chain, ref, 'mallory', 10_000_000n, 0n)).toThrow(/not valid per the indexer/)
    // A hostile client can still build it, and the contract cannot tell.
    const satsBefore = c.balance(chain, 'mallory')
    c.swapTokensForSats(chain, ref, 'mallory', 10_000_000n, 0n, { skipIndexerCheck: true })
    expect(c.balance(chain, 'mallory')).toBeGreaterThan(satsBefore) // sats drained
    expect(c.poolHealth(chain, ref)).toEqual({ ok: false, reason: 'token vault burned by the indexer' })
    // Anyone who buys from the burned pool would get invalid tokens: the front end must halt it.
    c.swapSatsForTokens(chain, ref, 'alice', 1_000_000n, 0n)
    const aliceTok = c.tokenUtxos(chain, 'alice', TOKEN).map((op) => chain.get(op))
    expect(aliceTok.every((o) => o.bsv21Invalid)).toBe(true)
  })
})

describe('§8 contention', () => {
  it('a tx built on a stale pool tip is rejected; the loser re-quotes and succeeds', () => {
    const { chain, ref } = setup()
    const stale = { ...ref }
    c.swapSatsForTokens(chain, ref, 'alice', 1_000_000n, 0n)
    const bobBefore = c.balance(chain, 'bob')
    expect(() => c.swapSatsForTokens(chain, stale, 'bob', 1_000_000n, 0n)).toThrow(/missing or spent input/)
    expect(c.balance(chain, 'bob')).toBe(bobBefore) // nothing moved
    const q = m.swapSatsForTokens(c.poolState(chain, ref), 1_000_000n, 0n)
    c.swapSatsForTokens(chain, ref, 'bob', 1_000_000n, q.out)
    expect(c.balance(chain, 'bob', TOKEN)).toBe(50_000_000n + q.out)
  })

  it('the batcher chains intents in arrival order; slippage and expired intents move nothing', () => {
    const { chain, ref } = setup()
    const q0 = m.swapSatsForTokens(c.poolState(chain, ref), 1_000_000n, 0n)
    const intents: Intent[] = [
      { id: 'a1', kind: 'buy', trader: 'alice', satsIn: 1_000_000n, minOut: q0.out, deadline: 100 },
      // Quoted against the same tip as a1, so after a1 fills it misses min-out.
      { id: 'b1', kind: 'buy', trader: 'bob', satsIn: 1_000_000n, minOut: q0.out, deadline: 100 },
      { id: 'b2', kind: 'sell', trader: 'bob', tokensIn: 5_000_000n, minOut: 0n, deadline: 100 },
      { id: 'a2', kind: 'buy', trader: 'alice', satsIn: 1_000_000n, minOut: 0n, deadline: 5 },
    ]
    const bobSats = c.balance(chain, 'bob')
    const res = runBatch(chain, ref, intents, 10)
    expect(res.map((r) => r.status)).toEqual(['filled', 'rejected', 'filled', 'expired'])
    expect(res[1].reason).toMatch(/slippage/)
    expect(c.balance(chain, 'alice', TOKEN)).toBe(q0.out)
    expect(c.balance(chain, 'bob')).toBeGreaterThan(bobSats) // only the sell moved bob's sats
    expect(c.poolHealth(chain, ref)).toEqual({ ok: true })
  })
})
