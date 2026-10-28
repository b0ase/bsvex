/**
 * Local-only harness: builds pool transactions with the scrypt-ts bsv library
 * and runs every contract input through the script interpreter
 * (tx.verifyScript). No provider, no network, no broadcast. Keys are random
 * throwaway test keys generated per run and never written anywhere.
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { bsv, ByteString, PubKeyHash, toByteString, Utils, hash160 } from 'scrypt-ts'
import { AmmPool } from '../src/contracts/ammPool'
import { Vault } from '../src/contracts/vault'
import { Bsv21 } from '../src/contracts/bsv21'

const ART = join(__dirname, '..', 'artifacts')
AmmPool.loadArtifact(JSON.parse(readFileSync(join(ART, 'ammPool.json'), 'utf8')))
Vault.loadArtifact(JSON.parse(readFileSync(join(ART, 'vault.json'), 'utf8')))

export const VAULT_CODE: ByteString = new Vault().lockingScript.toHex()

/** bcorp@bwalletx.com, owner decision 28 Oct (public address, not a secret). */
export const PROTOCOL_FEE_ADDRESS = '1MMxztpc9fj5o5Mtp8CFqPwXJfeycCTw3L'
export const PROTOCOL_PKH: PubKeyHash = bsv.Address.fromString(PROTOCOL_FEE_ADDRESS).hashBuffer.toString('hex') as PubKeyHash

export const fakeTxid = (seed: number) => Buffer.alloc(32, seed).toString('hex')
export const ascii = (s: string) => toByteString(s, true)
export const TOKEN_ID = ascii(`${fakeTxid(0xaa)}_0`)
export const LP_TOKEN_ID = ascii(`${fakeTxid(0xbb)}_0`)

export function randomTrader() {
    const key = bsv.PrivateKey.fromRandom(bsv.Networks.testnet)
    const pkh = hash160(key.publicKey.toHex()) as PubKeyHash
    return { key, pkh }
}

export const p2pkh = (pkh: PubKeyHash) => Utils.buildPublicKeyHashScript(pkh)
/** 1-sat BSV-21 transfer output script (inscription then lock). */
export const transferScript = (id: ByteString, amt: bigint, lock: ByteString) => Bsv21.inscription(id, amt) + lock

function outputFromHex(scriptHex: string, sats: bigint) {
    return new bsv.Transaction.Output({ script: bsv.Script.fromHex(scriptHex), satoshis: Number(sats) })
}

/** Output bytes as hashOutputs sees them. */
export function serialiseOutputs(outs: bsv.Transaction.Output[]): string {
    return outs.map((o) => o.toBufferWriter().toBuffer().toString('hex')).join('')
}

/** A standalone tx funding some outputs from a fake (never-real) input. */
export function fundingTx(outputs: { script: string; sats: bigint }[], seed = 1, nInputs = 1) {
    const tx = new bsv.Transaction()
    for (let i = 0; i < nInputs; i++) {
        tx.addInput(
            new bsv.Transaction.Input({ prevTxId: fakeTxid(seed + i), outputIndex: i, script: bsv.Script.fromHex('00'.repeat(107)) }),
            bsv.Script.fromHex('76a914' + '00'.repeat(20) + '88ac'),
            1_000_000_000
        )
    }
    for (const o of outputs) tx.addOutput(outputFromHex(o.script, o.sats))
    return tx
}

export interface PoolParams {
    protocolFeeBps: bigint
    lpFeeBps?: bigint
    maxSats?: bigint
    lockedLp?: bigint
    sats: bigint
    tokens: bigint
    lpSupply: bigint
    lpUnissued: bigint
}

export const LP_MAX = 2n ** 63n - 1n

export function newPool(p: PoolParams) {
    return new AmmPool(
        TOKEN_ID,
        LP_TOKEN_ID,
        VAULT_CODE,
        PROTOCOL_PKH,
        p.lpFeeBps ?? 25n,
        p.protocolFeeBps,
        p.maxSats ?? 100_000_000n,
        p.lockedLp ?? 1000n,
        p.sats,
        p.tokens,
        p.lpSupply,
        p.lpUnissued
    )
}

