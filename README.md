# BSVEX

**Experimental. Not live. Do not send funds.**

BSVEX (bsvex.com) is building an open-source, on-chain automated market maker for BSV-21 tokens on Bitcoin SV:

- one constant-product (x·y=k) pool per token, held by a BSV smart contract, so nobody holds custody;
- liquidity providers deposit BSV and tokens and get LP shares, which are a BSV-21 token per pool;
- the LP fee and the protocol fee are written into the contract, so every trade is an auditable transaction;
- an open indexer reads pool state from the chain, and bsvex.com is just one front end for it.

The site at bsvex.com is a holding page for now. Its look will follow VexVoid.com.

## What's in this repo

| Path | What it is | Status |
|------|------------|--------|
| `src/app` | Holding page (Next.js) | Live |
| `docs/research.md` | BSV smart-contract and DEX research, with sources | Phase A |
| `docs/amm-design.md` | Pool design: state, methods, fees, LP token, indexer, wallet flow, contention, risks, compliance automation | Phase A |
| `contracts/src/math.ts` | Integer AMM maths (the spec) | Tested |
| `contracts/src/mockchain.ts` | In-memory UTXO chain with contract and BSV-21 indexer rules | Tested |
| `contracts/src/sCrypt/AmmPool.ts` | sCrypt contract draft | **Not compiled or audited** |

```bash
cd contracts && pnpm install && pnpm test
```

Nothing here has touched mainnet or testnet, and nothing holds keys. Configuration uses environment variable names only, never values.

## Licence

Open BSV License version 4 (see `LICENSE`).
