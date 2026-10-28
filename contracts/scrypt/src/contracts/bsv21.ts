/**
 * BSV-21 helpers usable inside sCrypt @method()s.
 *
 * - inscription / transferOutput: build a 1Sat BSV-21 transfer inscription
 *   (`{"p":"bsv-20","op":"transfer","id":"<id>","amt":"<n>"}`) followed by a
 *   locking script.
 * - outputScript: walk a raw parent transaction and return the locking script
 *   of output `vout` (bounded loops, see MAX_PARENT_*).
 * - isTransfer: check that a locking script carries a transfer of exactly
 *   `amt` of token `id` (caller states amt; script rebuilds and compares).
 *
 * Phase C (28 Oct 2026). Not audited. See docs/amm-design.md §12.
 */
import { assert, ByteString, int2ByteString, len, method, prop, slice, SmartContractLib, toByteString, Utils } from 'scrypt-ts'

/** Parent txs with more inputs/outputs than this cannot be used as token inputs. */
export const MAX_PARENT_INPUTS = 6
export const MAX_PARENT_OUTPUTS = 6
/** Max decimal digits in a BSV-21 amt (u64 max is 20 digits). */
export const MAX_DIGITS = 20

export class Bsv21 extends SmartContractLib {
    /** OP_FALSE OP_IF "ord" OP_1 "application/bsv-20" OP_0 (27 bytes) */
    @prop() static readonly ENVELOPE_HEAD: ByteString = toByteString('0063036f726451126170706c69636174696f6e2f6273762d323000')
    @prop() static readonly ENVELOPE_HEAD_LEN: bigint = 27n
    @prop() static readonly OP_ENDIF: ByteString = toByteString('68')
    @prop() static readonly P2PKH_HEAD: ByteString = toByteString('76a914')

    /** Decimal ASCII for a non-negative int (no leading zeros). */
    @method()
    static int2Ascii(n: bigint): ByteString {
        assert(n >= 0n, 'negative amt')
        let out = toByteString('')
        let m = n
        let done = false
        for (let i = 0n; i < MAX_DIGITS; i++) {
            if (!done) {
                out = int2ByteString((m % 10n) + 48n, 1n) + out
                m = m / 10n
                if (m == 0n) {
                    done = true
                }
            }
        }
        assert(done, 'amt too large')
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

    /** Value of a Bitcoin varint at `pos`. */
    @method()
    static varIntValue(tx: ByteString, pos: bigint): bigint {
        const b = Utils.fromLEUnsigned(slice(tx, pos, pos + 1n))
        let v = b
        if (b == 0xfdn) {
            v = Utils.fromLEUnsigned(slice(tx, pos + 1n, pos + 3n))
        } else if (b == 0xfen) {
            v = Utils.fromLEUnsigned(slice(tx, pos + 1n, pos + 5n))
        } else {
            assert(b < 0xffn, 'varint too big')
        }
        return v
    }

    /** Size in bytes of the varint at `pos`. */
    @method()
    static varIntSize(tx: ByteString, pos: bigint): bigint {
        const b = Utils.fromLEUnsigned(slice(tx, pos, pos + 1n))
        let s = 1n
        if (b == 0xfdn) {
            s = 3n
        } else if (b == 0xfen) {
            s = 5n
        }
        return s
    }

    /**
     * Locking script of output `vout` of raw tx `tx`. Walks the canonical
     * serialisation from the start, so a caller cannot point it at bytes that
     * are not really that output (e.g. inside an unlocking script).
     */
    @method()
    static outputScript(tx: ByteString, vout: bigint): ByteString {
        let pos = 4n // nVersion
        const nIn = Utils.fromLEUnsigned(slice(tx, pos, pos + 1n))
        assert(nIn > 0n && nIn <= MAX_PARENT_INPUTS, 'parent: too many inputs')
        pos += 1n
        for (let i = 0n; i < MAX_PARENT_INPUTS; i++) {
            if (i < nIn) {
                pos += 36n // outpoint
                const l = Bsv21.varIntValue(tx, pos)
                pos += Bsv21.varIntSize(tx, pos) + l + 4n // script + nSequence
            }
        }
        const nOut = Utils.fromLEUnsigned(slice(tx, pos, pos + 1n))
        assert(vout >= 0n && vout < nOut && nOut <= MAX_PARENT_OUTPUTS, 'parent: bad vout')
        pos += 1n
        let script = toByteString('')
        for (let i = 0n; i < MAX_PARENT_OUTPUTS; i++) {
            if (i <= vout) {
                pos += 8n // satoshis
                const l = Bsv21.varIntValue(tx, pos)
                const s = Bsv21.varIntSize(tx, pos)
                if (i == vout) {
                    script = slice(tx, pos + s, pos + s + l)
                }
                pos += s + l
            }
        }
        return script
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
