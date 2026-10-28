import { expect } from 'chai'
import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { bsv, toByteString, Utils } from 'scrypt-ts'
import { AmmPool } from '../src/contracts/ammPool'
import { Vault } from '../src/contracts/vault'
import { Bsv21 } from '../src/contracts/bsv21'
import {
    ascii, Built, fakeTxid, fundingTx, genesis, LP_MAX, LP_TOKEN_ID, newPool, p2pkh, PROTOCOL_PKH, randomTrader, spend, Tip,
    TOKEN_ID, transferScript, VAULT_CODE,
} from './harness'

const BPS = 10000n
const amountOut = (i: bigint, rIn: bigint, rOut: bigint, f = 25n) => (i * (BPS - f) * rOut) / (rIn * BPS + i * (BPS - f))
const pFeeOf = (x: bigint, p: bigint) => {
    const f = (x * p + BPS - 1n) / BPS
    return f < 1n ? 1n : f
}
const isqrt = (n: bigint) => {
    let x = n, y = (x + 1n) / 2n
    while (y < x) { x = y; y = (x + n / x) / 2n }
    return x
}

/** Pool seeded with 0.5 BSV and 5M tokens (third-party fee 10 bps unless set). */
function seededTip(opts: { protocolFeeBps?: bigint; maxSats?: bigint; lockedLp?: bigint; sats?: bigint; tokens?: bigint } = {}): Tip {
    const sats = opts.sats ?? 50_000_000n
    const tokens = opts.tokens ?? 5_000_000n
    const L = isqrt(sats * tokens)
    const pool = newPool({
        protocolFeeBps: opts.protocolFeeBps ?? 10n,
        maxSats: opts.maxSats,
        lockedLp: opts.lockedLp ?? 1000n,
        sats, tokens, lpSupply: L, lpUnissued: LP_MAX - L,
    })
    return { tx: genesis(pool), pool }
}

/** Phase C figures (commit 1a62095) kept for the before/after table. */
const PHASE_C = {
    poolScriptBytes: 22791,
    vaultScriptBytes: 704,
    txBytes: { swapSatsForTokens: 50581, swapTokensForSats: 51073, addLiquidity: 51194, removeLiquidity: 51229, poolGenesis: 24702 },
}

const sizes: Record<string, { bytes: number; contractInputs: number[]; outputs: number }> = {}
function record(name: string, b: Built) {
    const bytes = b.tx.toBuffer().length
    sizes[name] = {
        bytes,
        contractInputs: [0, 1, 2].map((i) => b.tx.inputs[i].script.toBuffer().length),
        outputs: b.tx.outputs.length,
    }
}

/** Trader token UTXO: parent tx whose output `vout` is a BSV-21 transfer. */
function tokenParent(id: string, amt: bigint, pkh: string, variant: 'canonical' | 'amtFirst' | 'p2pkhFirst' = 'canonical', vout = 0, nInputs = 1) {
    let script: string
    if (variant === 'canonical') script = transferScript(id, amt, p2pkh(pkh as any))
    else if (variant === 'p2pkhFirst') script = p2pkh(pkh as any) + Bsv21.inscription(id, amt)
    else {
        const json = toByteString('{"p":"bsv-20","op":"transfer","amt":"', true) + Bsv21.int2Ascii(amt) + toByteString('","id":"', true) + id + toByteString('"}', true)
        script = Bsv21.ENVELOPE_HEAD + Bsv21.pushData(json) + Bsv21.OP_ENDIF + p2pkh(pkh as any)
    }
    const outs = []
    for (let i = 0; i < vout; i++) outs.push({ script: p2pkh(pkh as any), sats: 1000n })
    outs.push({ script, sats: 1n })
    outs.push({ script: p2pkh(pkh as any), sats: 5000n })
    return fundingTx(outs, 0x40 + vout, nInputs)
}

