/**
 * Transaction builders for the mock chain. A real front end does the same
 * thing with a BRC-100 wallet: it reads the pool UTXOs from the indexer,
 * computes the outputs with math.ts, and asks the wallet (createAction) to
 * fund and sign the trader's inputs. See docs/amm-design.md §7.
 */
import * as m from './math.js'
import { MockChain, type Outpoint, type Output, type Tx } from './mockchain.js'

/** Max LP-share supply, deployed in full into the LP vault at pool genesis. */
export const LP_MAX = 2n ** 63n - 1n

export interface PoolRef {
  poolId: string
  tokenId: string
  lpTokenId: string
  protocolAddr: string
  pool: Outpoint
  vault: Outpoint
  lpvault: Outpoint
}

/** Genesis: deploy the pool with the first deposit (e.g. a graduated bonding curve). */
export function createPool(
  chain: MockChain,
  a: { tokenId: string; lpTokenId: string; protocolAddr: string; sats: bigint; tokens: bigint; lpFeeBps: bigint; protocolFeeBps: bigint; lpOwner: string },
): PoolRef {
  const r = m.initPool(a.sats, a.tokens, a.lpFeeBps, a.protocolFeeBps)
  const poolId = `pool:${a.tokenId}`
  const issued = r.lpOut
  const txid = chain.mint([
    { sats: r.next.sats, script: { kind: 'pool', poolId, tokenId: a.tokenId, lpTokenId: a.lpTokenId, protocolAddr: a.protocolAddr, state: r.next } },
    { sats: 1n, script: { kind: 'vault', poolId }, bsv21: { id: a.tokenId, amt: r.next.tokens } },
    { sats: 1n, script: { kind: 'lpvault', poolId }, bsv21: { id: a.lpTokenId, amt: LP_MAX - issued } },
    { sats: 1n, script: { kind: 'p2pkh', owner: a.lpOwner }, bsv21: { id: a.lpTokenId, amt: issued } },
  ])
  return { poolId, tokenId: a.tokenId, lpTokenId: a.lpTokenId, protocolAddr: a.protocolAddr, pool: { txid, vout: 0 }, vault: { txid, vout: 1 }, lpvault: { txid, vout: 2 } }
}

export function poolState(chain: MockChain, ref: PoolRef): m.PoolState {
  const s = chain.get(ref.pool).script
  if (s.kind !== 'pool') throw new Error('not a pool')
  return s.state
}

const owned = (o: Output, owner: string) => o.script.kind === 'p2pkh' && o.script.owner === owner

/** Pick a trader's plain-sats UTXOs (wallet's job in production). */
export function satsUtxos(chain: MockChain, owner: string): Outpoint[] {
  return [...chain.utxos.entries()].filter(([, o]) => owned(o, owner) && !o.bsv21).map(([k]) => parse(k))
}
export function tokenUtxos(chain: MockChain, owner: string, id: string): Outpoint[] {
  return [...chain.utxos.entries()].filter(([, o]) => owned(o, owner) && o.bsv21?.id === id).map(([k]) => parse(k))
}
export function balance(chain: MockChain, owner: string, id?: string): bigint {
  let t = 0n
  for (const o of chain.utxos.values()) {
    if (!owned(o, owner)) continue
    if (id === undefined && !o.bsv21) t += o.sats
    if (id !== undefined && o.bsv21?.id === id) t += o.bsv21.amt
  }
  return t
}
function parse(k: string): Outpoint {
  const [txid, vout] = k.split(':')
  return { txid, vout: Number(vout) }
}

function sum(chain: MockChain, ops: Outpoint[], f: (o: Output) => bigint) {
  return ops.reduce((a, op) => a + f(chain.get(op)), 0n)
}

/** Apply a tx and move the PoolRef to the new pool outputs. */
function apply(chain: MockChain, ref: PoolRef, tx: Tx, touchesLp: boolean): string {
  const txid = chain.submit(tx)
  ref.pool = { txid, vout: 0 }
  ref.vault = { txid, vout: 1 }
  if (touchesLp) ref.lpvault = { txid, vout: 2 }
  return txid
}

export function swapSatsForTokens(chain: MockChain, ref: PoolRef, trader: string, satsIn: bigint, minOut: bigint, opts: { outputs?: Output[] } = {}) {
  const s = poolState(chain, ref)
  const funding = satsUtxos(chain, trader)
  const have = sum(chain, funding, (o) => o.sats)
  // Outputs are computed off chain; the contract re-checks them. If the quote
  // fails (slippage), we still submit so the contract is what rejects it.
  let outputs = opts.outputs
  if (!outputs) {
    const r = m.swapSatsForTokens(s, satsIn, minOut)
    outputs = [
      { sats: r.next.sats, script: { ...(chain.get(ref.pool).script as Extract<Output['script'], { kind: 'pool' }>), state: r.next } },
      { sats: 1n, script: { kind: 'vault', poolId: ref.poolId }, bsv21: { id: ref.tokenId, amt: r.next.tokens } },
      { sats: 1n, script: { kind: 'p2pkh', owner: trader }, bsv21: { id: ref.tokenId, amt: r.out } },
      { sats: r.protocolFee, script: { kind: 'p2pkh', owner: ref.protocolAddr } },
    ]
  }
  const change = have - satsIn - 1n /* token output dust */
  if (change < 0n) throw new Error('insufficient funds')
  if (change > 0n) outputs = [...outputs, { sats: change, script: { kind: 'p2pkh', owner: trader } }]
  return apply(chain, ref, { inputs: [ref.pool, ref.vault, ...funding], outputs, signers: [trader], call: { method: 'swapSatsForTokens', satsIn, minOut, trader } }, false)
}

