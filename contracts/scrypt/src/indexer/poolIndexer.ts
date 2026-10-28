/**
 * Read-only pool indexer skeleton (Phase C).
 *
 * Follows a pool's UTXO chain from its genesis tx: output 0 of each pool tx is
 * spent by the next pool tx. For every step it decodes the pool state with the
 * compiled artifact, checks the code is the audited release (code-part hash),
 * and checks the state against the UTXO values and the two vault inscriptions.
 * Optionally asks a BSV-21 indexer whether the vault outputs are valid
 * transfers, and marks the pool unhealthy if not (design §9.1 b).
 *
 * It never signs, never broadcasts and only issues HTTP GETs. It is a
 * skeleton: no persistence, no subscription loop, no HTTP server yet.
 */
import { bsv, sha256 } from 'scrypt-ts'
import { AmmPool } from '../contracts/ammPool'

export interface ChainReader {
    /** Raw tx hex. */
    rawTx(txid: string): Promise<string>
    /** txid of the tx spending (txid, vout), or null if unspent. */
    spentBy(txid: string, vout: number): Promise<string | null>
}

export type Validity = 'valid' | 'invalid' | 'pending' | 'unknown'
export interface TokenValidityReader {
    transferValidity(txid: string, vout: number): Promise<Validity>
}

export interface PoolSnapshot {
    txid: string
    sats: bigint
    tokens: bigint
    lpSupply: bigint
    lpUnissued: bigint
    protocolFeeBps: bigint
    lpFeeBps: bigint
    maxSats: bigint
    problems: string[]
    vaultValidity?: [Validity, Validity]
}

/** Parse `{"p":"bsv-20","op":"transfer","id":..,"amt":..}` from a 1Sat output script. */
export function readTransfer(scriptHex: string): { id: string; amt: bigint } | null {
    const s = bsv.Script.fromHex(scriptHex)
    const ch = s.chunks
    for (let i = 0; i + 6 < ch.length; i++) {
        if (ch[i].opcodenum === 0 && ch[i + 1].opcodenum === 0x63 && ch[i + 2].buf?.toString() === 'ord') {
            const ctype = ch[i + 4].buf?.toString()
            const body = ch[i + 6].buf?.toString()
            if (ctype !== 'application/bsv-20' || !body) return null
            try {
                const j = JSON.parse(body)
                if (j.p !== 'bsv-20' || j.op !== 'transfer' || typeof j.id !== 'string' || !/^[1-9][0-9]*$/.test(j.amt)) return null
                return { id: j.id, amt: BigInt(j.amt) }
            } catch {
                return null
            }
        }
    }
    return null
}

/** sha256 of a pool's code part (code + immutable params), shown by front ends. */
export const codeHash = (pool: AmmPool) => sha256(pool.codePart)

export class NotAPoolError extends Error {}

export class PoolIndexer {
    constructor(
        private reader: ChainReader,
        /**
         * Optional: sha256 of one pool's code part (it embeds that pool's
         * immutable params, so it is per pool). Release-level matching is done
         * by AmmPool.fromTx against the loaded artifact.
         */
        private pinnedCodeHash: string | null,
        private validity?: TokenValidityReader
    ) {}

    decode(txHex: string): PoolSnapshot {
        const tx = new bsv.Transaction(txHex)
        let pool: AmmPool
        try {
            // Template match against the loaded release artifact: any other code throws.
            pool = AmmPool.fromTx(tx, 0)
        } catch (e) {
            throw new NotAPoolError(`${tx.id}: output 0 is not an AmmPool of the loaded release`)
        }
        const problems: string[] = []
        if (this.pinnedCodeHash && codeHash(pool) !== this.pinnedCodeHash) problems.push('code hash differs from the pinned pool')
        if (BigInt(tx.outputs[0].satoshis) !== pool.sats) problems.push('sats != output 0 value')
        const tv = tx.outputs[1] && readTransfer(tx.outputs[1].script.toHex())
        const lv = tx.outputs[2] && readTransfer(tx.outputs[2].script.toHex())
        const tokenId = Buffer.from(pool.tokenId, 'hex').toString()
        const lpTokenId = Buffer.from(pool.lpTokenId, 'hex').toString()
        if (!tv || tv.id !== tokenId || tv.amt !== pool.tokens) problems.push('token vault != state.tokens')
        if (!lv || lv.id !== lpTokenId || lv.amt !== pool.lpUnissued) problems.push('LP vault != state.lpUnissued')
        if (pool.sats > pool.maxSats) problems.push('over pool cap')
        return {
            txid: tx.id,
            sats: pool.sats,
            tokens: pool.tokens,
            lpSupply: pool.lpSupply,
            lpUnissued: pool.lpUnissued,
            protocolFeeBps: pool.protocolFeeBps,
            lpFeeBps: pool.lpFeeBps,
            maxSats: pool.maxSats,
            problems,
        }
    }

