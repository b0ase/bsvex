# BSVEX AMM design (Phase A draft 27 Oct, Phase B + C updates 28 Oct 2026)

Status: **design + local prototype only.** Nothing deployed, nothing broadcast. The maths in `contracts/src/math.ts` is the spec. The mock chain in `contracts/src/mockchain.ts` shows the transaction shapes and enforcement. The sCrypt contracts are in `contracts/scrypt/src/contracts/` and, since Phase C, **compile and run on the local script interpreter** (see §12). Where §2–§11 and §12 disagree, §12 is current.

## 1. Goals
- One constant-product pool per BSV-21 token, BSV on the other side.
- Contract custody only. No key held by bCorp, or anyone else, can move pool funds.
- LP shares are a BSV-21 token per pool.
- The LP fee stays in the pool. The protocol fee goes to a sats output to an address fixed at pool deploy.
- Every rule is in the contract or the BSV-21 indexer rules. The indexer and front end are open source and replaceable.

## 2. On-chain layout

A pool is three UTXOs:

| UTXO | Value | Script | Spent by |
|---|---|---|---|
| **Pool state** (`AmmPool`) | the BSV reserve (`sats`) | sCrypt stateful contract | every call |
| **Token vault** | 1 sat + BSV-21 `amt = tokens` | transfer inscription + `TokenVault` | every call |
| **LP vault** | 1 sat + BSV-21 `amt = lpUnissued` (LP token) | transfer inscription + `LpVault` | add / remove only |

Why split them: a BSV-21 token output is 1 sat (see research §3), so sats and tokens cannot share an output.

**Binding:**
- The token vault unlocks only when input 0 is the pool output created in the **same transaction** as the vault (`prevouts[0] == (myTxid, 0)`, with the vault at index 1). Pool and vault are always recreated together, so they stay siblings.
- The LP vault is not recreated on swaps, so it uses a **parent-tx proof** instead. The caller passes input 0's full parent transaction. The vault checks `hash256(parent) == prevouts[0].txid`, then that the parent's output 0 carries the pool code hash and this `poolId`.
- The pool itself checks that inputs 1 and 2 are its vaults (by outpoint), and that `sats`/`tokens`/`lpUnissued` in state equal the UTXO values.

### State
`tokenId, lpTokenId, protocolPkh, lpFeeBps, protocolFeeBps, vaultCode, lpVaultCode` (immutable); `sats, tokens, lpSupply, lpUnissued` (mutable).

Defaults: `lpFeeBps = 25` (0.25%) and `protocolFeeBps = 5` (0.05%). These are fixed per pool at deploy and capped by the contract at < 10% total. `protocolPkh` is configured at deploy from `BSVEX_PROTOCOL_FEE_ADDRESS` (env name only). Per the licence it can be a different address for our own tokens. It cannot be changed afterwards. A new fee address means a new pool, and LPs migrate by choice.

### Transaction shapes (outputs required by the contract come first; trader change follows)

| Method | Inputs | Outputs |
|---|---|---|
| `swapSatsForTokens(satsIn, minOut, trader)` | pool, vault, trader sats | pool′, vault′, trader tokens (1 sat), protocol fee (sats), change |
| `swapTokensForSats(tokensIn, minOut, trader)` | pool, vault, trader tokens, [sats for fee] | pool′, vault′, trader sats, protocol fee (sats), token change, change |
| `addLiquidity(satsIn, maxTokensIn, minLpOut, trader)` | pool, vault, LP vault, trader sats + tokens | pool′, vault′, LP vault′, trader LP, token change, change |
| `removeLiquidity(lpIn, minSatsOut, minTokensOut, trader)` | pool, vault, LP vault, trader LP | pool′, vault′, LP vault′, trader sats, trader tokens, LP change, change |

The contract rebuilds its required outputs, appends the caller-supplied change bytes, and asserts `hash256(outputs) == ctx.hashOutputs`. The mock chain's `validatePoolSpend` does the same comparison.

## 3. Fee maths (integer, round against the trader)

Let `B = 10000`, `f = lpFeeBps`, `p = protocolFeeBps`.

- **amountOut** (Uniswap v2): `out = floor(in·(B−f)·Rout / (Rin·B + in·(B−f)))`.
- **BSV→token:** `pFee = max(1, ceil(satsIn·p/B))`, `net = satsIn − pFee`, `out = amountOut(net, sats, tokens)`. The new state is `sats + net, tokens − out`.
- **token→BSV:** `gross = amountOut(tokensIn, tokens, sats)`, `pFee = max(1, ceil(gross·p/B))`, `trader = gross − pFee`. The new state is `sats − gross, tokens + tokensIn`.
- The protocol fee is **always in sats**, so it never needs an extra token output or index fee.
- The LP fee is simply the part of the input that does not buy output, so it stays in the reserves and raises `k`.
- The contract also asserts `k' ≥ k` explicitly (belt and braces).

