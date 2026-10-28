/**
 * BSVEX constant-product pool (Phase C, shrunk in Phase D, 28 Oct 2026).
 *
 * STATUS: compiles with pinned scrypt-ts 1.4.5 + scryptc 1.20.0 and runs on
 * the local script interpreter only. Not deployed, not audited.
 *
 * Every pool transaction has the same three contract inputs and outputs:
 *   inputs : [0] AmmPool  [1] Vault(token)  [2] Vault(LP)  [3..] trader
 *   outputs: [0] AmmPool' [1] Vault(token)' [2] Vault(LP)' [..] payouts [..] trader change
 * Phase D: one public method `trade`, one trader token input (input 3).
 * The LP vault is recreated on every call (Phase B only recreated it on
 * add/remove). That costs one extra token output per swap but lets both
 * vaults use the simple sibling binding; see docs/amm-design.md §12.2 for
 * why the Phase B parent-tx binding for the LP vault was forgeable.
 *
 * The maths mirrors ../../src/math.ts exactly; the tests there are the spec.
 */
import { assert, ByteString, hash256, method, prop, PubKeyHash, slice, SmartContract, toByteString, Utils } from 'scrypt-ts'
import { Bsv21 } from './bsv21'

/** One trader token input per call (owner decision 28 Oct): input 3. */
export const MAX_TOKEN_INPUTS = 1

export class AmmPool extends SmartContract {
    @prop() static readonly BPS: bigint = 10000n
    @prop() static readonly MIN_PROTOCOL_FEE: bigint = 1n

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

    /**
     * The one entry point (Phase D: a single public method so the output
     * builder, the vault check and the decimal encoder are in the script once).
     *   op 0 buy     swapSatsForTokens(a = satsIn,   b = minTokensOut)
     *   op 1 sell    swapTokensForSats(a = tokensIn, b = minSatsOut)
     *   op 2 add     addLiquidity     (a = satsIn,   b = maxTokensIn, c = minLpOut)
     *   op 3 remove  removeLiquidity  (a = lpIn,     b = minSatsOut,  c = minTokensOut)
     *
     * ONE token input per trade (owner, 28 Oct): for ops 1-3 the trader's
     * token (or LP share) input must be input 3, and only input 3 is credited.
     * Tokens on any other input count for nothing, so a trade that needs two
     * UTXOs fails 'token inputs short'; traders merge their tokens first.
     * `parent` is input 3's parent tx and `parentAmt` the amount it carries;
     * for op 0 both are ignored (pass '' and 0). Any surplus of parentAmt over
     * what the op uses must go back to the trader in `change`, or the
     * indexer burns it.
     *
     * Outputs: [0] pool' [1] token vault' [2] LP vault'
     *          [3] token payout (op 0 tokens, op 2 LP shares, op 3 tokens)
     *          [.] sats to trader (ops 1, 3)  [.] protocol fee (ops 0, 1)
     *          [..] change (trader's, unchecked)
     */
    @method()
    public trade(op: bigint, a: bigint, b: bigint, c: bigint, trader: PubKeyHash, parent: ByteString, parentAmt: bigint, change: ByteString) {
        // Inputs 0..2 are this pool and its sibling vaults.
        const myTxid = this.ctx.utxo.outpoint.txid
        assert(this.ctx.utxo.outpoint.outputIndex == 0n, 'pool must be output 0')
        assert(
            slice(this.prevouts, 0n, 108n) ==
                myTxid + toByteString('00000000') + myTxid + toByteString('01000000') + myTxid + toByteString('02000000'),
            'inputs 0-2 must be my pool and vaults'
        )
        assert(op >= 0n && op <= 3n, 'bad op')
        assert(a > 0n)

        // Token proof (design §9.1 a), once, for input 3 only.
        let proven = 0n
        if (op > 0n) {
            assert(
                hash256(parent) == slice(this.prevouts, 108n, 140n) &&
                    Bsv21.isTransfer(
                        Bsv21.outputScript(parent, Utils.fromLEUnsigned(slice(this.prevouts, 140n, 144n))),
                        op == 3n ? this.lpTokenId : this.tokenId,
                        parentAmt
                    ),
                'input 3 is not a transfer of id/amt'
            )
            proven = parentAmt
        }

        let payId = this.tokenId
        let payAmt = 0n
        let satsToTrader = 0n
        let pFee = 0n
        if (op <= 1n) {
            // swaps
            const oldK = this.sats * this.tokens
            if (op == 0n) {
                pFee = this.protocolFee(a)
                assert(a > pFee)
                const net = a - pFee
                payAmt = AmmPool.amountOut(net, this.sats, this.tokens, this.lpFeeBps)
                assert(payAmt > 0n && payAmt >= b && payAmt < this.tokens, 'slippage')
                this.sats += net
                this.tokens -= payAmt
            } else {
                assert(proven >= a, 'token inputs short')
                const gross = AmmPool.amountOut(a, this.tokens, this.sats, this.lpFeeBps)
                pFee = this.protocolFee(gross)
                assert(gross > pFee && gross < this.sats)
                satsToTrader = gross - pFee
                assert(satsToTrader >= b, 'slippage')
                this.sats -= gross
                this.tokens += a
            }
            assert(this.sats * this.tokens >= oldK, 'k decreased')
        } else if (op == 2n) {
            // add liquidity: a sats + ceil(a*tokens/sats) tokens
            const tokensIn = (a * this.tokens + this.sats - 1n) / this.sats
            assert(tokensIn <= b, 'slippage')
            assert(proven >= tokensIn, 'token inputs short')
            payAmt = (a * this.lpSupply) / this.sats
            assert(payAmt > 0n && payAmt >= c && payAmt < this.lpUnissued, 'slippage')
            payId = this.lpTokenId
            this.sats += a
            this.tokens += tokensIn
            this.lpSupply += payAmt
            this.lpUnissued -= payAmt
        } else {
            // remove liquidity: LP shares in
            assert(proven >= a, 'LP inputs short')
            assert(this.lpSupply - a >= this.lockedLp, 'locked liquidity')
            satsToTrader = (a * this.sats) / this.lpSupply
            payAmt = (a * this.tokens) / this.lpSupply
            assert(satsToTrader >= b && payAmt >= c && satsToTrader > 0n && payAmt > 0n, 'slippage')
            this.sats -= satsToTrader
            this.tokens -= payAmt
            this.lpSupply -= a
            this.lpUnissued += a
        }

        assert(this.sats <= this.maxSats, 'pool cap')
        assert(this.tokens > 0n && this.sats > 0n)
        let outputs =
            this.buildStateOutput(this.sats) +
            Bsv21.transferOutput(this.tokenId, this.tokens, this.vaultCode) +
            Bsv21.transferOutput(this.lpTokenId, this.lpUnissued, this.vaultCode)
        if (payAmt > 0n) {
            outputs += Bsv21.transferOutput(payId, payAmt, Utils.buildPublicKeyHashScript(trader))
        }
        if (satsToTrader > 0n) {
            outputs += Utils.buildPublicKeyHashOutput(trader, satsToTrader)
        }
        if (pFee > 0n) {
            outputs += Utils.buildPublicKeyHashOutput(this.protocolPkh, pFee)
        }
        assert(hash256(outputs + change) == this.ctx.hashOutputs, 'outputs mismatch')
    }
}
