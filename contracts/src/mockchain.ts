/**
 * A small in-memory UTXO chain for testing the AMM design end to end.
 *
 * It models three rule sets, each applied independently, the way they are
 * on mainnet:
 *   1. Bitcoin: inputs must exist and be unspent, sats in >= sats out.
 *   2. Locking scripts: each spent output's contract must accept the tx.
 *      The pool contract is modelled by `validatePoolSpend`, which rebuilds
 *      the outputs it expects and requires an exact match. That is what the
 *      sCrypt contract does with `this.ctx.hashOutputs`.
 *   3. The BSV-21 indexer (GorillaPool / 1sat-stack): token outputs must be
 *      1 sat, and per token id, tokens out must not exceed tokens in. A tx
 *      that breaks rule 3 is still mined, but its tokens burn. The mock
 *      rejects it instead so tests catch it.
 *
 * Nothing here signs or broadcasts. It is a simulator, not a wallet.
 */
import * as m from './math.js'
import type { PoolState } from './math.js'

export type Script =
  | { kind: 'p2pkh'; owner: string }
  /** AMM state output. Holds the BSV reserve as its satoshis. */
  | { kind: 'pool'; poolId: string; tokenId: string; lpTokenId: string; protocolAddr: string; state: PoolState }
  /** Token reserve. 1 sat + BSV-21 transfer inscription. Spendable only as the
   *  sibling of the pool output created in the same tx (sibling-txid lock). */
  | { kind: 'vault'; poolId: string }
  /** Unissued LP shares. Spendable only alongside the pool input (the real
   *  contract proves this by verifying the pool's parent tx). */
  | { kind: 'lpvault'; poolId: string }

export interface Bsv21 {
  id: string
  amt: bigint
}

export interface Output {
  sats: bigint
  script: Script
  bsv21?: Bsv21
}

export interface Outpoint {
  txid: string
  vout: number
}

export interface Tx {
  inputs: Outpoint[]
  outputs: Output[]
  /** Keys that signed (stands in for P2PKH signatures). */
  signers: string[]
  /** Which pool method the pool input is called with, and its arguments. */
  call?: PoolCall
}

export type PoolCall =
  | { method: 'swapSatsForTokens'; satsIn: bigint; minOut: bigint; trader: string }
  | { method: 'swapTokensForSats'; tokensIn: bigint; minOut: bigint; trader: string }
  | { method: 'addLiquidity'; satsIn: bigint; maxTokensIn: bigint; minLpOut: bigint; trader: string }
  | { method: 'removeLiquidity'; lpIn: bigint; minSatsOut: bigint; minTokensOut: bigint; trader: string }

export class TxRejected extends Error {}

const key = (o: Outpoint) => `${o.txid}:${o.vout}`

export class MockChain {
  utxos = new Map<string, Output>()
  private n = 0

  /** Create outputs from nothing (a faucet / genesis), for test setup only. */
  mint(outputs: Output[]): string {
    const txid = this.nextTxid()
    outputs.forEach((o, i) => this.utxos.set(key({ txid, vout: i }), o))
    return txid
  }

  get(op: Outpoint): Output {
    const o = this.utxos.get(key(op))
    if (!o) throw new TxRejected(`missing or spent input ${key(op)}`)
    return o
  }

  /** Validate a tx against all three rule sets, then apply it. Returns txid. */
  submit(tx: Tx): string {
    const ins = tx.inputs.map((i) => this.get(i))
    if (new Set(tx.inputs.map(key)).size !== tx.inputs.length) throw new TxRejected('duplicate input')

    // 1. Bitcoin value rule.
    const satsIn = ins.reduce((a, o) => a + o.sats, 0n)
    const satsOut = tx.outputs.reduce((a, o) => a + o.sats, 0n)
    if (satsOut > satsIn) throw new TxRejected('sats out exceed sats in')

    // 2. Locking scripts.
    ins.forEach((o, idx) => this.checkScript(o, idx, tx, ins))

    // 3. BSV-21 indexer rules.
    checkBsv21(ins, tx.outputs)

    tx.inputs.forEach((i) => this.utxos.delete(key(i)))
    const txid = this.nextTxid()
    tx.outputs.forEach((o, i) => this.utxos.set(key({ txid, vout: i }), o))
    return txid
  }

  private checkScript(o: Output, idx: number, tx: Tx, ins: Output[]) {
    const s = o.script
    switch (s.kind) {
      case 'p2pkh':
        if (!tx.signers.includes(s.owner)) throw new TxRejected(`missing signature for ${s.owner}`)
        return
      case 'pool':
        if (idx !== 0) throw new TxRejected('pool must be input 0')
        validatePoolSpend(o, tx, ins)
        return
      case 'vault': {
        const p = ins[0]?.script
        if (idx !== 1) throw new TxRejected('vault must be input 1')
        if (p?.kind !== 'pool' || p.poolId !== s.poolId) throw new TxRejected('vault: input 0 is not its pool')
        if (tx.inputs[0].txid !== tx.inputs[1].txid || tx.inputs[0].vout !== 0 || tx.inputs[1].vout !== 1)
          throw new TxRejected('vault: not the sibling of this pool output')
        return
      }
      case 'lpvault': {
        const p = ins[0]?.script
        if (idx !== 2) throw new TxRejected('lpvault must be input 2')
        if (p?.kind !== 'pool' || p.poolId !== s.poolId) throw new TxRejected('lpvault: input 0 is not its pool')
        return
      }
    }
  }

