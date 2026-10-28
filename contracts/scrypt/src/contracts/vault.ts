/**
 * Vault: the locking script under a pool's token vault (output 1) and LP
 * vault (output 2). It sits after the BSV-21 transfer inscription.
 *
 * Sibling binding: the vault created at (T, 1) or (T, 2) unlocks only when
 * input 0 of the spending tx is (T, 0), i.e. the pool output created in the
 * same transaction. The pool's own rules then decide every output. Anyone can
 * make a Vault holding their own tokens; it gives them nothing, because only
 * the genuine pool tx can create a vault holding the pool's tokens.
 */
import { assert, method, slice, SmartContract, toByteString } from 'scrypt-ts'

export class Vault extends SmartContract {
    @method()
    public unlock() {
        const idx = this.ctx.utxo.outpoint.outputIndex
        assert(idx == 1n || idx == 2n, 'vault must be output 1 or 2')
        assert(slice(this.prevouts, 0n, 36n) == this.ctx.utxo.outpoint.txid + toByteString('00000000'), 'not my pool')
    }
}
