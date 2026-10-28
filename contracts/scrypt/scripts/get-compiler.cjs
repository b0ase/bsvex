/**
 * Pin the native sCrypt compiler. scryptlib's postinstall downloads "latest"
 * from GitHub; we require exactly 1.20.0 and check its sha256 so a changed
 * upstream binary cannot slip in. Run on install / before compile.
 */
const { createHash } = require('crypto')
const { existsSync, readFileSync } = require('fs')
const { dirname, join } = require('path')

const VERSION = '1.20.0'
// sha256 of the macOS (x86_64, runs under Rosetta on Apple silicon) binary, verified 28 Oct 2026.
const SHA256 = { darwin: 'a9590c1cd206e14cdbb76ad2984a94298ab3b0a719e8bcbf4d49582dc5bc4dd5' }

async function main() {
  const libDir = dirname(require.resolve('scryptlib/package.json', { paths: [dirname(require.resolve('scrypt-cli/package.json'))] }))
  const { getPlatformScryptc } = require(join(libDir, 'dist'))
  const bin = join(libDir, getPlatformScryptc())
  if (!existsSync(bin)) {
    const { getBinary } = require(join(libDir, 'util', 'getBinary'))
    await getBinary(VERSION)
  }
  const sum = createHash('sha256').update(readFileSync(bin)).digest('hex')
  const want = SHA256[process.platform]
  if (want && sum !== want) {
    console.error(`scryptc sha256 mismatch: ${sum} (want ${want}) at ${bin}`)
    process.exit(1)
  }
  if (!want) console.warn(`no pinned sha256 for ${process.platform}; got ${sum}. Add it to scripts/get-compiler.cjs after checking.`)
  console.log(`scryptc ${VERSION} ok: ${bin}`)
}
main().catch((e) => { console.error(e); process.exit(1) })