  private nextTxid() {
    return `tx${(++this.n).toString().padStart(6, '0')}`
  }
}

export function checkBsv21(ins: Output[], outs: Output[]) {
  const bal = new Map<string, bigint>()
  for (const o of ins) if (o.bsv21) bal.set(o.bsv21.id, (bal.get(o.bsv21.id) ?? 0n) + o.bsv21.amt)
  for (const o of outs) {
    if (!o.bsv21) continue
    if (o.sats !== 1n) throw new TxRejected('bsv21: token output must be exactly 1 sat')
    if (o.bsv21.amt <= 0n) throw new TxRejected('bsv21: amount must be positive')
    const left = (bal.get(o.bsv21.id) ?? 0n) - o.bsv21.amt
    if (left < 0n) throw new TxRejected(`bsv21: outputs exceed inputs for ${o.bsv21.id}`)
    bal.set(o.bsv21.id, left)
  }
}

function sameOutput(a: Output | undefined, b: Output): boolean {
  return a !== undefined && stringify(a) === stringify(b)
}
const stringify = (x: unknown) => JSON.stringify(x, (_k, v) => (typeof v === 'bigint' ? v.toString() : v))

/**
 * The pool contract. Given the method and its arguments, the contract
 * computes the exact outputs the tx must start with and compares them
 * (on chain: hash them and compare to hashOutputs; any outputs after these
 * are the caller's change and are free-form).
 */
export function validatePoolSpend(poolOut: Output, tx: Tx, ins: Output[]) {
  const p = poolOut.script
  if (p.kind !== 'pool') throw new TxRejected('not a pool')
  const call = tx.call
  if (!call) throw new TxRejected('pool: no method called')
  const vaultIn = ins[1]
  if (vaultIn?.script.kind !== 'vault' || vaultIn.bsv21?.id !== p.tokenId) throw new TxRejected('pool: input 1 is not my vault')
  if (vaultIn.bsv21.amt !== p.state.tokens) throw new TxRejected('pool: vault amount != state.tokens')
  if (poolOut.sats !== p.state.sats) throw new TxRejected('pool: sats != state.sats')

  const s = p.state
  const pool = (next: PoolState): Output => ({ sats: next.sats, script: { ...p, state: next } })
  const vault = (amt: bigint): Output => ({ sats: 1n, script: { kind: 'vault', poolId: p.poolId }, bsv21: { id: p.tokenId, amt } })
  const lpvault = (amt: bigint): Output => ({ sats: 1n, script: { kind: 'lpvault', poolId: p.poolId }, bsv21: { id: p.lpTokenId, amt } })
  const pay = (to: string, sats: bigint): Output => ({ sats, script: { kind: 'p2pkh', owner: to } })
  const tok = (to: string, id: string, amt: bigint): Output => ({ sats: 1n, script: { kind: 'p2pkh', owner: to }, bsv21: { id, amt } })

  let expected: Output[]
  try {
    switch (call.method) {
      case 'swapSatsForTokens': {
        const r = m.swapSatsForTokens(s, call.satsIn, call.minOut)
        expected = [pool(r.next), vault(r.next.tokens), tok(call.trader, p.tokenId, r.out), pay(p.protocolAddr, r.protocolFee)]
        break
      }
      case 'swapTokensForSats': {
        const r = m.swapTokensForSats(s, call.tokensIn, call.minOut)
        expected = [pool(r.next), vault(r.next.tokens), pay(call.trader, r.out), pay(p.protocolAddr, r.protocolFee)]
        break
      }
      case 'addLiquidity': {
        const lpIn = ins[2]
        if (lpIn?.script.kind !== 'lpvault' || lpIn.bsv21?.id !== p.lpTokenId) throw new TxRejected('pool: input 2 is not my lpvault')
        const r = m.addLiquidity(s, call.satsIn, call.maxTokensIn, call.minLpOut)
        expected = [pool(r.next), vault(r.next.tokens), lpvault(lpIn.bsv21.amt - r.lpOut), tok(call.trader, p.lpTokenId, r.lpOut)]
        break
      }
      case 'removeLiquidity': {
        const lpIn = ins[2]
        if (lpIn?.script.kind !== 'lpvault' || lpIn.bsv21?.id !== p.lpTokenId) throw new TxRejected('pool: input 2 is not my lpvault')
        const r = m.removeLiquidity(s, call.lpIn, call.minSatsOut, call.minTokensOut)
        expected = [
          pool(r.next),
          vault(r.next.tokens),
          lpvault(lpIn.bsv21.amt + call.lpIn),
          pay(call.trader, r.satsOut),
          tok(call.trader, p.tokenId, r.tokensOut),
        ]
        break
      }
    }
  } catch (e) {
    if (e instanceof m.AmmError) throw new TxRejected(`pool: ${e.message}`)
    throw e
  }
  expected.forEach((o, i) => {
    if (!sameOutput(tx.outputs[i], o)) throw new TxRejected(`pool: output ${i} does not match contract`)
  })
}
