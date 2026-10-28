# BSVEX AMM: research (Phase A, 27 Oct 2026)

Confidence labels: **[verified]** means checked against the source or the code today. **[memory]** means from prior knowledge and not re-checked today; confirm it in phase B.

## 1. Smart-contract options on BSV

| Option | Status | Fit for the AMM |
|---|---|---|
| **sCrypt, `scrypt-ts` 1.4.5** + `scrypt-ord` 1.0.17 | **[verified]** npm: scrypt-ts last published 11 Feb 2025; scrypt-ord 31 Jan 2024; scrypt-cli 0.2.3 on 28 Feb 2025. The sCrypt company's newer `@scrypt-inc/*` packages target BTC, not BSV (`@scrypt-inc/scrypt-ts-btc` 1.0.3). | **Best available.** It supports stateful contracts (`@prop(true)`, `buildStateOutput`, `ctx.hashOutputs`), and `scrypt-ord`'s `BSV20V2` class is the BSV-21 base class. It is in maintenance mode, though, so we must pin versions and vendor the compiler. |
| Hand-written script with `@bsv/sdk` `ScriptTemplate` | @bsv/sdk is current and maintained **[verified]**, npm latest 4.0.0; we use 2.x elsewhere. | Possible, but an AMM with 128-bit multiply/divide and output hashing in raw opcodes is a large audit surface. Use it only for the small vault scripts if sCrypt compilation becomes a blocker. |
| `@1sat/templates` / `@1sat/actions` | Maintained by the 1Sat team; already used in our `1sat-social` repo. | These give standard templates (OrdLock, OrdP2PKH, BSV-21 transfer), not stateful contracts. Use them for the front end and indexer, not for the pool. |
| sCrypt "Bitcoin smart contract" BTC tooling | BTC only. | Not applicable. |

**Feasibility conclusion:** a stateful AMM contract is feasible on BSV with scrypt-ts 1.4.x. The opcode limits that were removed in the Genesis upgrade allow the big-int maths and the preimage-based introspection (OP_PUSH_TX). The risk is tooling: an unmaintained toolchain. Mitigation: pin it, vendor the compiler binary in CI, and keep the maths spec (`contracts/src/math.ts`) independent of sCrypt.

## 2. Existing BSV swaps and DEXes

