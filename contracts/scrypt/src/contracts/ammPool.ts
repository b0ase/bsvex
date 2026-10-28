/**
 * BSVEX constant-product pool (Phase C, 28 Oct 2026).
 *
 * STATUS: compiles with pinned scrypt-ts 1.4.5 + scryptc 1.20.0 and runs on
 * the local script interpreter only. Not deployed, not audited.
 *
 * Every pool transaction has the same three contract inputs and outputs:
 *   inputs : [0] AmmPool  [1] Vault(token)  [2] Vault(LP)  [3..] trader
 *   outputs: [0] AmmPool' [1] Vault(token)' [2] Vault(LP)' [..] payouts [..] trader change
 * The LP vault is recreated on every call (Phase B only recreated it on
 * add/remove). That costs one extra token output per swap but lets both
 * vaults use the simple sibling binding; see docs/amm-design.md §12.2 for
 * why the Phase B parent-tx binding for the LP vault was forgeable.
 *
 * The maths mirrors ../../src/math.ts exactly; the tests there are the spec.
 */
import { assert, ByteString, FixedArray, hash256, method, prop, PubKeyHash, slice, SmartContract, toByteString, Utils } from 'scrypt-ts'
import { Bsv21 } from './bsv21'

/** Max trader token inputs (and parent txs) per call. */
export const MAX_TOKEN_INPUTS = 2

export class AmmPool extends SmartContract {
    @prop() static readonly BPS: bigint = 10000n
    @prop() static readonly MIN_PROTOCOL_FEE: bigint = 1n
    @prop() static readonly FIRST_TRADER_INPUT: bigint = 3n

    @prop() readonly tokenId: ByteString // ASCII "<txid>_<vout>" of the traded BSV-21 token
    @prop() readonly lpTokenId: ByteString // ASCII id of this pool's LP share token
    @prop() readonly vaultCode: ByteString // locking script of Vault (after the inscription)
    @prop() readonly protocolPkh: PubKeyHash // deploy parameter, immutable after
    @prop() readonly lpFeeBps: bigint // 25 = 0.25%
    @prop() readonly protocolFeeBps: bigint // 5 (our tokens) or 10 (third-party tokens)
    @prop() readonly maxSats: bigint // pool cap: 100_000_000 (1 BSV) until audited
    @prop() readonly lockedLp: bigint // shares that can never be removed (1000, or all of L at graduation)

    @prop(true) sats: bigint // == this UTXO's value
    @prop(true) tokens: bigint // == token vault amt
    @prop(true) lpSupply: bigint // issued shares incl. locked
    @prop(true) lpUnissued: bigint // == LP vault amt

    constructor(
        tokenId: ByteString,
        lpTokenId: ByteString,
        vaultCode: ByteString,
        protocolPkh: PubKeyHash,
        lpFeeBps: bigint,
        protocolFeeBps: bigint,
        maxSats: bigint,
        lockedLp: bigint,
        sats: bigint,
        tokens: bigint,
        lpSupply: bigint,
        lpUnissued: bigint
    ) {
        super(...arguments)
        this.tokenId = tokenId
        this.lpTokenId = lpTokenId
        this.vaultCode = vaultCode
        this.protocolPkh = protocolPkh
        this.lpFeeBps = lpFeeBps
        this.protocolFeeBps = protocolFeeBps
        this.maxSats = maxSats
        this.lockedLp = lockedLp
        this.sats = sats
        this.tokens = tokens
        this.lpSupply = lpSupply
        this.lpUnissued = lpUnissued
    }

    @method()
    static amountOut(amountIn: bigint, rIn: bigint, rOut: bigint, feeBps: bigint): bigint {
        const inWithFee = amountIn * (AmmPool.BPS - feeBps)
        return (inWithFee * rOut) / (rIn * AmmPool.BPS + inWithFee)
    }

    @method()
    protocolFee(amount: bigint): bigint {
        const f = (amount * this.protocolFeeBps + AmmPool.BPS - 1n) / AmmPool.BPS
        return f < AmmPool.MIN_PROTOCOL_FEE ? AmmPool.MIN_PROTOCOL_FEE : f
    }

    /** Inputs 1 and 2 must be this pool's sibling vaults. */
    @method()
    checkVaultInputs(): boolean {
        const myTxid = this.ctx.utxo.outpoint.txid
        assert(this.ctx.utxo.outpoint.outputIndex == 0n, 'pool must be output 0')
        assert(slice(this.prevouts, 0n, 36n) == myTxid + toByteString('00000000'), 'pool must be input 0')
        assert(slice(this.prevouts, 36n, 72n) == myTxid + toByteString('01000000'), 'input 1 not my token vault')
        assert(slice(this.prevouts, 72n, 108n) == myTxid + toByteString('02000000'), 'input 2 not my LP vault')
        return true
    }

    /** Outputs 0..2: pool', token vault', LP vault'. Enforces the pool cap. */
    @method()
    poolOutputs(): ByteString {
        assert(this.sats <= this.maxSats, 'pool cap')
        assert(this.tokens > 0n && this.sats > 0n)
        return (
            this.buildStateOutput(this.sats) +
            Bsv21.transferOutput(this.tokenId, this.tokens, this.vaultCode) +
            Bsv21.transferOutput(this.lpTokenId, this.lpUnissued, this.vaultCode)
        )
    }