export function swapTokensForSats(chain: MockChain, ref: PoolRef, trader: string, tokensIn: bigint, minOut: bigint) {
  const s = poolState(chain, ref)
  const toks = tokenUtxos(chain, trader, ref.tokenId)
  const have = sum(chain, toks, (o) => o.bsv21!.amt)
  if (have < tokensIn) throw new Error('insufficient tokens')
  const r = (() => {
    try {
      return m.swapTokensForSats(s, tokensIn, minOut)
    } catch {
      // Let the contract reject it: claim the caller's minimum.
      return { next: { ...s, tokens: s.tokens + tokensIn, sats: s.sats - minOut }, out: minOut, protocolFee: 1n }
    }
  })()
  const outputs: Output[] = [
    { sats: r.next.sats, script: { ...(chain.get(ref.pool).script as Extract<Output['script'], { kind: 'pool' }>), state: r.next } },
    { sats: 1n, script: { kind: 'vault', poolId: ref.poolId }, bsv21: { id: ref.tokenId, amt: r.next.tokens } },
    { sats: r.out, script: { kind: 'p2pkh', owner: trader } },
    { sats: r.protocolFee, script: { kind: 'p2pkh', owner: ref.protocolAddr } },
  ]
  if (have > tokensIn) outputs.push({ sats: 1n, script: { kind: 'p2pkh', owner: trader }, bsv21: { id: ref.tokenId, amt: have - tokensIn } })
  return apply(chain, ref, { inputs: [ref.pool, ref.vault, ...toks], outputs, signers: [trader], call: { method: 'swapTokensForSats', tokensIn, minOut, trader } }, false)
}

export function addLiquidity(chain: MockChain, ref: PoolRef, trader: string, satsIn: bigint, maxTokensIn: bigint, minLpOut: bigint) {
  const s = poolState(chain, ref)
  const r = m.addLiquidity(s, satsIn, maxTokensIn, minLpOut)
  const funding = satsUtxos(chain, trader)
  const toks = tokenUtxos(chain, trader, ref.tokenId)
  const haveSats = sum(chain, [...funding, ...toks], (o) => o.sats)
  const haveTok = sum(chain, toks, (o) => o.bsv21!.amt)
  const lpv = chain.get(ref.lpvault).bsv21!.amt
  const outputs: Output[] = [
    { sats: r.next.sats, script: { ...(chain.get(ref.pool).script as Extract<Output['script'], { kind: 'pool' }>), state: r.next } },
    { sats: 1n, script: { kind: 'vault', poolId: ref.poolId }, bsv21: { id: ref.tokenId, amt: r.next.tokens } },
    { sats: 1n, script: { kind: 'lpvault', poolId: ref.poolId }, bsv21: { id: ref.lpTokenId, amt: lpv - r.lpOut } },
    { sats: 1n, script: { kind: 'p2pkh', owner: trader }, bsv21: { id: ref.lpTokenId, amt: r.lpOut } },
  ]
  let dust = 2n
  if (haveTok > r.tokensIn) {
    outputs.push({ sats: 1n, script: { kind: 'p2pkh', owner: trader }, bsv21: { id: ref.tokenId, amt: haveTok - r.tokensIn } })
    dust += 1n
  }
  const change = haveSats - satsIn - dust
  if (change > 0n) outputs.push({ sats: change, script: { kind: 'p2pkh', owner: trader } })
  apply(chain, ref, { inputs: [ref.pool, ref.vault, ref.lpvault, ...funding, ...toks], outputs, signers: [trader], call: { method: 'addLiquidity', satsIn, maxTokensIn, minLpOut, trader } }, true)
  return r
}

export function removeLiquidity(chain: MockChain, ref: PoolRef, trader: string, lpIn: bigint, minSatsOut: bigint, minTokensOut: bigint) {
  const s = poolState(chain, ref)
  const r = m.removeLiquidity(s, lpIn, minSatsOut, minTokensOut)
  const lps = tokenUtxos(chain, trader, ref.lpTokenId)
  const haveLp = sum(chain, lps, (o) => o.bsv21!.amt)
  const lpv = chain.get(ref.lpvault).bsv21!.amt
  const outputs: Output[] = [
    { sats: r.next.sats, script: { ...(chain.get(ref.pool).script as Extract<Output['script'], { kind: 'pool' }>), state: r.next } },
    { sats: 1n, script: { kind: 'vault', poolId: ref.poolId }, bsv21: { id: ref.tokenId, amt: r.next.tokens } },
    { sats: 1n, script: { kind: 'lpvault', poolId: ref.poolId }, bsv21: { id: ref.lpTokenId, amt: lpv + lpIn } },
    { sats: r.satsOut, script: { kind: 'p2pkh', owner: trader } },
    { sats: 1n, script: { kind: 'p2pkh', owner: trader }, bsv21: { id: ref.tokenId, amt: r.tokensOut } },
  ]
  if (haveLp > lpIn) outputs.push({ sats: 1n, script: { kind: 'p2pkh', owner: trader }, bsv21: { id: ref.lpTokenId, amt: haveLp - lpIn } })
  // The trader's LP-token inputs carry 1 sat each; that plus a funding UTXO covers the new dust outputs.
  const funding = satsUtxos(chain, trader)
  apply(chain, ref, { inputs: [ref.pool, ref.vault, ref.lpvault, ...lps, ...funding.slice(0, 1)], outputs, signers: [trader], call: { method: 'removeLiquidity', lpIn, minSatsOut, minTokensOut, trader } }, true)
  return r
}