**Liquidity:**
- **First deposit:** `L = isqrt(sats·tokens)`. `MIN_LIQUIDITY = 1000` shares are locked forever, and the depositor gets `L − 1000`.
- **Add:** `tokensIn = ceil(satsIn·tokens/sats)`, `lpOut = floor(satsIn·L/sats)`.
- **Remove:** `satsOut = floor(lp·sats/L)`, `tokensOut = floor(lp·tokens/L)`.

All rounding favours the pool, so per-share value `k/L²` never falls. The fuzz test checks this exactly.

## 4. Cost per swap

| Item | BSV→token | token→BSV |
|---|---|---|
| LP fee | 0.25% of input | 0.25% of input |
| Protocol fee | 0.05% (min 1 sat) | 0.05% (min 1 sat) |
| Index fee: token outputs created | vault′ + trader tokens = **2 × ~1,000 sats** | vault′ (+ token change) = **1–2 × ~1,000 sats** |
| Miner fee | about 6–12 kB transaction (sCrypt preimage + contract), so **~600–1,200 sats at 100 sat/kB**, less at 50 sat/kB | same |
| Dust | 1 sat per token output | same |

**Total fixed cost is roughly 2,500–3,500 sats per swap**, plus 0.30% of value. At ~$50/BSV that is about $0.0015. The fixed part dominates below about 1M sats (~$0.50) per trade, so the UI must show it. The index fee comes from the token's fund address per research §4, so at pool creation the pool deployer (for curve graduations, the launch) must fund it. Phase B must confirm the amount and payer with GorillaPool before quoting it publicly.

## 5. Slippage, min-out, deadlines
- Every method takes `minOut`/`minLpOut`/`maxTokensIn`/`minSatsOut`/`minTokensOut`. If the pool moved between quote and broadcast, the contract assertion fails and the transaction is not valid. Nothing moves; the tests check this both ways.
- **Deadline:** use nLockTime plus a contract check that `ctx.locktime ≤ deadline` (an optional arg), so a stale signed intent cannot be replayed hours later.
- Front-end default slippage is 0.5%, capped at 5% without an explicit override.

## 6. LP share token and graduation
- At pool genesis the deployer creates the LP token as a BSV-21 `deploy+mint` with `amt = 2^63−1` into the **LP vault**. Shares are "issued" by moving them out of the vault and "burned" by moving them back, so `lpSupply + lpUnissued − MIN_LIQUIDITY` stays constant.
- The LP token's symbol is `LP-<TOKEN>`, its decimals are 0, and its icon is the token's icon.
- **Bonding-curve graduation:**
  1. When a launch curve reaches its graduation target (for example $TERRORNODE at 10M tokens sold), the curve contract's graduation path is the only way to spend the curve's reserve.
  2. That path must create a pool genesis with `sats = curve reserve − graduation fee` and `tokens = the reserved pool allocation`, at the curve's final price: `tokens/sats = last curve price`, so there is no price gap to arbitrage.
  3. The initial LP shares (`L − 1000`) are sent to a **burn/lock output** (a provably unspendable script, or a time-lock), so launch liquidity can't be rugged.
  4. Graduation is a contract call anyone can trigger once the condition is met.

## 7. Indexer and front end
- **Indexer** (open source, in this repo, phase B):
  1. Subscribe to JungleBus or 1sat-stack for transactions spending a known pool outpoint, plus new genesis transactions matching the pool code hash.
  2. Decode the state from output 0. Verify `sats == output value`, and that `vault amt == state.tokens` according to the BSV-21 indexer.
  3. Serve `GET /pools`, `GET /pools/:id` (current outpoints and state) and `GET /pools/:id/history`.
  4. Anyone can recompute it from the chain, and the front end can cross-check two indexers.
- **Front end (bWalletX via BRC-100):**
  1. Fetch the pool tip. Quote with `math.ts`. The user picks the amount and slippage.
  2. Build the contract unlocking (sCrypt `methodCall` with `partiallySigned`/`autoPayFee: false`) for inputs 0–2.
  3. Call `wallet.createAction({ inputBEEF, inputs: [pool, vault (+lpvault)] with unlockingScriptLength, outputs: [required outputs], options: { signAndProcess: false } })`. The wallet adds the trader's own sats/tokens inputs and change.
  4. Fill the contract unlocking scripts against the final transaction (the preimage depends on the full transaction), then `signAction`.
  5. Broadcast via ARC. If the pool tip has moved, re-quote and repeat.

  It is BRC-100 only, so it works with bWalletX, Yours, HandCash and Metanet. Wallet tokens need the wallet's BSV-21 basket (bWalletX has one).

