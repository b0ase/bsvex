"use client";

import { useState } from "react";
import { ArrowRight, Flame, AlertCircle } from "lucide-react";

interface Token {
  id: string;
  name: string;
  symbol: string;
  icon: string;
  burnAddress: string;
  exchangeRate: number;
}

const SUPPORTED_TOKENS: Token[] = [
  {
    id: "eth",
    name: "Ethereum",
    symbol: "ETH",
    icon: "🔷",
    burnAddress: "0x000000000000000000000000000000000000dEaD",
    exchangeRate: 0.0015
  },
  {
    id: "sol",
    name: "Solana",
    symbol: "SOL",
    icon: "🟣",
    burnAddress: "11111111111111111111111111111112",
    exchangeRate: 0.002
  },
  {
    id: "avax",
    name: "Avalanche",
    symbol: "AVAX",
    icon: "🔴",
    burnAddress: "0x000000000000000000000000000000000000dEaD",
    exchangeRate: 0.0018
  },
  {
    id: "trx",
    name: "TRON",
    symbol: "TRX",
    icon: "🟡",
    burnAddress: "T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb",
    exchangeRate: 0.0008
  },
  {
    id: "btc",
    name: "Bitcoin",
    symbol: "BTC",
    icon: "🟠",
    burnAddress: "1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2",
    exchangeRate: 0.0001
  }
];

export function TokenBurnForm() {
  const [selectedToken, setSelectedToken] = useState<Token>(SUPPORTED_TOKENS[0]);
  const [amount, setAmount] = useState("");
  const [bsvAddress, setBsvAddress] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState("");

  const calculateBSVAmount = (tokenAmount: string, token: Token) => {
    const numAmount = parseFloat(tokenAmount) || 0;
    return (numAmount * token.exchangeRate).toFixed(6);
  };

  const handleBurn = async () => {
    if (!amount || !bsvAddress) {
      setError("Please fill in all fields");
      return;
    }

    if (parseFloat(amount) <= 0) {
      setError("Amount must be greater than 0");
      return;
    }

    setIsProcessing(true);
    setError("");

    try {
      // TODO: Implement actual token burning logic
      // This would involve:
      // 1. Connecting to the appropriate blockchain
      // 2. Sending tokens to burn address
      // 3. Verifying the burn transaction
      // 4. Issuing BSV to the provided address
      
      await new Promise(resolve => setTimeout(resolve, 2000)); // Simulate processing
      
      // Success - reset form
      setAmount("");
      setBsvAddress("");
      alert("Token burn successful! BSV will be issued to your address.");
    } catch (err) {
      setError("Failed to process burn transaction. Please try again.");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="bg-white/10 backdrop-blur-md rounded-xl p-6 border border-white/20 relative overflow-hidden">
      {/* Background Pattern */}
      <div 
        className="absolute inset-0 bg-cover bg-center opacity-5"
        style={{
          backgroundImage: "url('/bsvex/burning-bsv.jpg')"
        }}
      ></div>
      <div className="relative z-10">
        <div className="flex items-center space-x-2 mb-6">
          <Flame className="text-orange-500" size={24} />
          <h2 className="text-2xl font-bold text-white">Burn Tokens for BSV</h2>
        </div>

        {/* Token Selection */}
        <div className="mb-6">
          <label className="block text-gray-300 mb-3">Select Token to Burn</label>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {SUPPORTED_TOKENS.map((token) => (
              <button
                key={token.id}
                onClick={() => setSelectedToken(token)}
                className={`p-3 rounded-lg border transition-colors ${
                  selectedToken.id === token.id
                    ? "border-orange-500 bg-orange-500/20"
                    : "border-white/20 hover:border-white/40"
                }`}
              >
                <div className="flex items-center space-x-2">
                  <span className="text-2xl">{token.icon}</span>
                  <div className="text-left">
                    <div className="text-white font-medium">{token.symbol}</div>
                    <div className="text-gray-400 text-sm">{token.name}</div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Amount Input */}
        <div className="mb-6">
          <label className="block text-gray-300 mb-2">
            Amount to Burn ({selectedToken.symbol})
          </label>
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.0"
            className="w-full p-3 bg-white/10 border border-white/20 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-orange-500"
          />
        </div>

        {/* BSV Address Input */}
        <div className="mb-6">
          <label className="block text-gray-300 mb-2">
            BSV Receiving Address
          </label>
          <input
            type="text"
            value={bsvAddress}
            onChange={(e) => setBsvAddress(e.target.value)}
            placeholder="Enter your BSV address"
            className="w-full p-3 bg-white/10 border border-white/20 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-orange-500"
          />
        </div>

        {/* Exchange Rate Display */}
        {amount && (
          <div className="mb-6 p-4 bg-white/5 rounded-lg border border-white/10">
            <div className="flex items-center justify-between text-white">
              <span>You will receive:</span>
              <div className="flex items-center space-x-2">
                <span className="text-2xl">🟠</span>
                <span className="text-xl font-bold">
                  {calculateBSVAmount(amount, selectedToken)} BSV
                </span>
              </div>
            </div>
            <div className="text-gray-400 text-sm mt-1">
              Exchange rate: 1 {selectedToken.symbol} = {selectedToken.exchangeRate} BSV
            </div>
          </div>
        )}

        {/* Error Display */}
        {error && (
          <div className="mb-6 p-3 bg-red-500/20 border border-red-500/50 rounded-lg flex items-center space-x-2">
            <AlertCircle className="text-red-400" size={16} />
            <span className="text-red-400">{error}</span>
          </div>
        )}

        {/* Burn Button */}
        <button
          onClick={handleBurn}
          disabled={isProcessing || !amount || !bsvAddress}
          className="w-full bg-orange-500 hover:bg-orange-600 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-bold py-3 px-6 rounded-lg transition-colors flex items-center justify-center space-x-2"
        >
          {isProcessing ? (
            <>
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
              <span>Processing...</span>
            </>
          ) : (
            <>
              <Flame size={16} />
              <span>Burn {selectedToken.symbol} for BSV</span>
              <ArrowRight size={16} />
            </>
          )}
        </button>

        {/* Warning */}
        <div className="mt-4 p-3 bg-yellow-500/20 border border-yellow-500/50 rounded-lg">
          <div className="flex items-start space-x-2">
            <AlertCircle className="text-yellow-400 mt-0.5" size={16} />
            <div className="text-yellow-400 text-sm">
              <strong>Warning:</strong> Token burning is irreversible. Make sure you have the correct BSV address before proceeding.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
} 