    /** Walk from genesis to the current tip. `limit` bounds the walk. */
    async follow(genesisTxid: string, limit = 10_000): Promise<PoolSnapshot[]> {
        const out: PoolSnapshot[] = []
        let txid: string | null = genesisTxid
        while (txid && out.length < limit) {
            const snap = this.decode(await this.reader.rawTx(txid))
            if (this.validity) {
                snap.vaultValidity = [await this.validity.transferValidity(txid, 1), await this.validity.transferValidity(txid, 2)]
                if (snap.vaultValidity.includes('invalid')) snap.problems.push('vault burned by BSV-21 indexer: halt pool')
            }
            out.push(snap)
            txid = await this.reader.spentBy(txid, 0)
        }
        return out
    }
}

/**
 * Read-only HTTP reader. Endpoint paths are our best reading of the public
 * docs and are NOT yet confirmed (see docs/amm-design.md §12.6). GET only.
 */
export class HttpReader implements ChainReader, TokenValidityReader {
    constructor(
        private base = {
            woc: 'https://api.whatsonchain.com/v1/bsv/main',
            ordinals: 'https://ordinals.gorillapool.io/api',
        }
    ) {}
    private async get(url: string): Promise<Response> {
        return fetch(url, { method: 'GET', headers: { accept: 'application/json' } })
    }
    async rawTx(txid: string): Promise<string> {
        const r = await this.get(`${this.base.woc}/tx/${txid}/hex`)
        if (!r.ok) throw new Error(`rawTx ${txid}: HTTP ${r.status}`)
        return (await r.text()).trim()
    }
    async spentBy(txid: string, vout: number): Promise<string | null> {
        // GorillaPool txo lookup: returns { spend: "<txid>" | "" } for an outpoint.
        const r = await this.get(`${this.base.ordinals}/txos/${txid}_${vout}`)
        if (r.status === 404) return null
        if (!r.ok) throw new Error(`spentBy ${txid}_${vout}: HTTP ${r.status}`)
        const j = (await r.json()) as { spend?: string }
        return j.spend ? j.spend : null
    }
    async transferValidity(txid: string, vout: number): Promise<Validity> {
        const r = await this.get(`${this.base.ordinals}/bsv20/outpoint/${txid}_${vout}`)
        if (r.status === 404) return 'unknown'
        if (!r.ok) return 'unknown'
        const j = (await r.json()) as { status?: number }
        // GorillaPool bsv20 status: 1 valid, 0 pending, -1 invalid (to confirm)
        return j.status === 1 ? 'valid' : j.status === -1 ? 'invalid' : j.status === 0 ? 'pending' : 'unknown'
    }
}

/** In-memory reader for tests: txs you built locally, never broadcast. */
export class LocalReader implements ChainReader, TokenValidityReader {
    private txs = new Map<string, bsv.Transaction>()
    private spends = new Map<string, string>()
    public invalid = new Set<string>()
    add(tx: bsv.Transaction) {
        this.txs.set(tx.id, tx)
        for (const i of tx.inputs) this.spends.set(`${i.prevTxId.toString('hex')}_${i.outputIndex}`, tx.id)
    }
    async rawTx(txid: string) {
        const t = this.txs.get(txid)
        if (!t) throw new Error(`unknown tx ${txid}`)
        return t.toString()
    }
    async spentBy(txid: string, vout: number) {
        return this.spends.get(`${txid}_${vout}`) ?? null
    }
    async transferValidity(txid: string, vout: number): Promise<Validity> {
        return this.invalid.has(`${txid}_${vout}`) ? 'invalid' : 'valid'
    }
}