## 8. Contention
A pool is one UTXO chain. Plan:
1. **v1: optimistic chaining.** Clients spend the latest unconfirmed pool tip (BSV allows long unconfirmed chains). A loser gets "input spent", re-quotes from the new tip and re-signs. That is one extra round trip, and fine at low volume (a few swaps per second per pool, limited by about 1 s propagation).
2. **v1.5: open batcher.** Traders sign intents with `SIGHASH_ANYONECANPAY|SINGLE`-style trader inputs plus `minOut` and a deadline. Any batcher (bsvex.com runs one, and anyone else can) chains them as consecutive pool spends in arrival order. The batcher never holds funds: a trader's input can only be spent into a transaction that pays them at least `minOut`. It does have ordering power (see §9.2).
3. **High-volume tokens:** shard into N pools, and the router splits orders.
4. **Later:** a per-window batch auction contract, which matches TERRORNODE §8's "one clearing price per window".

## 9. Attacks and risks

1. **Token-inscription mismatch (critical).** Script cannot see BSV-21 balances. In `swapTokensForSats` / `addLiquidity`, a trader can supply token inputs worth less than `tokensIn` (or another token, or an invalid transfer). The contract still pays out sats, and the indexer marks the transaction's token transfers invalid, so **the vault's tokens burn and the pool is drained**.
   Mitigations:
   - (a) The contract requires each trader token input's **parent transaction**, and parses its inscription to verify `id` and `amt` sum ≥ `tokensIn`. This stops lies about amounts and ids.
   - (b) It still can't prove the parent was itself *valid* under the indexer (ancestry). So the front end and batcher only accept token inputs the indexer reports as valid and confirmed, and cross-check two indexers.
   - (c) Residual risk is indexer consensus, which is inherent to BSV-21. This must be stated publicly.
   - Phase B must test (a) on testnet with deliberately invalid inputs, and confirm with GorillaPool how an invalid transfer affects *other* outputs in the same transaction.
   - Long term: ask GorillaPool for an "invalid inputs → that transaction's outputs revert to inputs" rule, or use a token standard whose validity script can check.
2. **Sandwiching / MEV.** On BSV there is no public mempool auction, but whoever sees intents first (a batcher, ARC operators) can front-run. Mitigations: tight `minOut` defaults, deadlines, batcher ordering by arrival with signed receipts, multiple competing batchers, and later the batch auction.
3. **Griefing the pool UTXO.** Spamming tiny swaps keeps the tip moving so others' transactions conflict. The cost to the attacker is about 2,500+ sats per swap plus fees, which is self-limiting. A batcher absorbs it. There is no way to *lock* a contract UTXO without valid calls. A **stuck tip** (pool spend broadcast but never mined, for example a fee too low) blocks the chain behind it. Mitigations: the contract requires a minimum fee rate (outputs total ≤ inputs − minFee), and clients broadcast through two ARCs.
4. **Rounding.** All divisions round toward the pool; dust trades revert ("zero output"); `MIN_LIQUIDITY` blocks first-depositor share inflation. Fuzz-tested over 2,000 random ops: `k` never decreases on swaps, and `k/L²` never decreases on any op.
5. **Donation / reserve desync.** Someone sends tokens or sats to a vault-like address. That doesn't matter, because the pool reads state, not balances, and stray outputs aren't vaults.
6. **Fake pools.** Anyone can deploy a contract that looks like ours. The indexer lists only pools whose code hash matches the audited release and whose genesis is well-formed, and the front end shows the code hash.
7. **Toolchain.** scrypt-ts is unmaintained (research §1). Pin it, vendor the compiler, and get an independent audit before any mainnet pool above a small cap.
8. **Price oracle use.** Pool spot prices are manipulable within one transaction. Don't use them as an oracle (for game settlement, for example) without a TWAP across blocks.

## 10. Compliance automation (engineering notes, not legal advice)

The contract is permissionless, so screening happens where bsvex.com software acts: the front end, the batcher, and any fiat off-ramp. It does not happen in the contract.

- **Sanctions screening (every session, before withdrawals/off-ramps):**
  1. Screen the user's identity key, paymail and any linked addresses against **OpenSanctions** (self-hosted bulk data, refreshed daily, `OPENSANCTIONS_DATA_URL`), including its crypto-address dataset.
  2. If there is a hit, the bsvex.com front end and batcher refuse service and the decision is logged.
  3. Anyone can still call the contract directly. That is inherent to permissionless contracts, and the docs say so.