    /**
     * Sum of BSV-21 `id` carried by trader inputs 3..3+n-1, proven from their
     * parent txs (design §9.1 a). The caller states each input's amt; the
     * contract checks the parent hash, walks to the output and compares the
     * inscription bytes. Cannot prove the parents were indexer-valid (§9.1 b,
     * residual risk handled off chain).
     */
    @method()
    provenTokenIn(
        id: ByteString,
        parents: FixedArray<ByteString, typeof MAX_TOKEN_INPUTS>,
        amts: FixedArray<bigint, typeof MAX_TOKEN_INPUTS>,
        n: bigint
    ): bigint {
        assert(n > 0n && n <= MAX_TOKEN_INPUTS, 'token input count')
        let total = 0n
        for (let i = 0; i < MAX_TOKEN_INPUTS; i++) {
            if (BigInt(i) < n) {
                const at = (AmmPool.FIRST_TRADER_INPUT + BigInt(i)) * 36n
                const vout = Utils.fromLEUnsigned(slice(this.prevouts, at + 32n, at + 36n))
                assert(hash256(parents[i]) == slice(this.prevouts, at, at + 32n), 'parent mismatch')
                assert(Bsv21.isTransfer(Bsv21.outputScript(parents[i], vout), id, amts[i]), 'not a transfer of id/amt')
                total += amts[i]
            }
        }
        return total
    }

    @method()
    public swapSatsForTokens(satsIn: bigint, minOut: bigint, trader: PubKeyHash, change: ByteString) {
        this.checkVaultInputs()
        const oldK = this.sats * this.tokens
        const pFee = this.protocolFee(satsIn)
        assert(satsIn > pFee)
        const net = satsIn - pFee
        const out = AmmPool.amountOut(net, this.sats, this.tokens, this.lpFeeBps)
        assert(out > 0n && out >= minOut, 'slippage')
        assert(out < this.tokens)
        this.sats += net
        this.tokens -= out
        assert(this.sats * this.tokens >= oldK, 'k decreased')
        const outputs =
            this.poolOutputs() +
            Bsv21.transferOutput(this.tokenId, out, Utils.buildPublicKeyHashScript(trader)) +
            Utils.buildPublicKeyHashOutput(this.protocolPkh, pFee) +
            change
        assert(hash256(outputs) == this.ctx.hashOutputs, 'outputs mismatch')
    }

    /**
     * Every call that takes tokens in goes through here, so the (large)
     * token-input proof is in the script once, not three times.
     *   op 1 swapTokensForSats(a = tokensIn, b = minSatsOut)
     *   op 2 addLiquidity(a = satsIn, b = maxTokensIn, c = minLpOut)
     *   op 3 removeLiquidity(a = lpIn, b = minSatsOut, c = minTokensOut)  (LP tokens in)
     * Token input amounts beyond what the op needs must be returned by the
     * trader in `change` (a token change output), or the indexer burns them.
     */
    @method()
    public tokenCall(
        op: bigint,
        a: bigint,
        b: bigint,
        c: bigint,
        trader: PubKeyHash,
        parents: FixedArray<ByteString, typeof MAX_TOKEN_INPUTS>,
        amts: FixedArray<bigint, typeof MAX_TOKEN_INPUTS>,
        nParents: bigint,
        change: ByteString
    ) {
        this.checkVaultInputs()
        assert(op >= 1n && op <= 3n, 'bad op')
        assert(a > 0n)
        const proven = this.provenTokenIn(op == 3n ? this.lpTokenId : this.tokenId, parents, amts, nParents)
        let payouts = toByteString('')

        if (op == 1n) {
            // swap tokens -> sats
            assert(proven >= a, 'token inputs short')
            const oldK = this.sats * this.tokens
            const gross = AmmPool.amountOut(a, this.tokens, this.sats, this.lpFeeBps)
            const pFee = this.protocolFee(gross)
            assert(gross > pFee && gross < this.sats)
            const out = gross - pFee
            assert(out >= b, 'slippage')
            this.sats -= gross
            this.tokens += a
            assert(this.sats * this.tokens >= oldK, 'k decreased')
            payouts = Utils.buildPublicKeyHashOutput(trader, out) + Utils.buildPublicKeyHashOutput(this.protocolPkh, pFee)
        } else if (op == 2n) {
            // add liquidity: a sats + ceil(a*tokens/sats) tokens
            const tokensIn = (a * this.tokens + this.sats - 1n) / this.sats
            assert(tokensIn <= b, 'slippage')
            assert(proven >= tokensIn, 'token inputs short')
            const lpOut = (a * this.lpSupply) / this.sats
            assert(lpOut > 0n && lpOut >= c && lpOut < this.lpUnissued, 'slippage')
            this.sats += a
            this.tokens += tokensIn
            this.lpSupply += lpOut
            this.lpUnissued -= lpOut
            payouts = Bsv21.transferOutput(this.lpTokenId, lpOut, Utils.buildPublicKeyHashScript(trader))
        } else {
            // remove liquidity: LP shares in (Phase B forgot to prove these)
            assert(proven >= a, 'LP inputs short')
            assert(this.lpSupply - a >= this.lockedLp, 'locked liquidity')
            const satsOut = (a * this.sats) / this.lpSupply
            const tokensOut = (a * this.tokens) / this.lpSupply
            assert(satsOut >= b && tokensOut >= c && satsOut > 0n && tokensOut > 0n, 'slippage')
            this.sats -= satsOut
            this.tokens -= tokensOut
            this.lpSupply -= a
            this.lpUnissued += a
            payouts =
                Utils.buildPublicKeyHashOutput(trader, satsOut) +
                Bsv21.transferOutput(this.tokenId, tokensOut, Utils.buildPublicKeyHashScript(trader))
        }
        const outputs = this.poolOutputs() + payouts + change
        assert(hash256(outputs) == this.ctx.hashOutputs, 'outputs mismatch')
    }
}
