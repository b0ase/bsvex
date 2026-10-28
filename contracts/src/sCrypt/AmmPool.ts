/**
 * DRAFT sCrypt (scrypt-ts 1.4.x) source for the BSVEX pool state contract.
 *
 * STATUS: not compiled, not deployed, not audited. It is excluded from the
 * package typecheck because scrypt-ts / scrypt-ord are not installed here
 * (see docs/research.md: scrypt-ts has had no release since Feb 2025, and
 * compiling needs the native sCrypt compiler). Phase B compiles it, runs
 * it on the scrypt-ts local provider, then on testnet.
 *
 * The maths mirrors src/math.ts exactly; the tests there are the spec.
 *
 * Layout of every pool transaction (see docs/amm-design.md §2):
 *   inputs : [0] AmmPool (this)  [1] TokenVault  [2] LpVault (add/remove only)  [3..] trader
 *   outputs: [0] AmmPool'  [1] TokenVault'  [2] LpVault' (add/remove)  [..] payouts  [..] trader change
 * The contract hashes the outputs it requires and compares them to the
 * leading part of hashOutputs; trader change is passed in as raw bytes.
 */
import { assert, ByteString, hash256, method, prop, PubKeyHash, SmartContract, Utils, toByteString } from 'scrypt-ts'
import { BSV20V2 } from 'scrypt-ord'

export class AmmPool extends SmartContract {
  @prop() readonly tokenId: ByteString // BSV-21 id "<txid>_<vout>" of the traded token
  @prop() readonly lpTokenId: ByteString // BSV-21 id of this pool's LP share token
  @prop() readonly vaultCode: ByteString // locking script of TokenVault (minus inscription)
  @prop() readonly lpVaultCode: ByteString
  @prop() readonly protocolPkh: PubKeyHash // configurable at deploy, immutable after
  @prop() readonly lpFeeBps: bigint
  @prop() readonly protocolFeeBps: bigint

  @prop(true) sats: bigint // must equal this UTXO's value
  @prop(true) tokens: bigint // must equal TokenVault amt
  @prop(true) lpSupply: bigint
  @prop(true) lpUnissued: bigint // must equal LpVault amt

  static readonly BPS = 10000n
  static readonly MIN_PROTOCOL_FEE = 1n

  constructor(tokenId: ByteString, lpTokenId: ByteString, vaultCode: ByteString, lpVaultCode: ByteString, protocolPkh: PubKeyHash, lpFeeBps: bigint, protocolFeeBps: bigint, sats: bigint, tokens: bigint, lpSupply: bigint, lpUnissued: bigint) {
    super(...arguments)
    this.tokenId = tokenId
    this.lpTokenId = lpTokenId
    this.vaultCode = vaultCode
    this.lpVaultCode = lpVaultCode
    this.protocolPkh = protocolPkh
    this.lpFeeBps = lpFeeBps
    this.protocolFeeBps = protocolFeeBps
    this.sats = sats
    this.tokens = tokens
    this.lpSupply = lpSupply
    this.lpUnissued = lpUnissued
  }

  @method() static amountOut(amountIn: bigint, rIn: bigint, rOut: bigint, feeBps: bigint): bigint {
    const inWithFee = amountIn * (AmmPool.BPS - feeBps)
    return (inWithFee * rOut) / (rIn * AmmPool.BPS + inWithFee)
  }

  @method() protocolFee(amount: bigint): bigint {
    const f = (amount * this.protocolFeeBps + AmmPool.BPS - 1n) / AmmPool.BPS
    return f < AmmPool.MIN_PROTOCOL_FEE ? AmmPool.MIN_PROTOCOL_FEE : f
  }

  /** Vault output: 1 sat, BSV-21 transfer inscription for `amt`, then the vault code. */
  @method() vaultOutput(id: ByteString, code: ByteString, amt: bigint): ByteString {
    return Utils.buildOutput(BSV20V2.createTransferInsciption(id, amt) + code, 1n)
  }

  @method() poolAndVault(oldK: bigint): ByteString {
    assert(this.sats * this.tokens >= oldK, 'k decreased')
    return this.buildStateOutput(this.sats) + this.vaultOutput(this.tokenId, this.vaultCode, this.tokens)
  }