- **Threshold KYC through Veriff:**
  1. Track per-identity rolling 30-day volume through *our* front end, batcher and off-ramp. The identity is the $401 identity key, or else the wallet identity key.
  2. Above `AML_THRESHOLD_USD` (env; the value is set by the owner after advice), require Veriff KYC plus Veriff sanctions/PEP screening (`VERIFF_API_KEY`, `VERIFF_SHARED_SECRET`, env names only) before further service.
  3. Reuse the existing Veriff and $401 identity-strength work.
- **Audit trail:**
  - every screening decision is stored as an append-only log row (`identity_key`, check, list version, result, txids), hashed daily;
  - the daily hash is anchored on chain in an OP_RETURN, so the log can't be silently edited;
  - on-chain trades are already their own audit trail.
- **Regulatory open question:** BSVEX-PLAN / TERRORNODE §9 flag that running a P2P matching service for a fee may be "cryptoasset exchange provider" activity in the UK. A batcher plus protocol fee may fall in scope. That is the solicitor's question, not this document's. The engineering keeps the protocol fee address, batcher and front end separable, so whatever is decided can be applied without changing the contract.

## 11. Phase B (28 Oct): what changed

Still local only: nothing compiled for mainnet, nothing broadcast, no keys.

1. **Token-input proof (§9.1 part a), modelled and tested.** `validatePoolSpend` now requires the trader's token inputs (from index 2 on swaps, 3 on adds) to carry transfer inscriptions with the pool's token id summing to at least `tokensIn`. In sCrypt this is `provenTokenIn` (sketch in `AmmPool.ts`): the caller passes each token input's parent tx, the contract checks `hash256(parent)` against the prevout txid and parses the inscription. Tests: wrong id and under-claimed amounts are rejected by the contract.
2. **Mainnet indexer semantics in the mock.** `new MockChain({ indexer: 'burn' })` mines a tx that breaks BSV-21 rules and marks its token outputs burned, as GorillaPool does, instead of rejecting it. This let us **demonstrate the residual risk** (§9.1 part b): an inscription that looks right but was never validly funded passes the contract, the trader gets sats, the vault burns, and later buyers receive invalid tokens. Mitigations now in code: `assertTokenInputsValid` (clients and batchers refuse indexer-invalid inputs) and `poolHealth` (front ends halt a pool whose vault is burned). This is the main reason the AMM must not launch on mainnet without a cap and an audit.
3. **Contention, tested.** A tx built on a stale tip is rejected with nothing moved, and the loser re-quotes and fills. `src/batcher.ts` is a reference open batcher: arrival order, deadlines, min-out. One bad intent never blocks others; no custody.
4. **Protocol fee recipient.** A script cannot pay a paymail. `bcorp@` must be resolved **once at pool deploy** to a fixed P2PKH (`protocolPkh`), which is then immutable for that pool. Paymail rotation does not follow; a new address means new pools. The address is read from env (`BSVEX_PROTOCOL_FEE_ADDRESS`) at deploy time and never committed.

### Open questions for the owner
_Answered by the owner on 28 Oct; see §12.1. The fee address is now a public constant in `config.ts`, which the owner allowed._

1. **Residual BSV-21 validity risk.** Accept "front end + batcher check two indexers, pool cap until audited", or wait for a GorillaPool rule / a token standard with script-checkable validity before mainnet?
2. **Fee levels:** keep 0.25% LP + 0.05% protocol (min 1 sat)? Higher protocol fee for non-b0ase tokens per the licence?
3. **bcorp@ fee address:** which concrete address should be the deploy-time `protocolPkh` (one for all pools, or one per token family)?
4. **Index fee payer:** at ~1,000 sats per token output (unconfirmed with GorillaPool), who funds each token's index fund for pool traffic: the token launcher at graduation (current design) or bCorp from protocol fees?
5. **Graduation liquidity:** burn the launch LP shares forever (current design) or time-lock them (e.g. 1 year) to the launcher?
6. **Batcher:** should bsvex.com run the reference batcher from day one, or start with v1 optimistic chaining only?
7. **Audit budget and pool cap** before the first mainnet pool (e.g. max 1 BSV per pool until audited).

### Phase C (next)
- Compile `AmmPool`/`TokenVault`/`LpVault` with pinned scrypt-ts 1.4.5 and run them on the scrypt-ts local provider (no network).
- Implement the inscription reader for `provenTokenIn`, and measure real tx sizes and miner fees.
- Ask GorillaPool (Discord) how an invalid transfer affects other outputs in the same tx, and the index-fee mechanics.
- Indexer skeleton (JungleBus subscription → pool state API), read-only.

