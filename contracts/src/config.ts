/**
 * Owner decisions, 28 Oct 2026 (BSVEX-PLAN §14). These are deploy-time
 * parameters: each pool fixes them in its immutable contract state at
 * genesis. Changing a value here only affects pools deployed afterwards.
 *
 * Everything here is public. No keys or secrets belong in this file.
 */

/** bcorp@bwalletx.com resolved once to P2PKH. Public address. */
export const PROTOCOL_FEE_ADDRESS = '1MMxztpc9fj5o5Mtp8CFqPwXJfeycCTw3L'

/** LP fee, all pools: 0.25%. */
export const LP_FEE_BPS = 25n

/** Protocol fee: 0.05% for our tokens, 0.10% for third-party tokens. */
export const PROTOCOL_FEE_BPS = { ours: 5n, thirdParty: 10n } as const
export type TokenFamily = keyof typeof PROTOCOL_FEE_BPS

/** Pool cap until the contracts are audited: 1 BSV. Enforced in the contract (maxSats). */
export const POOL_CAP_SATS = 100_000_000n

/** Locked shares for an ordinary pool genesis. Graduated pools lock all of L (burned forever). */
export const MIN_LIQUIDITY = 1_000n

/**
 * GorillaPool BSV-21 index fee per token output, paid by the user on
 * whichever tx creates the token output. ~1,000 sats is the working figure;
 * NOT yet confirmed with GorillaPool (docs/amm-design.md §12.6).
 */
export const INDEX_FEE_PER_TOKEN_OUTPUT_SATS = 1_000n

/**
 * Measured tx sizes (bytes) from contracts/scrypt/measurements.json
 * (scrypt-ts 1.4.5 / scryptc 1.20.0, Phase C). Update when the contract changes.
 */
export const MEASURED_TX_BYTES = {
  swapSatsForTokens: 50_581,
  swapTokensForSats: 51_073,
  addLiquidity: 51_194,
  removeLiquidity: 51_229,
  poolGenesis: 24_702,
} as const
export type PoolOp = keyof typeof MEASURED_TX_BYTES

/** Token outputs each op creates (each pays the index fee): vaults are recreated every call. */
export const TOKEN_OUTPUTS = {
  swapSatsForTokens: 3n, // token vault', LP vault', trader tokens
  swapTokensForSats: 2n, // token vault', LP vault' (+1 if the trader needs token change)
  addLiquidity: 3n, // token vault', LP vault', trader LP (+1 token change)
  removeLiquidity: 3n, // token vault', LP vault', trader tokens (+1 LP change)
  poolGenesis: 2n, // token vault, LP vault
} as const

export function protocolFeeBpsFor(family: TokenFamily): bigint {
  return PROTOCOL_FEE_BPS[family]
}
