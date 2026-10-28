/**
 * Open batcher for a contended pool (design §8, v1.5).
 *
 * Traders submit signed intents (on mainnet: their funding inputs signed
 * SIGHASH_SINGLE|ANYONECANPAY-style plus min-out and a deadline). The batcher
 * chains them as consecutive spends of the pool tip, in arrival order.
 *
 * Properties the tests check:
 *  - no custody: an intent either executes at >= minOut or nothing moves;
 *  - expired intents are skipped, never executed late;
 *  - one bad intent never blocks the rest of the batch;
 *  - anyone can run one: it uses only public chain state and client.ts.
 */
import { MockChain, TxRejected } from './mockchain.js'
import * as c from './client.js'

export type Intent =
  | { id: string; kind: 'buy'; trader: string; satsIn: bigint; minOut: bigint; deadline: number }
  | { id: string; kind: 'sell'; trader: string; tokensIn: bigint; minOut: bigint; deadline: number }

export interface IntentResult {
  id: string
  status: 'filled' | 'rejected' | 'expired'
  txid?: string
  reason?: string
}

export function runBatch(chain: MockChain, ref: c.PoolRef, intents: Intent[], now: number): IntentResult[] {
  const out: IntentResult[] = []
  for (const it of intents) {
    if (now > it.deadline) {
      out.push({ id: it.id, status: 'expired' })
      continue
    }
    try {
      const txid =
        it.kind === 'buy'
          ? c.swapSatsForTokens(chain, ref, it.trader, it.satsIn, it.minOut)
          : c.swapTokensForSats(chain, ref, it.trader, it.tokensIn, it.minOut)
      out.push({ id: it.id, status: 'filled', txid })
    } catch (e) {
      if (!(e instanceof TxRejected) && !(e instanceof Error)) throw e
      out.push({ id: it.id, status: 'rejected', reason: (e as Error).message })
    }
  }
  return out
}