- **RelayX** (relayx.com): its exchange/"swap" traded **RUN-protocol** tokens (for example OKBSV, issued 1:1 against OKEx BSV balances; see the CoinGeek source below) through RelayX's own matching service, an off-chain order book with on-chain settlement. It was not an AMM contract. In July 2022 RelayX announced a change of direction ([relayx.medium.com](https://relayx.medium.com)), and the RUN protocol and its indexer (Run Network) were wound down, so RUN-token markets stopped. **[memory]**: today's web search found no primary shutdown notice. The lesson for us: the dependency on one company's indexer and matching service killed it. Hence an open indexer, and contract-held pools that anyone can call.
- **1Sat OrdLock** ([docs](https://docs.1satordinals.com/ordinal-lock.md)) **[verified]**: a listing contract. It has two paths: a *purchase* path, which uses `SIGHASH_ANYONECANPAY|ALL` and fixes the seller's `payOutput` through `hashOutputs`, and a *cancel* path for the seller's key. The docs label it "experimental, not sufficiently tested". It also works for BSV-21 listings (marketplaces list token UTXOs the same way **[memory]**). It is an order-book primitive: each listing is a separate UTXO, so there is no contention, but there is also no pooled liquidity.
- **1Sat Market / Yours / GorillaPool marketplace**: OrdLock-based listing markets for 1Sat NFTs and BSV-20/21 tokens **[memory]**.
- **sCrypt examples**: the sCrypt boilerplate shipped a toy `uniswap`/AMM-style example and "tokenSwap" demos **[memory]**. Nothing production-grade or audited is known to us.
- **No live, contract-custodied, open-source constant-product AMM for BSV-21 is known.** BSVEX would be first, which also means no prior audits to lean on.

## 3. Holding BSV-21 tokens in a contract

**[verified in `scrypt-ord/src/contracts/bsv20V2.ts`]**: `BSV20V2.buildStateOutputFT(amt)` builds the contract's next state output by **prefixing a BSV-21 transfer inscription** (`{"p":"bsv-20","op":"transfer","id":…,"amt":…}`, content type `application/bsv-20`), placing it before the contract's code and state, with **1 satoshi**. `buildTransferScript(addr, id, amt)` does the same for a P2PKH payee. So a contract can hold BSV-21 tokens: the inscription envelope (`OP_FALSE OP_IF … OP_ENDIF`) is a no-op for script execution, and the indexer reads it.

BSV-21 transfer rules **[verified]** ([BSV-21 spec](https://docs.1satordinals.com/fungible-tokens/bsv-21.md)):
- the transfer fields are `p`, `op`, `id` (`<txid>_<vout>`) and `amt` (u64 string);
- tokens out may not exceed tokens in, otherwise the transaction is invalid and the tokens burn;
- tokens left over are burned.

**Consequences for the design:**
1. **A token output is 1 sat** (1Sat-Ordinals convention, and what scrypt-ord emits). The pool's **BSV reserve cannot sit in the same output as its token reserve**, so a pool is **two linked UTXOs**: a state output (holds the sats) and a token vault (1 sat + tokens). The prototype implements this.
2. **Script does not see token balances.** The indexer enforces conservation, not the contract. The contract can force the *output* amounts but cannot see that the trader's token *inputs* really carry `tokensIn`. If they don't, the indexer marks the transaction invalid and **the vault's tokens could burn**. That is the most important risk; see amm-design §9.1.
3. **Genesis** is also a BSV-21 rule. A BSV-21 `deploy+mint` mints the whole supply at once, so LP shares can't be minted later. We deploy the LP token's full supply into an **LP vault** at pool genesis and release from it.

## 4. Indexing fees

The owner's figure is about **1,000 sats per token output**, charged by the GorillaPool BSV-21 indexer. **[memory, not confirmed today]**: the 1Sat docs no longer describe it. As we understand it, the deployer pre-funds a per-token fund address, and the indexer draws from it for each transfer it indexes. If the fund is empty, the token stops being indexed by that indexer. It is not a per-transaction fee paid by the trader in the transaction itself. Phase B must confirm the exact amount and mechanism with GorillaPool (Discord is the working contact).

Impact (see amm-design §4). A swap creates **2 token outputs**, the vault and the trader's token output or token change, so about 2,000 sats of index fee per swap. An add/remove creates 3–4. Our pool shapes are designed to minimise token outputs: the protocol fee is always taken in sats, and the LP vault is not touched by swaps.

## 5. UTXO contention

A stateful pool is one UTXO chain, so only one swap per pool can spend it at a time. Known patterns:

| Pattern | How | Cost |
|---|---|---|
| **Chained unconfirmed spends** | BSV allows long unconfirmed chains, so a swap can spend the previous swap's pool output at once; the throughput limit is round-trip latency, not blocks. | Losers of a race re-quote and retry. |
| **Sequencer / batcher** | An open, permissionless batcher collects signed intents (`ANYONECANPAY` trader inputs plus min-out) and chains them into consecutive pool spends. Anyone can run one, so it is not custody. | Adds an off-chain role, and gives the batcher ordering power (MEV). |
| **Pool shards** | N independent pools per token; the router splits orders. | Thinner liquidity and worse prices per shard; arbitrage keeps prices aligned. |
| **Batch auction per window** | One transaction per window clears all intents at one price (closest to TERRORNODE §8 "one clearing price per window"). | Contract becomes complex. Phase C. |

## Sources
- npm registry metadata: `scrypt-ts`, `scrypt-ord`, `scrypt-cli`, `@scrypt-inc/scrypt-ts-btc`, `@bsv/sdk`, queried 27 Oct 2026.
- `scrypt-ord` 1.0.17 source, `src/contracts/bsv20V2.ts`.
- 1Sat docs: [BSV-21](https://docs.1satordinals.com/fungible-tokens/bsv-21.md), [Ordinal Lock](https://docs.1satordinals.com/ordinal-lock.md), [FAQ](https://docs.1satordinals.com/faq.md), [sitemap](https://docs.1satordinals.com/sitemap.md).
- RelayX: [relayx.medium.com](https://relayx.medium.com); [CoinGeek on OKBSV](https://coingeek.com/okbsv-pioneers-token-exchange-on-chain).
- Internal: `VexVoid/BSVEX-PLAN.md` §9, `VexVoid/TERRORNODE-TUG-OF-WAR-SPEC.md` §7–9.
