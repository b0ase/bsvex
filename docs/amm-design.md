# BSVEX AMM design (Phase A draft 27 Oct, Phase B update 28 Oct 2026)

Status: **design + local prototype only.** Nothing deployed. The maths in `contracts/src/math.ts` is the spec. The mock chain in `contracts/src/mockchain.ts` shows the transaction shapes and enforcement. `contracts/src/sCrypt/AmmPool.ts` is the uncompiled contract draft.

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