/** Genesis tx: [0] pool, [1] token vault, [2] LP vault. Local only. */
export function genesis(pool: AmmPool) {
    const tx = fundingTx([
        { script: pool.lockingScript.toHex(), sats: pool.sats },
        { script: transferScript(TOKEN_ID, pool.tokens, VAULT_CODE), sats: 1n },
        { script: transferScript(LP_TOKEN_ID, pool.lpUnissued, VAULT_CODE), sats: 1n },
    ], 0x10)
    return tx
}

/** Contract instance view of a pool tip tx. */
export interface Tip {
    tx: bsv.Transaction
    pool: AmmPool
}

export interface TraderInput {
    tx: bsv.Transaction
    vout: number
}

export interface Built {
    tx: bsv.Transaction
    next: AmmPool
    results: { index: number; success: boolean; error?: string }[]
    ok: boolean
    jsError?: string
}

/**
 * Build a pool spend: inputs [pool, tokenVault, lpVault, ...trader], outputs
 * [pool', vaults', ...payouts, ...change]. `call` receives the pool instance
 * and the serialised change, and invokes the public method. Every contract
 * input is then run through the interpreter.
 */
export function spend(
    tip: Tip,
    traderInputs: TraderInput[],
    payouts: { script: string; sats: bigint }[],
    change: { script: string; sats: bigint }[],
    mutate: (next: AmmPool) => void,
    call: (self: AmmPool, changeHex: string) => void
): Built {
    const tx = new bsv.Transaction()
    tx.addInputFromPrevTx(tip.tx, 0)
    tx.addInputFromPrevTx(tip.tx, 1)
    tx.addInputFromPrevTx(tip.tx, 2)
    for (const t of traderInputs) tx.addInputFromPrevTx(t.tx, t.vout)

    const next = tip.pool.next()
    mutate(next)
    tx.addOutput(outputFromHex(next.lockingScript.toHex(), next.sats))
    tx.addOutput(outputFromHex(transferScript(TOKEN_ID, next.tokens, VAULT_CODE), 1n))
    tx.addOutput(outputFromHex(transferScript(LP_TOKEN_ID, next.lpUnissued, VAULT_CODE), 1n))
    for (const p of payouts) tx.addOutput(outputFromHex(p.script, p.sats))
    const changeOuts = change.map((c) => outputFromHex(c.script, c.sats))
    for (const c of changeOuts) tx.addOutput(c)
    const changeHex = serialiseOutputs(changeOuts)

    // trader P2PKH inputs: 107-byte placeholder (sig+pubkey) for sizing. They
    // are standard P2PKH and are not what this harness tests.
    for (let i = 3; i < tx.inputs.length; i++) tx.inputs[i].setScript(bsv.Script.fromHex('00'.repeat(107)))

    let jsError: string | undefined
    try {
        const poolUnlock = tip.pool.getUnlockingScript((self) => {
            self.to = { tx, inputIndex: 0 }
            call(self, changeHex)
        })
        tx.inputs[0].setScript(poolUnlock)
    } catch (e) {
        jsError = (e as Error).message
    }
    for (const i of [1, 2]) {
        const v = new Vault()
        const id = i === 1 ? TOKEN_ID : LP_TOKEN_ID
        const amt = i === 1 ? tip.pool.tokens : tip.pool.lpUnissued
        v.prependNOPScript(bsv.Script.fromHex(Bsv21.inscription(id, amt)))
        try {
            tx.inputs[i].setScript(
                v.getUnlockingScript((self) => {
                    self.to = { tx, inputIndex: i }
                    self.unlock()
                })
            )
        } catch (e) {
            jsError = jsError ?? `vault ${i}: ${(e as Error).message}`
        }
    }
    const results = [0, 1, 2].map((index) => {
        if (jsError) return { index, success: false, error: jsError }
        const r = tx.verifyScript(index)
        return { index, success: r.success, error: r.error }
    })
    return { tx, next, results, ok: !jsError && results.every((r) => r.success), jsError }
}