  @method() public swapSatsForTokens(satsIn: bigint, minOut: bigint, trader: PubKeyHash, change: ByteString) {
    const oldK = this.sats * this.tokens
    const pFee = this.protocolFee(satsIn)
    assert(satsIn > pFee)
    const net = satsIn - pFee
    const out = AmmPool.amountOut(net, this.sats, this.tokens, this.lpFeeBps)
    assert(out > 0n && out >= minOut, 'slippage')
    assert(out < this.tokens)
    this.sats += net
    this.tokens -= out
    const outputs =
      this.poolAndVault(oldK) +
      Utils.buildOutput(BSV20V2.buildTransferScript(trader, this.tokenId, out), 1n) +
      Utils.buildPublicKeyHashOutput(this.protocolPkh, pFee) +
      change
    assert(hash256(outputs) == this.ctx.hashOutputs, 'outputs mismatch')
  }

  @method() public swapTokensForSats(tokensIn: bigint, minOut: bigint, trader: PubKeyHash, change: ByteString) {
    const oldK = this.sats * this.tokens
    const gross = AmmPool.amountOut(tokensIn, this.tokens, this.sats, this.lpFeeBps)
    const pFee = this.protocolFee(gross)
    assert(gross > pFee)
    const out = gross - pFee
    assert(out >= minOut, 'slippage')
    assert(gross < this.sats)
    this.sats -= gross
    this.tokens += tokensIn
    // Token conservation (trader's tokens -> vault) is enforced by the BSV-21
    // indexer, not script; the vault's new amount here is what the indexer
    // will credit only if the trader really supplied tokensIn. See the
    // "token-inscription mismatch" risk in docs/amm-design.md §9.
    const outputs = this.poolAndVault(oldK) + Utils.buildPublicKeyHashOutput(trader, out) + Utils.buildPublicKeyHashOutput(this.protocolPkh, pFee) + change
    assert(hash256(outputs) == this.ctx.hashOutputs, 'outputs mismatch')
  }

  @method() public addLiquidity(satsIn: bigint, maxTokensIn: bigint, minLpOut: bigint, trader: PubKeyHash, change: ByteString) {
    const oldK = this.sats * this.tokens
    const tokensIn = (satsIn * this.tokens + this.sats - 1n) / this.sats
    assert(tokensIn <= maxTokensIn, 'slippage')
    const lpOut = (satsIn * this.lpSupply) / this.sats
    assert(lpOut > 0n && lpOut >= minLpOut, 'slippage')
    this.sats += satsIn
    this.tokens += tokensIn
    this.lpSupply += lpOut
    this.lpUnissued -= lpOut
    const outputs =
      this.poolAndVault(oldK) +
      this.vaultOutput(this.lpTokenId, this.lpVaultCode, this.lpUnissued) +
      Utils.buildOutput(BSV20V2.buildTransferScript(trader, this.lpTokenId, lpOut), 1n) +
      change
    assert(hash256(outputs) == this.ctx.hashOutputs, 'outputs mismatch')
  }

  @method() public removeLiquidity(lpIn: bigint, minSatsOut: bigint, minTokensOut: bigint, trader: PubKeyHash, change: ByteString) {
    assert(lpIn > 0n && lpIn <= this.lpSupply - 1000n, 'locked liquidity')
    const satsOut = (lpIn * this.sats) / this.lpSupply
    const tokensOut = (lpIn * this.tokens) / this.lpSupply
    assert(satsOut >= minSatsOut && tokensOut >= minTokensOut && satsOut > 0n && tokensOut > 0n, 'slippage')
    this.sats -= satsOut
    this.tokens -= tokensOut
    this.lpSupply -= lpIn
    this.lpUnissued += lpIn
    const outputs =
      this.buildStateOutput(this.sats) +
      this.vaultOutput(this.tokenId, this.vaultCode, this.tokens) +
      this.vaultOutput(this.lpTokenId, this.lpVaultCode, this.lpUnissued) +
      Utils.buildPublicKeyHashOutput(trader, satsOut) +
      Utils.buildOutput(BSV20V2.buildTransferScript(trader, this.tokenId, tokensOut), 1n) +
      change
    assert(hash256(outputs) == this.ctx.hashOutputs, 'outputs mismatch')
  }
}

/**
 * Token vault: 1 sat holding the token reserve. Unlocks only when input 0 is
 * the pool output created in the same transaction as this vault (sibling
 * binding): prevouts[0] == (myTxid, 0) and I am (myTxid, 1). The pool's
 * own rules then decide every output.
 */
export class TokenVault extends SmartContract {
  @method() public unlock(prevouts: ByteString) {
    assert(hash256(prevouts) == this.ctx.hashPrevouts, 'bad prevouts')
    const myTxid = this.ctx.utxo.outpoint.txid
    assert(this.ctx.utxo.outpoint.outputIndex == 1n)
    // prevouts is a concatenation of 36-byte outpoints; input 0 is first.
    assert(prevouts.slice(0, 72) == myTxid + toByteString('00000000'), 'not my pool')
  }
}
