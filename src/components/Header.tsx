"use client";

import { useState } from "react";
import { Wallet, Menu, X } from "lucide-react";

export function Header() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isWalletConnected, setIsWalletConnected] = useState(false);

  const handleConnectWallet = () => {
    // TODO: Implement wallet connection logic
    setIsWalletConnected(!isWalletConnected);
  };

  return (
    <header className="bg-black/20 backdrop-blur-md border-b border-white/10">
      <div className="container mx-auto px-4 py-4">
        <div className="flex items-center justify-between">
          {/* Logo */}
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 bg-orange-500 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-sm">BSV</span>
            </div>
            <span className="text-white font-bold text-xl">Exchange</span>
          </div>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center space-x-8">
            <a href="#exchange" className="text-gray-300 hover:text-white transition-colors">
              Exchange
            </a>
            <a href="#history" className="text-gray-300 hover:text-white transition-colors">
              History
            </a>
            <a href="#about" className="text-gray-300 hover:text-white transition-colors">
              About
            </a>
          </nav>

          {/* Wallet Connection */}
          <div className="flex items-center space-x-4">
            <button
              onClick={handleConnectWallet}
              className={`flex items-center space-x-2 px-4 py-2 rounded-lg transition-colors ${
                isWalletConnected
                  ? "bg-green-600 text-white"
                  : "bg-orange-500 hover:bg-orange-600 text-white"
              }`}
            >
              <Wallet size={16} />
              <span className="hidden sm:inline">
                {isWalletConnected ? "Connected" : "Connect Wallet"}
              </span>
            </button>

            {/* Mobile Menu Button */}
            <button
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              className="md:hidden text-white"
            >
              {isMenuOpen ? <X size={24} /> : <Menu size={24} />}
            </button>
          </div>
        </div>

        {/* Mobile Navigation */}
        {isMenuOpen && (
          <nav className="md:hidden mt-4 pb-4 border-t border-white/10 pt-4">
            <div className="flex flex-col space-y-4">
              <a href="#exchange" className="text-gray-300 hover:text-white transition-colors">
                Exchange
              </a>
              <a href="#history" className="text-gray-300 hover:text-white transition-colors">
                History
              </a>
              <a href="#about" className="text-gray-300 hover:text-white transition-colors">
                About
              </a>
            </div>
          </nav>
        )}
      </div>
    </header>
  );
} 