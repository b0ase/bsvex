/**
 * BSV-21 helpers usable inside sCrypt @method()s.
 *
 * - inscription / transferOutput: build a 1Sat BSV-21 transfer inscription
 *   (`{"p":"bsv-20","op":"transfer","id":"<id>","amt":"<n>"}`) followed by a
 *   locking script.
 * - outputScript: walk a raw parent transaction and return the locking script
 *   of output `vout` (bounded loops, see MAX_PARENT_INPUTS / MAX_PARENT_VOUT).
 * - isTransfer: check that a locking script carries a transfer of exactly
 *   `amt` of token `id` (caller states amt; script rebuilds and compares).
 *
 * Phase C/D (28 Oct 2026). Not audited. See docs/amm-design.md §12.
 */
import { assert, ByteString, int2ByteString, len, method, prop, slice, SmartContractLib, toByteString, Utils } from 'scrypt-ts'

/**
 * Token-input parent tx bounds (Phase D, tightened from 6 x 6). A pool tx has
 * 3 contract inputs + trader funding and puts the trader's token payout at
 * output 3, so a payout can be traded straight back if the pool tx that
 * created it had at most MAX_PARENT_INPUTS inputs. Otherwise the trader
 * merges (self-sends) first, which they must do anyway to get one input.
 */
export const MAX_PARENT_INPUTS = 5
export const MAX_PARENT_VOUT = 3
/** Max decimal digits in a BSV-21 amt (u64 max is 20 digits). */
export const MAX_DIGITS = 20

export class Bsv21 extends SmartContractLib {
    /** OP_FALSE OP_IF "ord" OP_1 "application/bsv-20" OP_0 (27 bytes) */
    @prop() static readonly ENVELOPE_HEAD: ByteString = toByteString('0063036f726451126170706c69636174696f6e2f6273762d323000')
    @prop() static readonly ENVELOPE_HEAD_LEN: bigint = 27n
    @prop() static readonly OP_ENDIF: ByteString = toByteString('68')
    @prop() static readonly P2PKH_HEAD: ByteString = toByteString('76a914')

    /**
     * Decimal ASCII for a positive int (no leading zeros). Every amount the
     * contract writes or checks is > 0, so 0 is refused; that drops the
     * "done" flag and makes each of the MAX_DIGITS unrolled steps smaller.
     */
    @method()
    static int2Ascii(n: bigint): ByteString {
        assert(n > 0n, 'amt must be > 0')
        let out = toByteString('')
        let m = n
        for (let i = 0n; i < MAX_DIGITS; i++) {
            if (m > 0n) {
                out = int2ByteString((m % 10n) + 48n, 1n) + out
                m = m / 10n
            }
        }
        assert(m == 0n, 'amt too large')
        return out
    }

    /** Script push of `data` (direct / PUSHDATA1 / PUSHDATA2). */
    @method()
    static pushData(data: ByteString): ByteString {
        const n = len(data)
        let head = toByteString('')
        if (n < 76n) {
            head = int2ByteString(n, 1n)
        } else if (n < 256n) {
            head = toByteString('4c') + Utils.toLEUnsigned(n, 1n)
        } else {
            head = toByteString('4d') + Utils.toLEUnsigned(n, 2n)
        }
        return head + data
    }

    /** Canonical transfer JSON (key order p, op, id, amt). */
    @method()
    static transferJson(id: ByteString, amt: bigint): ByteString {
        return (
            toByteString('{"p":"bsv-20","op":"transfer","id":"', true) +
            id +
            toByteString('","amt":"', true) +
            Bsv21.int2Ascii(amt) +
            toByteString('"}', true)
        )
    }

    /** Inscription envelope for a transfer of `amt` of `id`. */
    @method()
    static inscription(id: ByteString, amt: bigint): ByteString {
        return Bsv21.ENVELOPE_HEAD + Bsv21.pushData(Bsv21.transferJson(id, amt)) + Bsv21.OP_ENDIF
    }