function satsSwap(tip: Tip, satsIn: bigint, minOut?: bigint) {
    const t = randomTrader()
    const fee = pFeeOf(satsIn, tip.pool.protocolFeeBps)
    const out = amountOut(satsIn - fee, tip.pool.sats, tip.pool.tokens, tip.pool.lpFeeBps)
    const funding = fundingTx([{ script: p2pkh(t.pkh), sats: satsIn + 10_000n }], 0x30)
    const b = spend(
        tip,
        [{ tx: funding, vout: 0 }],
        [
            { script: transferScript(TOKEN_ID, out, p2pkh(t.pkh)), sats: 1n },
            { script: p2pkh(PROTOCOL_PKH), sats: fee },
        ],
        [{ script: p2pkh(t.pkh), sats: 5_000n }],
        (n) => { n.sats += satsIn - fee; n.tokens -= out },
        (self, change) => self.trade(0n, satsIn, minOut ?? out, 0n, t.pkh, toByteString(''), 0n, change)
    )
    return { b, out, fee }
}

function tokenSwap(tip: Tip, tokensIn: bigint, o: { claimAmt?: bigint; parentAmt?: bigint; variant?: any; id?: string; tamper?: boolean; nInputs?: number } = {}) {
    const t = randomTrader()
    const parent = tokenParent(o.id ?? TOKEN_ID, o.parentAmt ?? tokensIn, t.pkh, o.variant, 0, o.nInputs ?? 1)
    const gross = amountOut(tokensIn, tip.pool.tokens, tip.pool.sats, tip.pool.lpFeeBps)
    const fee = pFeeOf(gross, tip.pool.protocolFeeBps)
    const fund = fundingTx([{ script: p2pkh(t.pkh), sats: 10_000n }], 0x31)
    let parentHex = parent.toBuffer().toString('hex')
    if (o.tamper) parentHex = parentHex.replace(Bsv21.int2Ascii(tokensIn), Bsv21.int2Ascii(tokensIn * 10n))
    const b = spend(
        tip,
        [{ tx: parent, vout: 0 }, { tx: fund, vout: 0 }],
        [
            { script: p2pkh(t.pkh), sats: gross - fee },
            { script: p2pkh(PROTOCOL_PKH), sats: fee },
        ],
        [{ script: p2pkh(t.pkh), sats: 5_000n }],
        (n) => { n.sats -= gross; n.tokens += tokensIn },
        (self, change) =>
            self.trade(1n, tokensIn, gross - fee, 0n, t.pkh, parentHex, o.claimAmt ?? tokensIn, change)
    )
    return { b, gross, fee }
}

