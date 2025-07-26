export function Footer() {
  return (
    <footer className="bg-black/40 backdrop-blur-md border-t border-white/10 mt-16">
      <div className="container mx-auto px-4 py-8">
        <div className="grid md:grid-cols-4 gap-8">
          {/* Brand */}
          <div className="md:col-span-1">
            <div className="flex items-center space-x-2 mb-4">
              <div className="w-8 h-8 bg-orange-500 rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-sm">BSV</span>
              </div>
              <span className="text-white font-bold text-xl">Exchange</span>
            </div>
            <p className="text-gray-400 text-sm">
              The premier platform for burning L1 tokens and receiving BSV. 
              Secure, transparent, and lightning-fast exchanges.
            </p>
          </div>

          {/* Quick Links */}
          <div>
            <h3 className="text-white font-semibold mb-4">Quick Links</h3>
            <ul className="space-y-2">
              <li>
                <a href="#exchange" className="text-gray-400 hover:text-white transition-colors text-sm">
                  Exchange Tokens
                </a>
              </li>
              <li>
                <a href="#rates" className="text-gray-400 hover:text-white transition-colors text-sm">
                  Exchange Rates
                </a>
              </li>
              <li>
                <a href="#history" className="text-gray-400 hover:text-white transition-colors text-sm">
                  Transaction History
                </a>
              </li>
              <li>
                <a href="#support" className="text-gray-400 hover:text-white transition-colors text-sm">
                  Support
                </a>
              </li>
            </ul>
          </div>

          {/* Supported Tokens */}
          <div>
            <h3 className="text-white font-semibold mb-4">Supported Tokens</h3>
            <ul className="space-y-2">
              <li className="text-gray-400 text-sm">🔷 Ethereum (ETH)</li>
              <li className="text-gray-400 text-sm">🟣 Solana (SOL)</li>
              <li className="text-gray-400 text-sm">🔴 Avalanche (AVAX)</li>
              <li className="text-gray-400 text-sm">🟡 TRON (TRX)</li>
              <li className="text-gray-400 text-sm">🟠 Bitcoin (BTC)</li>
            </ul>
          </div>

          {/* Contact */}
          <div>
            <h3 className="text-white font-semibold mb-4">Contact</h3>
            <ul className="space-y-2">
              <li>
                <a href="mailto:support@bsvexchange.com" className="text-gray-400 hover:text-white transition-colors text-sm">
                  support@bsvexchange.com
                </a>
              </li>
              <li>
                <a href="https://t.me/bsvexchange" className="text-gray-400 hover:text-white transition-colors text-sm">
                  Telegram
                </a>
              </li>
              <li>
                <a href="https://twitter.com/bsvexchange" className="text-gray-400 hover:text-white transition-colors text-sm">
                  Twitter
                </a>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="border-t border-white/10 mt-8 pt-8 flex flex-col md:flex-row justify-between items-center">
          <div className="text-gray-400 text-sm">
            © 2024 BSV Exchange. All rights reserved.
          </div>
          <div className="flex space-x-6 mt-4 md:mt-0">
            <a href="/privacy" className="text-gray-400 hover:text-white transition-colors text-sm">
              Privacy Policy
            </a>
            <a href="/terms" className="text-gray-400 hover:text-white transition-colors text-sm">
              Terms of Service
            </a>
            <a href="/security" className="text-gray-400 hover:text-white transition-colors text-sm">
              Security
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
} 