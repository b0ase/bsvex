import Script from "next/script";

const B = "M45 12V72H27V30Z M27 72a33 33 0 1 1 66 0a33 33 0 1 1-66 0Z M45 72a15 15 0 1 0 30 0a15 15 0 1 0-30 0Z";

/** The b*X family shell (bmusicx.com): "Part of bWalletX" strip + header with the one wallet control. */
export function Shell() {
  return (
    <>
      <aside className="xs-strip" aria-label="bWalletX">
        <a href="https://bwalletx.com/family">
          <svg viewBox="23 8 74 100" aria-hidden="true" focusable="false">
            <defs>
              <linearGradient id="xs-sg" gradientUnits="userSpaceOnUse" x1="0" y1="12" x2="0" y2="105">
                <stop offset="0" stopColor="#FFE58A" />
                <stop offset=".55" stopColor="#FFD24D" />
                <stop offset="1" stopColor="#C98F00" />
              </linearGradient>
            </defs>
            <path fill="url(#xs-sg)" d={B} />
          </svg>
          <span>
            Part of <b>bWalletX</b>
          </span>
          <span className="xs-go" aria-hidden="true">
            &rarr;
          </span>
        </a>
      </aside>
      <header className="xs-wrap xs-nav">
        <a className="xs-brand" href="/" aria-label="BSVEX home">
          <img src="/bsvex-mark.svg" alt="" width="24" height="24" className="bx-mark" />
          <span>
            BSVE<i className="bx-x">X</i>
          </span>
        </a>
        <nav className="xs-links" aria-label="Main">
          <a href="#here">Browse</a>
          <a className="xs-hs" href="#board">Tokens</a>
          <a className="xs-hs" href="#status">Status</a>
          <span data-bwx-connect="" data-fg="#19c2a0" suppressHydrationWarning />
        </nav>
        <Script
          src="https://unpkg.com/@bwalletx/connect@0.5.0/dist/bwalletx-connect.global.js"
          integrity="sha384-1XiN/accJppMI7qXUHzNrUAdUWIotONkjNy7rZBrwcvPxDCFk1yC83JY2c4LZ8gg"
          crossOrigin="anonymous"
          strategy="afterInteractive"
        />
        <Script src="/bwx-connect.js" strategy="afterInteractive" />
      </header>
    </>
  );
}
