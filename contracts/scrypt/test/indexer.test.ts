import { expect } from 'chai'
import { bsv, toByteString } from 'scrypt-ts'
import { codeHash, LocalReader, PoolIndexer, readTransfer } from '../src/indexer/poolIndexer'
import { fundingTx, genesis, LP_MAX, newPool, p2pkh, PROTOCOL_PKH, randomTrader, spend, Tip, TOKEN_ID, transferScript } from './harness'

const BPS = 10000n
const amountOut = (i: bigint, rIn: bigint, rOut: bigint, f = 25n) => (i * (BPS - f) * rOut) / (rIn * BPS + i * (BPS - f))

function swap(tip: Tip, satsIn: bigint) {
    const t = randomTrader()
    const fee = (satsIn * tip.pool.protocolFeeBps + BPS - 1n) / BPS
    const out = amountOut(satsIn - fee, tip.pool.sats, tip.pool.tokens)
    const funding = fundingTx([{ script: p2pkh(t.pkh), sats: satsIn + 10_000n }], 0x30)
    const b = spend(tip, [{ tx: funding, vout: 0 }],
        [{ script: transferScript(TOKEN_ID, out, p2pkh(t.pkh)), sats: 1n }, { script: p2pkh(PROTOCOL_PKH), sats: fee }],
        [{ script: p2pkh(t.pkh), sats: 5_000n }],
        (n) => { n.sats += satsIn - fee; n.tokens -= out },
        (self, change) => self.trade(0n, satsIn, out, 0n, t.pkh, toByteString(''), 0n, change))
    if (!b.ok) throw new Error(JSON.stringify(b.results))
    return { tx: b.tx, pool: b.next }
}

describe('read-only pool indexer (local txs only)', function () {
    this.timeout(120_000)
    const pool = newPool({ protocolFeeBps: 5n, sats: 10_000_000n, tokens: 1_000_000n, lpSupply: 3_162_277n, lpUnissued: LP_MAX - 3_162_277n })
    const g: Tip = { tx: genesis(pool), pool }

    it('follows genesis -> swap -> swap and checks state against vaults', async () => {
        const r = new LocalReader()
        r.add(g.tx)
        const s1 = swap(g, 500_000n); r.add(s1.tx)
        const s2 = swap(s1, 250_000n); r.add(s2.tx)
        const idx = new PoolIndexer(r, codeHash(pool), r)
        const snaps = await idx.follow(g.tx.id)
        expect(snaps.map((s) => s.txid)).to.deep.eq([g.tx.id, s1.tx.id, s2.tx.id])
        expect(snaps.every((s) => s.problems.length === 0), JSON.stringify(snaps.map((s) => s.problems))).to.eq(true)
        expect(snaps[2].sats).to.eq(s2.pool.sats)
        expect(snaps[2].tokens).to.eq(s2.pool.tokens)
    })

    it('flags a burned vault (indexer says invalid) so front ends halt the pool', async () => {
        const r = new LocalReader()
        r.add(g.tx)
        const s1 = swap(g, 500_000n); r.add(s1.tx)
        r.invalid.add(`${s1.tx.id}_1`)
        const snaps = await new PoolIndexer(r, codeHash(pool), r).follow(g.tx.id)
        expect(snaps[1].problems).to.include('vault burned by BSV-21 indexer: halt pool')
    })

    it('flags a pool whose code hash differs from the pinned one', async () => {
        const r = new LocalReader()
        r.add(g.tx)
        const snaps = await new PoolIndexer(r, '00'.repeat(32)).follow(g.tx.id)
        expect(snaps[0].problems).to.include('code hash differs from the pinned pool')
    })

    it('refuses an output 0 that is not this release\'s AmmPool', () => {
        const fake = fundingTx([{ script: p2pkh(PROTOCOL_PKH), sats: 10_000_000n }], 0x60)
        expect(() => new PoolIndexer(new LocalReader(), null).decode(fake.toString())).to.throw(/not an AmmPool/)
    })

    it('readTransfer parses vault inscriptions', () => {
        const tx = new bsv.Transaction(g.tx.toString())
        expect(readTransfer(tx.outputs[1].script.toHex())).to.deep.eq({ id: Buffer.from(TOKEN_ID, 'hex').toString(), amt: 1_000_000n })
        expect(readTransfer(p2pkh(PROTOCOL_PKH))).to.eq(null)
        void toByteString
    })
})