## 12. Phase C (28 Oct): compiled, run locally, measured

Still local only: no network calls in tests, nothing broadcast, no real keys (tests make random throwaway keys in memory), no money.

### 12.1 Owner decisions now encoded
| Decision (28 Oct) | Where |
|---|---|
| Protocol fee address `1MMxztpc9fj5o5Mtp8CFqPwXJfeycCTw3L` (bcorp@bwalletx.com), fixed per pool at deploy | `contracts/src/config.ts`; contract prop `protocolPkh` (constructor parameter, not in contract source) |
| LP 0.25% all pools; protocol 0.05% ours / 0.10% third-party | `config.ts` `LP_FEE_BPS`, `PROTOCOL_FEE_BPS`; contract props `lpFeeBps`, `protocolFeeBps` (per pool) |
| 1 BSV cap per pool until audited | **in the contract**: immutable `maxSats`, checked on every call that adds sats (`'pool cap'`). Also in `quote.ts`. An audited release deploys new pools with a higher cap; existing pools keep theirs. |
| Graduation LP burned forever | **in the contract**: immutable `lockedLp`. Normal pools lock 1,000 shares; a graduated pool sets `lockedLp = L`, so the launch shares can never leave. Fees still accrue to them, exactly like a burn. This needs no burn script and no indexer cooperation (see Q4 in §12.6 for the alternative). |
| bsvex.com runs the reference batcher, never holds funds | unchanged (`src/batcher.ts`); the contract does not care who builds the tx. |
| User pays the index fee, shown in the quote | `src/quote.ts` `fixedCosts()`: index fee per token output + measured miner fee + 1-sat dust, added to the buyer's cost / taken from the seller's proceeds. |

### 12.2 Contract changes from Phase B
1. **Toolchain pinned:** `scrypt-ts 1.4.5`, `scrypt-cli 0.2.3`, `scryptlib 2.2.6`, `typescript 5.3.3` + `ts-patch 3.0.1` (the transpiler needs TS 5.3), native `scryptc 1.20.0` with its sha256 checked by `scripts/get-compiler.cjs`. The macOS binary is x86_64 and runs under Rosetta on Apple silicon. Separate package `contracts/scrypt/` so the main package keeps TS 5.9.
2. **No scrypt-ord dependency.** scrypt-ord 1.0.17 ships no type declarations and its contracts cannot be imported into another contract cleanly, so `bsv21.ts` has our own inscription builder and reader.
3. **LP vault is recreated on every call.** Phase B bound the LP vault to the pool by a parent-tx check of the pool's code. That is forgeable: anyone can deploy the genuine pool code with forged initial state (claiming our `lpTokenId` and pointing at our LP vault), spend the real LP vault through it, and walk off with LP shares that redeem against the real pool. No inductive "this pool descends from genesis" proof fits in script cheaply. So both vaults now use the same sibling binding (`Vault`: input 0 must be `(myTxid, 0)`), which is sound. Cost: one extra token output (index fee) per swap.
4. **removeLiquidity now proves the LP shares going in.** Phase B never checked them: anyone could claim `lpIn` without supplying LP tokens and drain the pool. Fixed and tested.
5. **Token-input reader finished.** The caller passes each trader token input's parent tx and the amount it carries. The contract checks `hash256(parent) == prevout txid`, walks the canonical tx serialisation to output `vout` (≤ 6 inputs, ≤ 6 outputs, 1/3/5-byte varints; a fake inscription hidden in an unlocking script cannot be pointed at), rebuilds the expected inscription for the stated amount and compares bytes. It accepts both JSON key orders wallets use and the envelope before or after a P2PKH. Rebuild-and-compare is much cheaper in script than parsing digits.
6. **One entry point for token-in calls.** sCrypt inlines every function, so the proof code was in the script three times. `tokenCall(op, a, b, c, …)` (op 1 sell, 2 add, 3 remove) has it once; `swapSatsForTokens` stays separate. `MAX_TOKEN_INPUTS = 2`.

### 12.3 What ran (25 sCrypt tests + 24 TS tests, all passing)
`cd contracts/scrypt && pnpm install && pnpm test` compiles and runs mocha; every contract input of every built tx goes through `tx.verifyScript()` (the real script interpreter). Covered: buy, sell, add, remove; two-swap chaining; slippage; pool cap on buy and add; 5 vs 10 bps protocol fee; outputs altered after signing (rejected by the interpreter, not just the JS run); token proof accepts canonical / amt-first / P2PKH-first and rejects short amount, wrong id and an edited parent; remove without real LP shares rejected; graduated pool's locked shares cannot be removed while later LPs can exit; a vault cannot be spent without its sibling pool. The read-only indexer follows genesis → swap → swap, cross-checks state against both vault inscriptions, and flags a vault the BSV-21 indexer reports invalid.