describe('BSVEX AMM (sCrypt, local interpreter only)', function () {
    this.timeout(600_000)

    it('compiles: script sizes', () => {
        const tip = seededTip()
        console.log(`      AmmPool locking script: ${tip.pool.lockingScript.toBuffer().length} bytes; Vault: ${new Vault().lockingScript.toBuffer().length} bytes`)
        expect(tip.pool.lockingScript.toBuffer().length).to.be.greaterThan(1000)
    })

    it('Bsv21.int2Ascii and inscription match the 1Sat transfer format', () => {
        expect(() => Bsv21.int2Ascii(0n)).to.throw(/amt must be > 0/)
        expect(Bsv21.int2Ascii(7n)).to.eq(toByteString('7', true))
        expect(Bsv21.int2Ascii(18446744073709551615n)).to.eq(toByteString('18446744073709551615', true))
        expect(() => Bsv21.int2Ascii(10n ** 20n)).to.throw(/amt too large/)
        expect(Bsv21.int2Ascii(1234567890123456789n)).to.eq(toByteString('1234567890123456789', true))
        const json = Buffer.from(Bsv21.transferJson(TOKEN_ID, 42n), 'hex').toString()
        expect(JSON.parse(json)).to.deep.eq({ p: 'bsv-20', op: 'transfer', id: `${fakeTxid(0xaa)}_0`, amt: '42' })
    })

    it('Bsv21.outputScript walks a real tx (incl. fd-varint unlocking scripts)', () => {
        const parent = tokenParent(TOKEN_ID, 77n, '11'.repeat(20), 'canonical', 2, 3)
        parent.inputs[1].setScript(bsv.Script.fromHex('00'.repeat(300))) // needs a 0xfd varint
        const hex = parent.toBuffer().toString('hex')
        expect(Bsv21.outputScript(hex, 2n)).to.eq(parent.outputs[2].script.toHex())
        expect(Bsv21.outputScript(hex, 0n)).to.eq(parent.outputs[0].script.toHex())
        expect(Bsv21.isTransfer(parent.outputs[2].script.toHex(), TOKEN_ID, 77n)).to.eq(true)
        expect(Bsv21.isTransfer(parent.outputs[2].script.toHex(), TOKEN_ID, 78n)).to.eq(false)
        expect(Bsv21.isTransfer(parent.outputs[2].script.toHex(), LP_TOKEN_ID, 77n)).to.eq(false)
    })

    describe('trade op 0: swapSatsForTokens', () => {
        it('accepts a correct swap; all three contract inputs verify', () => {
            const { b } = satsSwap(seededTip(), 1_000_000n)
            expect(b.results, JSON.stringify(b.results)).to.satisfy(() => b.ok)
            record('swapSatsForTokens', b)
        })
        it('interpreter (not just the JS run) rejects a tx whose outputs were changed after unlocking', () => {
            const { b } = satsSwap(seededTip(), 1_000_000n)
            expect(b.ok).to.eq(true)
            ;(b.tx.outputs[3] as unknown as { satoshis: number }).satoshis = 2 // alter an output after the pool signed off
            expect(b.tx.verifyScript(0).success).to.eq(false)
            expect(b.tx.verifyScript(1).success).to.eq(false) // vault preimage covers outputs too
        })
        it('rejects minOut above the real output (slippage)', () => {
            const tip = seededTip()
            const t = satsSwap(tip, 1_000_000n)
            const { b } = satsSwap(seededTip(), 1_000_000n, t.out + 1n)
            expect(b.ok).to.eq(false)
        })
        it('enforces the 1 BSV pool cap', () => {
            const { b } = satsSwap(seededTip({ sats: 99_900_000n }), 200_000n)
            expect(b.ok).to.eq(false)
            expect(b.jsError ?? '').to.match(/pool cap/)
            const ok = satsSwap(seededTip({ sats: 99_000_000n }), 200_000n)
            expect(ok.b.ok).to.eq(true)
        })
        it('protocol fee: 5 bps for our tokens, 10 bps for third-party', () => {
            const ours = satsSwap(seededTip({ protocolFeeBps: 5n }), 1_000_000n)
            const theirs = satsSwap(seededTip({ protocolFeeBps: 10n }), 1_000_000n)
            expect(ours.b.ok && theirs.b.ok).to.eq(true)
            expect(ours.fee).to.eq(500n)
            expect(theirs.fee).to.eq(1000n)
        })
        it('chains: a second swap spends the first swap\'s outputs', () => {
            const first = satsSwap(seededTip(), 1_000_000n)
            expect(first.b.ok).to.eq(true)
            const second = satsSwap({ tx: first.b.tx, pool: first.b.next }, 2_000_000n)
            expect(second.b.ok, JSON.stringify(second.b.results)).to.eq(true)
        })
    })

    describe('trade op 1: swapTokensForSats with the in-contract token proof', () => {
        it('accepts proven token input (canonical inscription)', () => {
            const { b } = tokenSwap(seededTip(), 10_000n)
            expect(b.ok, JSON.stringify(b.results)).to.eq(true)
            record('swapTokensForSats', b)
        })
        it('accepts the amt-first key order and P2PKH-before-envelope layout', () => {
            expect(tokenSwap(seededTip(), 10_000n, { variant: 'amtFirst' }).b.ok).to.eq(true)
            expect(tokenSwap(seededTip(), 10_000n, { variant: 'p2pkhFirst' }).b.ok).to.eq(true)
        })
        it('rejects claiming more than the input carries', () => {
            expect(tokenSwap(seededTip(), 10_000n, { parentAmt: 9_999n, claimAmt: 10_000n }).b.ok).to.eq(false)
        })
        it('rejects a parent tx carrying a different token id', () => {
            expect(tokenSwap(seededTip(), 10_000n, { id: ascii(`${fakeTxid(0xcc)}_0`) }).b.ok).to.eq(false)
        })
        it('rejects an edited parent tx (hash no longer matches the outpoint)', () => {
            expect(tokenSwap(seededTip(), 10_000n, { tamper: true }).b.ok).to.eq(false)
        })
    })

    describe('one token input per trade (owner, 28 Oct) and parent bounds', () => {
        /** Sell `tokensIn` with explicit trader inputs; input 3 is proven with (parentHex, claim). */
        function sellWith(tip: Tip, inputs: { tx: bsv.Transaction; vout: number }[], parentHex: string, claim: bigint, tokensIn: bigint) {
            const t = randomTrader()
            const gross = amountOut(tokensIn, tip.pool.tokens, tip.pool.sats, tip.pool.lpFeeBps)
            const fee = pFeeOf(gross, tip.pool.protocolFeeBps)
            return spend(
                tip,
                inputs,
                [
                    { script: p2pkh(t.pkh), sats: gross - fee },
                    { script: p2pkh(PROTOCOL_PKH), sats: fee },
                ],
                [{ script: p2pkh(t.pkh), sats: 5_000n }],
                (n) => { n.sats -= gross; n.tokens += tokensIn },
                (self, change) => self.trade(1n, tokensIn, gross - fee, 0n, t.pkh, parentHex, claim, change)
            )
        }
        const fund = () => ({ tx: fundingTx([{ script: p2pkh(randomTrader().pkh), sats: 10_000n }], 0x34), vout: 0 })

        it('the compiled ABI has one public method taking one parent tx and one amount (no arrays)', () => {
            const art = JSON.parse(readFileSync(join(__dirname, '..', 'artifacts', 'ammPool.json'), 'utf8'))
            const pub = art.abi.filter((f: { type: string }) => f.type === 'function')
            expect(pub.map((f: { name: string }) => f.name)).to.deep.eq(['trade'])
            const params = Object.fromEntries(pub[0].params.map((x: { name: string; type: string }) => [x.name, x.type]))
            expect(params.parent).to.eq('bytes')
            expect(params.parentAmt).to.eq('int')
            expect(Object.values(params).some((t) => String(t).includes('['))).to.eq(false)
        })
        it('rejects a trade split across two token inputs (only input 3 is credited)', () => {
            const t = randomTrader()
            const p1 = tokenParent(TOKEN_ID, 5_000n, t.pkh, 'canonical', 0, 1)
            const p2 = tokenParent(TOKEN_ID, 5_000n, t.pkh, 'canonical', 1, 1)
            const inputs = [{ tx: p1, vout: 0 }, { tx: p2, vout: 1 }, fund()]
            // honest claim of input 3's amount: short of 10k
            const b = sellWith(seededTip(), inputs, p1.toBuffer().toString('hex'), 5_000n, 10_000n)
            expect(b.ok).to.eq(false)
            expect(b.jsError ?? '').to.match(/token inputs short/)
            // claiming the combined amount against input 3 alone fails the proof
            const c = sellWith(seededTip(), inputs, p1.toBuffer().toString('hex'), 10_000n, 10_000n)
            expect(c.ok).to.eq(false)
            // the same 10k merged into one input first is accepted
            const merged = tokenParent(TOKEN_ID, 10_000n, t.pkh, 'canonical', 0, 2)
            expect(sellWith(seededTip(), [{ tx: merged, vout: 0 }, fund()], merged.toBuffer().toString('hex'), 10_000n, 10_000n).ok).to.eq(true)
        })
        it('rejects a token input that is not input 3', () => {
            const t = randomTrader()
            const p = tokenParent(TOKEN_ID, 10_000n, t.pkh)
            const b = sellWith(seededTip(), [fund(), { tx: p, vout: 0 }], p.toBuffer().toString('hex'), 10_000n, 10_000n)
            expect(b.ok).to.eq(false)
        })
        it('a buy payout (output 3 of a pool tx) can be sold straight back', () => {
            const buy = satsSwap(seededTip(), 1_000_000n)
            expect(buy.b.ok).to.eq(true)
            const tip2 = { tx: buy.b.tx, pool: buy.b.next }
            // a fresh trader owns the payout in this test; the lock is not what the pool checks
            const b = sellWith(tip2, [{ tx: buy.b.tx, vout: 3 }, fund()], buy.b.tx.toBuffer().toString('hex'), buy.out, buy.out)
            expect(b.ok, JSON.stringify(b.results)).to.eq(true)
        })
        it('rejects parents beyond the bounds (inputs > 5, vout > 3)', () => {
            const t = randomTrader()
            const many = tokenParent(TOKEN_ID, 10_000n, t.pkh, 'canonical', 0, 6)
            expect(sellWith(seededTip(), [{ tx: many, vout: 0 }, fund()], many.toBuffer().toString('hex'), 10_000n, 10_000n).ok).to.eq(false)
            const five = tokenParent(TOKEN_ID, 10_000n, t.pkh, 'canonical', 0, 5)
            expect(sellWith(seededTip(), [{ tx: five, vout: 0 }, fund()], five.toBuffer().toString('hex'), 10_000n, 10_000n).ok).to.eq(true)
            const v3 = tokenParent(TOKEN_ID, 10_000n, t.pkh, 'canonical', 3, 1)
            expect(sellWith(seededTip(), [{ tx: v3, vout: 3 }, fund()], v3.toBuffer().toString('hex'), 10_000n, 10_000n).ok).to.eq(true)
            const v4 = tokenParent(TOKEN_ID, 10_000n, t.pkh, 'canonical', 4, 1)
            expect(sellWith(seededTip(), [{ tx: v4, vout: 4 }, fund()], v4.toBuffer().toString('hex'), 10_000n, 10_000n).ok).to.eq(false)
        })
    })

    describe('trade op 2/3: add and remove liquidity', () => {
        function add(tip: Tip, satsIn: bigint) {
            const t = randomTrader()
            const tokensIn = (satsIn * tip.pool.tokens + tip.pool.sats - 1n) / tip.pool.sats
            const lpOut = (satsIn * tip.pool.lpSupply) / tip.pool.sats
            const parent = tokenParent(TOKEN_ID, tokensIn, t.pkh)
            const fund = fundingTx([{ script: p2pkh(t.pkh), sats: satsIn + 10_000n }], 0x32)
            const b = spend(
                tip,
                [{ tx: parent, vout: 0 }, { tx: fund, vout: 0 }],
                [{ script: transferScript(LP_TOKEN_ID, lpOut, p2pkh(t.pkh)), sats: 1n }],
                [{ script: p2pkh(t.pkh), sats: 5_000n }],
                (n) => { n.sats += satsIn; n.tokens += tokensIn; n.lpSupply += lpOut; n.lpUnissued -= lpOut },
                (self, change) => self.trade(2n, satsIn, tokensIn, lpOut, t.pkh, parent.toBuffer().toString('hex'), tokensIn, change)
            )
            return { b, lpOut, t }
        }
        function remove(tip: Tip, lpIn: bigint, proveWith = lpIn, id = LP_TOKEN_ID) {
            const t = randomTrader()
            const satsOut = (lpIn * tip.pool.sats) / tip.pool.lpSupply
            const tokensOut = (lpIn * tip.pool.tokens) / tip.pool.lpSupply
            const parent = tokenParent(id, proveWith, t.pkh)
            const fund = fundingTx([{ script: p2pkh(t.pkh), sats: 10_000n }], 0x33)
            return spend(
                tip,
                [{ tx: parent, vout: 0 }, { tx: fund, vout: 0 }],
                [
                    // the contract refuses a 0-token payout; skip it here so the call reaches the contract
                    ...(tokensOut > 0n ? [{ script: transferScript(TOKEN_ID, tokensOut, p2pkh(t.pkh)), sats: 1n }] : []),
                    { script: p2pkh(t.pkh), sats: satsOut },
                ],
                [{ script: p2pkh(t.pkh), sats: 5_000n }],
                (n) => { n.sats -= satsOut; n.tokens -= tokensOut; n.lpSupply -= lpIn; n.lpUnissued += lpIn },
                (self, change) => self.trade(3n, lpIn, satsOut, tokensOut, t.pkh, parent.toBuffer().toString('hex'), proveWith, change)
            )
        }
        it('add liquidity verifies', () => {
            const { b } = add(seededTip(), 1_000_000n)
            expect(b.ok, JSON.stringify(b.results)).to.eq(true)
            record('addLiquidity', b)
        })
        it('add liquidity respects the pool cap', () => {
            expect(add(seededTip({ sats: 99_500_000n }), 1_000_000n).b.ok).to.eq(false)
        })
        it('remove liquidity verifies with proven LP shares', () => {
            const b = remove(seededTip(), 1_000_000n)
            expect(b.ok, JSON.stringify(b.results)).to.eq(true)
            record('removeLiquidity', b)
        })
        it('remove liquidity rejects unproven LP shares (Phase B gap, now closed)', () => {
            expect(remove(seededTip(), 1_000_000n, 10n).ok).to.eq(false)
            expect(remove(seededTip(), 1_000_000n, 1_000_000n, TOKEN_ID).ok).to.eq(false)
        })
        it('graduation: launch LP shares (lockedLp = L) can never be removed', () => {
            const tip = seededTip()
            const L = tip.pool.lpSupply
            const grad = seededTip({ lockedLp: L })
            expect(remove(grad, 1n).ok).to.eq(false)
            expect(remove(grad, L - 1000n).ok).to.eq(false)
            // after someone else adds, only their shares can leave
            const a = add(grad, 1_000_000n)
            expect(a.b.ok).to.eq(true)
            const tip2 = { tx: a.b.tx, pool: a.b.next }
            expect(remove(tip2, a.lpOut).ok).to.eq(true)
            expect(remove({ tx: a.b.tx, pool: a.b.next }, a.lpOut + 1n).ok).to.eq(false)
        })
    })

    describe('Vault sibling binding', () => {
        it('a vault cannot be spent unless input 0 is its sibling pool', () => {
            const tip = seededTip()
            const t = randomTrader()
            const tx = new bsv.Transaction()
            const decoy = fundingTx([{ script: p2pkh(t.pkh), sats: 1000n }], 0x50)
            tx.addInputFromPrevTx(decoy, 0)
            tx.addInputFromPrevTx(tip.tx, 1)
            tx.addOutput(new bsv.Transaction.Output({ script: bsv.Script.fromHex(transferScript(TOKEN_ID, tip.pool.tokens, p2pkh(t.pkh))), satoshis: 1 }))
            tx.inputs[0].setScript(bsv.Script.fromHex('00'.repeat(107)))
            const v = new Vault()
            v.prependNOPScript(bsv.Script.fromHex(Bsv21.inscription(TOKEN_ID, tip.pool.tokens)))
            let ok = true
            try {
                tx.inputs[1].setScript(v.getUnlockingScript((self) => { self.to = { tx, inputIndex: 1 }; self.unlock() }))
                ok = tx.verifyScript(1).success
            } catch { ok = false }
            expect(ok).to.eq(false)
        })
    })

    after(() => {
        const g = seededTip().tx
        sizes['poolGenesis (outputs only; graduation adds the curve spend)'] = { bytes: g.toBuffer().length, contractInputs: [], outputs: g.outputs.length }
        const out = join(__dirname, '..', 'measurements.json')
        const rates = [1, 50, 100, 500]
        const table = Object.fromEntries(
            Object.entries(sizes).map(([k, v]) => [k, { ...v, minerFeeSats: Object.fromEntries(rates.map((r) => [`${r}sat/kB`, Math.ceil((v.bytes * r) / 1000)])) }])
        )
        writeFileSync(out, JSON.stringify({ note: 'Phase D. Measured locally with scrypt-ts 1.4.5 / scryptc 1.20.0. Trader P2PKH unlocks are 107-byte placeholders. Not broadcast.', poolScriptBytes: seededTip().pool.lockingScript.toBuffer().length, vaultScriptBytes: VAULT_CODE.length / 2, txs: table, phaseC: PHASE_C }, null, 2) + '\n')
        console.log(JSON.stringify(table, null, 2))
    })
})

void AmmPool; void Utils