    /** 1-sat output: transfer inscription, then `lock` (e.g. P2PKH or vault code). */
    @method()
    static transferOutput(id: ByteString, amt: bigint, lock: ByteString): ByteString {
        return Utils.buildOutput(Bsv21.inscription(id, amt) + lock, 1n)
    }

    /**
     * Position just after the varint-prefixed field at `pos` (varint + data).
     * 1- and 3-byte varints only (fields under 64 kB); a 0xfe/0xff prefix fails.
     */
    @method()
    static skipVarField(tx: ByteString, pos: bigint): bigint {
        const b = Utils.fromLEUnsigned(slice(tx, pos, pos + 1n))
        let end = pos + 1n + b
        if (b == 0xfdn) {
            end = pos + 3n + Utils.fromLEUnsigned(slice(tx, pos + 1n, pos + 3n))
        } else {
            assert(b < 0xfdn, 'varint too big')
        }
        return end
    }

    /**
     * Locking script of output `vout` of raw tx `tx`. Walks the canonical
     * serialisation from the start, so a caller cannot point it at bytes that
     * are not really that output (e.g. inside an unlocking script).
     * Bounds (Phase D): at most MAX_PARENT_INPUTS inputs and vout at most
     * MAX_PARENT_VOUT. vout < nOut needs no check: vout comes from a real
     * outpoint of the spending tx, so consensus already guarantees it.
     */
    @method()
    static outputScript(tx: ByteString, vout: bigint): ByteString {
        const nIn = Utils.fromLEUnsigned(slice(tx, 4n, 5n))
        assert(nIn > 0n && nIn <= MAX_PARENT_INPUTS, 'parent: too many inputs')
        assert(vout <= MAX_PARENT_VOUT, 'parent: vout too high')
        let pos = 5n
        for (let i = 0n; i < MAX_PARENT_INPUTS; i++) {
            if (i < nIn) {
                pos = Bsv21.skipVarField(tx, pos + 36n) + 4n // outpoint, script, nSequence
            }
        }
        assert(Utils.fromLEUnsigned(slice(tx, pos, pos + 1n)) < 0xfdn, 'parent: too many outputs')
        pos += 1n // output count
        for (let i = 0n; i < MAX_PARENT_VOUT; i++) {
            if (i < vout) {
                pos = Bsv21.skipVarField(tx, pos + 8n)
            }
        }
        pos += 8n // satoshis
        const end = Bsv21.skipVarField(tx, pos)
        let hdr = 1n
        if (slice(tx, pos, pos + 1n) == toByteString('fd')) {
            hdr = 3n
        }
        return slice(tx, pos + hdr, end)
    }

    /**
     * True if `script` carries a BSV-21 transfer of exactly `amt` of `id`.
     * Instead of parsing digits, the caller states `amt` and the contract
     * rebuilds the envelope and compares bytes, which is far smaller script.
     * Accepts the envelope at offset 0 or after a leading 25-byte P2PKH, and
     * both key orders wallets use. Anything else (whitespace, leading zeros,
     * extra keys) fails; the trader re-sends to a canonical output first.
     */
    @method()
    static isTransfer(script: ByteString, id: ByteString, amt: bigint): boolean {
        let s = script
        if (slice(script, 0n, 3n) == Bsv21.P2PKH_HEAD) {
            s = slice(script, 25n, len(script))
        }
        const d = Bsv21.int2Ascii(amt)
        const ja =
            toByteString('{"p":"bsv-20","op":"transfer","id":"', true) + id + toByteString('","amt":"', true) + d + toByteString('"}', true)
        const jb =
            toByteString('{"p":"bsv-20","op":"transfer","amt":"', true) + d + toByteString('","id":"', true) + id + toByteString('"}', true)
        const a = Bsv21.ENVELOPE_HEAD + Bsv21.pushData(ja) + Bsv21.OP_ENDIF
        const b = Bsv21.ENVELOPE_HEAD + Bsv21.pushData(jb) + Bsv21.OP_ENDIF
        // a and b have the same length
        const head = slice(s, 0n, len(a))
        return amt > 0n && (head == a || head == b)
    }
}