### 12.4 Measured sizes and fees (`contracts/scrypt/measurements.json`)
AmmPool locking script: **22,791 bytes**. Vault: 704 bytes.

| Tx | Bytes | Miner fee @1 / 50 / 100 sat/kB | Token outputs (index fee @ ~1,000) |
|---|---|---|---|
| swapSatsForTokens | 50,581 | 51 / 2,530 / 5,059 | 3 → ~3,000 |
| swapTokensForSats | 51,073 | 52 / 2,554 / 5,108 | 2 (+1 if token change) → ~2,000–3,000 |
| addLiquidity | 51,194 | 52 / 2,560 / 5,120 | 3 (+1) |
| removeLiquidity | 51,229 | 52 / 2,562 / 5,123 | 3 (+1) |
| pool genesis (graduation adds the curve contract's own spend) | 24,702 | 25 / 1,236 / 2,471 | 2 |

Why ~50 kB: the pool's 22.8 kB code is in the new pool output **and** again in the unlocking script's sighash preimage (scriptCode). Trader P2PKH unlocks are 107-byte placeholders; real wallets add a few hundred bytes at most.

**Fixed cost per swap is therefore ~3,000 sats index fee + 50–5,000 sats miner fee depending on the fee rate miners actually take**, plus 0.30%/0.35% of value. §4's estimate (6–12 kB) was too low by ~5x. At 100 sat/kB a swap costs ~8,000 sats fixed (~$0.004 at $50/BSV); the index fee dominates if the effective rate is near 1 sat/kB.

Where the bytes are (by recompiling variants): `int2Ascii` (decimal amounts for inscriptions, ~10 inlined copies of a 20-step loop) ≈ 5.3 kB; parent-tx walk ≈ 3 kB per allowed token input. Options, not done: (a) `MAX_TOKEN_INPUTS = 1` (−3.1 kB; traders consolidate first); (b) parent bounds 3×3 (−2 kB); (c) caller-supplied decimal strings checked with one shared loop; (d) move the token proof into a separate helper input so buys don't carry it. Together these could plausibly halve the pool script.

### 12.5 New risks found in Phase C
1. **Phase B LP-vault binding was forgeable** (fixed, §12.2 item 3).
2. **Phase B removeLiquidity did not prove LP shares in** (fixed, item 4). Both would have been critical; they show why the audit matters before the cap is raised.
3. **Tx size ~5x the estimate.** Fine under the 1 BSV cap but it shapes pricing; small trades pay mostly fixed cost.
4. **Index-fee multiplier:** every pool call now creates 2 vault outputs + payouts, so 2–4 index fees per call. If GorillaPool charges per output as assumed, that is the biggest fixed cost at low miner fee rates.
5. **Token inputs must be canonical.** Inscriptions with other JSON layouts (whitespace, extra keys, leading zeros) are refused; the front end must offer a "tidy up" self-transfer first, which costs an index fee.
6. **Parent tx size caps:** parents with more than 6 inputs or outputs cannot be used as token inputs.
7. **Toolchain:** the compiler binary is x86_64-only on macOS and scrypt-ts needs TypeScript 5.3. Both are pinned and hash-checked, but the stack is unmaintained (research §1). Unchanged recommendation: audit before the cap goes up.
8. **Residual BSV-21 validity risk (§9.1 b)** is unchanged and accepted under the cap (owner, 28 Oct). The indexer skeleton flags burned vaults so front ends can halt a pool.

### 12.6 Indexer skeleton
`contracts/scrypt/src/indexer/poolIndexer.ts`: `PoolIndexer.follow(genesisTxid)` walks output-0 spends, decodes state with `AmmPool.fromTx` (fails for anything that is not this release's template), checks `sats` = output value, both vault inscriptions = state, and the cap; optionally asks a BSV-21 indexer whether each vault output is a valid transfer. `HttpReader` is GET-only against WhatsOnChain (raw tx) and GorillaPool (`/api/txos/{outpoint}` for spends, `/api/bsv20/outpoint/{outpoint}` for validity). **Those paths and the status codes are unconfirmed**; tests use `LocalReader` only. Not yet: persistence, a JungleBus subscription loop, the HTTP API from §7.

### 12.7 Draft questions for GorillaPool (DRAFT, not sent; owner to review)
1. **Invalid transfer in a multi-output tx:** if one BSV-21 transfer in a tx is invalid (inputs short, or invalid ancestry), are *all* BSV-21 outputs of that tx marked invalid/burned, or only that token id's outputs? Do other token ids in the same tx survive?
2. **Index fee mechanics:** is the fee charged per BSV-21 output, per tx, or per token id per tx? Exact amount today? Is it paid only from the token's fund address, or can a tx pay it inline (an output to the fund address) so the user pays at trade time, as our owner wants? How is the fund address derived from a token id?
3. **Unfunded token:** what happens to transfers of a token whose fund address is empty: queued as pending until funded, or dropped? Is there a maximum wait?
4. **Burn outputs:** is a transfer to a provably unspendable script (envelope + `OP_RETURN`) indexed as a valid burn? (We avoided needing this by locking graduation LP inside the contract.)
5. **Envelope position and JSON form:** does the indexer accept the envelope after a P2PKH, and JSON with keys in any order / extra whitespace? Is there a canonical form you recommend?
6. **Contract-locked outputs:** any problem indexing BSV-21 transfers whose lock after the envelope is a ~1 kB sCrypt script, or a 1-sat output spent by an sCrypt unlock of ~1 kB?
7. **APIs:** confirm read-only endpoints for (a) spend of an outpoint, (b) BSV-21 validity/status of an outpoint and the status values, (c) a JungleBus subscription filter for txs spending a given outpoint or matching a script prefix. Rate limits for a public read-only indexer?
8. **Long unconfirmed chains:** pools chain spends of the same UTXO; does the indexer validate unconfirmed transfers in order, and how deep a chain before it waits for a block?

### 12.8 Open questions for the owner (Phase C)
1. Accept the LP-vault change (one more index fee per swap) for soundness? The alternative is LP shares that are not tokens.
2. Should the next phase spend effort shrinking the script (§12.4 options), or wait for GorillaPool's answer on the index fee, which may dominate anyway?
3. `MAX_TOKEN_INPUTS = 1` (cheaper, traders consolidate first) or keep 2?
4. When the GorillaPool questions are ready to send, who posts them in their Discord?
5. Testnet next (needs a funded testnet key, which is a key decision for you), or more local work first?

### Phase D (proposed)
- Shrink the script (§12.4), re-measure.
- Testnet run with a throwaway testnet key, if the owner approves.
- Bonding-curve contract with the graduation path that creates the pool genesis with `lockedLp = L`.
- Indexer: JungleBus subscription + persistence + the §7 HTTP API; confirm endpoints.
- External audit before any cap above 1 BSV.

## 13. Phase D (28 Oct): script shrunk, one token input per trade

Owner decisions (28 Oct): (1) keep the extra index fee per swap: the LP vault is still recreated with the pool on every call (the forged-vault fix stays); (2) shrink the pool script now; (3) **one token input per trade**, traders merge tokens first. Still local only: no network in tests, nothing broadcast, no real keys or funds. Same pinned toolchain (scrypt-ts 1.4.5 / scryptc 1.20.0, sha256-checked).

### 13.1 What changed
1. **One public method.** `swapSatsForTokens` and `tokenCall` are merged into `trade(op, a, b, c, trader, parent, parentAmt, change)` (op 0 buy, 1 sell, 2 add, 3 remove). sCrypt inlines everything, so the vault check, state output, both vault outputs and the payout builder were in the script twice; now once. Each op still produces a fixed output layout: `[pool', token vault', LP vault', token payout (ops 0/2/3), sats to trader (ops 1/3), protocol fee (ops 0/1), change...]`. **Remove-liquidity output order changed**: the token payout is now output 3 and the sats payout follows it (it was sats then tokens).
2. **One token input (owner decision 3).** No arrays: `parent` is input 3's parent tx, `parentAmt` its amount. Only input 3 is credited, so a trade split across two token UTXOs fails `token inputs short`; claiming the combined amount against input 3 fails the proof. The front end/batcher must merge token UTXOs with a self-send first (one extra index fee, once).
3. **Cheaper decimal encoder.** `int2Ascii` now refuses 0 (every amount the contract writes or checks is > 0), which drops the `done` flag: each of the 20 unrolled steps is about half the size. With the merge it is in the script 4 times instead of ~10.
4. **Tighter parent walk.** Parent tx: at most 5 inputs (was 6) and the token output at vout 0-3 (was "≤ 6 outputs"). The output count is no longer bounded and `vout < nOut` is no longer checked: vout comes from a real outpoint of the spending tx, so consensus guarantees it. One varint routine (1- or 3-byte; fields ≥ 64 kB refused) replaces the value/size pair. The 5 x vout-3 bounds were chosen so **a buy payout (output 3 of a pool tx with ≤ 2 funding inputs) can be sold straight back** without a self-send; tested.
5. Unchanged: sibling-bound vaults, LP vault recreated every call, removeLiquidity proves LP shares, pool cap and `lockedLp` in the contract, k check, slippage bounds, protocol fee floor of 1 sat, outputs bound by `hashOutputs`.

### 13.2 Before / after (`contracts/scrypt/measurements.json`; trader unlocks are 107-byte placeholders)
Pool locking script **22,791 → 10,706 bytes (−53%)**; compiled code alone ~9.8 kB (the rest is the immutable props, mostly the 704-byte vault code). Vault 704 bytes (unchanged).

| Tx | Bytes C → D | Miner fee @1 / 50 / 100 sat/kB, C → D | Index fee (@1,000/token output) | Fixed cost per call @1 / 50 / 100 sat/kB (miner + index + 1-sat dust), C → D |
|---|---|---|---|---|
| buy (op 0) | 50,581 → **26,414** (−48%) | 51 / 2,530 / 5,059 → **27 / 1,321 / 2,642** | 3 outputs → 3,000 | 3,054 / 5,533 / 8,062 → **3,030 / 4,324 / 5,645** |
| sell (op 1) | 51,073 → **26,899** (−47%) | 52 / 2,554 / 5,108 → **27 / 1,345 / 2,690** | 2 (+1 if token change) → 2,000-3,000 | 2,054 / 4,556 / 7,110 → **2,029 / 3,347 / 4,692** (no token change) |
| add (op 2) | 51,194 → **27,020** (−47%) | 52 / 2,560 / 5,120 → **28 / 1,351 / 2,702** | 3 (+1) → 3,000 | 3,055 / 5,563 / 8,123 → **3,031 / 4,354 / 5,705** |
| remove (op 3) | 51,229 → **27,055** (−47%) | 52 / 2,562 / 5,123 → **28 / 1,353 / 2,706** | 3 (+1) → 3,000 | 3,055 / 5,565 / 8,126 → **3,031 / 4,356 / 5,709** |
| pool genesis (outputs only) | 24,702 → **12,617** | 25 / 1,236 / 2,471 → **13 / 631 / 1,262** | 2 → 2,000 | |

Fixed cost per swap at 100 sat/kB drops from ~8,060 to ~5,650 sats; at 1 sat/kB it is ~3,030 sats and the index fee is now ~99% of it. The remaining ~26 kB is: the pool code twice (new output + scriptCode in the sighash preimage, ~10.7 kB each), the two vault spends (~1.2 kB each, mostly their own preimage) and the two vault outputs (~0.85 kB each).

Where the 9.8 kB of pool code now goes (by recompiling variants): token proof ≈ 1.6 kB (input walk ≈ 290 bytes per allowed parent input), decimal encoder ≈ 0.45 kB per copy x 4, preimage/OP_PUSH_TX + state ≈ 1 kB, the rest is the four ops' maths and output building.

### 13.3 Given up / trade-offs
- **Multi-input trades.** One token UTXO per trade; a trader holding the amount across several UTXOs must merge first (one self-send, one index fee). A trade can still return token change in `change`.
- **Parent bounds.** A token UTXO whose parent has more than 5 inputs, or sits at vout 4 or higher, cannot be traded directly; a self-send to a canonical output fixes it. Parent fields (unlocking scripts) of 64 kB or more are refused (Phase C allowed 5-byte varints).
- **Zero amounts.** The contract refuses to write or prove a 0 amount. No valid op needed one (a remove that would pay 0 tokens already failed `slippage`).
- **API change.** Callers use `trade(...)`; the remove-liquidity payout order changed (§13.1 item 1). The TS mock chain (`contracts/src/mockchain.ts`) is still the Phase B model (multi-input, old layout) and is not the spec for these details; the sCrypt tests are.
- Not done: moving the token proof into a separate helper input (§12.4 option d) so buys do not carry it (~1.6 kB of code, ~3.2 kB per tx). It needs a second contract and another binding, i.e. more audit surface; left for later if the miner fee matters more than the index fee.

### 13.4 Tests (30 sCrypt + 24 TS, all passing)
New: the compiled ABI has a single public `trade` with one `bytes` parent and one `int` amount (no arrays); a trade split across two token inputs is rejected (honest claim → `token inputs short`, combined claim → proof fails) while the same amount merged into one input is accepted; a token input that is not input 3 is rejected; a buy payout is sold straight back from the pool tx; parents with 6 inputs or vout 4 are rejected while 5 inputs / vout 3 pass; `int2Ascii` refuses 0 and > 20 digits and encodes u64 max. All Phase C tests still pass unchanged apart from the call syntax and the remove payout order.
