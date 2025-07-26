"use client";

import { useState } from "react";
import { Search, Filter, Download, Eye } from "lucide-react";

interface Transaction {
  id: string;
  token: string;
  amount: string;
  bsvAmount: string;
  status: "completed" | "pending" | "failed";
  timestamp: string;
  burnTxHash: string;
  bsvTxHash?: string;
  userAddress: string;
}

const mockTransactions: Transaction[] = [
  {
    id: "tx_001",
    token: "ETH",
    amount: "2.5",
    bsvAmount: "0.00375",
    status: "completed",
    timestamp: "2024-01-15T10:30:00Z",
    burnTxHash: "0x1234567890abcdef...",
    bsvTxHash: "0xabcdef1234567890...",
    userAddress: "0x7a3...f8b"
  },
  {
    id: "tx_002",
    token: "SOL",
    amount: "15.2",
    bsvAmount: "0.0304",
    status: "completed",
    timestamp: "2024-01-14T15:45:00Z",
    burnTxHash: "5J1F7...",
    bsvTxHash: "0x9876543210fedcba...",
    userAddress: "0x9c1...a4d"
  },
  {
    id: "tx_003",
    token: "AVAX",
    amount: "8.7",
    bsvAmount: "0.01566",
    status: "pending",
    timestamp: "2024-01-14T12:20:00Z",
    burnTxHash: "0xabcdef1234567890...",
    userAddress: "0x3e5...c2f"
  },
  {
    id: "tx_004",
    token: "BTC",
    amount: "0.15",
    bsvAmount: "0.000015",
    status: "failed",
    timestamp: "2024-01-13T09:15:00Z",
    burnTxHash: "1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa",
    userAddress: "0x1f7...e9a"
  }
];

export function TransactionHistory() {
  const [transactions, setTransactions] = useState<Transaction[]>(mockTransactions);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const filteredTransactions = transactions.filter(tx => {
    const matchesSearch = tx.token.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         tx.id.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === "all" || tx.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case "completed":
        return "bg-green-500/20 text-green-400 border-green-500/50";
      case "pending":
        return "bg-yellow-500/20 text-yellow-400 border-yellow-500/50";
      case "failed":
        return "bg-red-500/20 text-red-400 border-red-500/50";
      default:
        return "bg-gray-500/20 text-gray-400 border-gray-500/50";
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
  };

  return (
    <div className="bg-white/10 backdrop-blur-md rounded-xl p-6 border border-white/20">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6">
        <div>
          <h2 className="text-2xl font-bold text-white mb-2">Transaction History</h2>
          <p className="text-gray-400">Track all your token burns and BSV issuances</p>
        </div>
        
        <div className="flex space-x-3 mt-4 md:mt-0">
          <button className="flex items-center space-x-2 px-4 py-2 bg-white/10 border border-white/20 rounded-lg text-white hover:bg-white/20 transition-colors">
            <Download size={16} />
            <span>Export</span>
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col md:flex-row gap-4 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={16} />
          <input
            type="text"
            placeholder="Search by token or transaction ID..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-white/10 border border-white/20 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-orange-500"
          />
        </div>
        
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-4 py-2 bg-white/10 border border-white/20 rounded-lg text-white focus:outline-none focus:border-orange-500"
        >
          <option value="all">All Status</option>
          <option value="completed">Completed</option>
          <option value="pending">Pending</option>
          <option value="failed">Failed</option>
        </select>
      </div>

      {/* Transactions Table */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-white/10">
              <th className="text-left py-3 px-4 text-gray-300 font-medium">Transaction</th>
              <th className="text-left py-3 px-4 text-gray-300 font-medium">Token</th>
              <th className="text-left py-3 px-4 text-gray-300 font-medium">Amount</th>
              <th className="text-left py-3 px-4 text-gray-300 font-medium">BSV Received</th>
              <th className="text-left py-3 px-4 text-gray-300 font-medium">Status</th>
              <th className="text-left py-3 px-4 text-gray-300 font-medium">Date</th>
              <th className="text-left py-3 px-4 text-gray-300 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredTransactions.map((tx) => (
              <tr key={tx.id} className="border-b border-white/5 hover:bg-white/5">
                <td className="py-4 px-4">
                  <div className="text-white font-mono text-sm">{tx.id}</div>
                  <div className="text-gray-400 text-xs">{tx.userAddress}</div>
                </td>
                <td className="py-4 px-4">
                  <div className="flex items-center space-x-2">
                    <span className="text-2xl">
                      {tx.token === "ETH" ? "🔷" : 
                       tx.token === "SOL" ? "🟣" : 
                       tx.token === "AVAX" ? "🔴" : 
                       tx.token === "TRX" ? "🟡" : "🟠"}
                    </span>
                    <span className="text-white">{tx.token}</span>
                  </div>
                </td>
                <td className="py-4 px-4">
                  <div className="text-white font-medium">{tx.amount}</div>
                </td>
                <td className="py-4 px-4">
                  <div className="flex items-center space-x-2">
                    <span className="text-2xl">🟠</span>
                    <span className="text-white font-medium">{tx.bsvAmount}</span>
                  </div>
                </td>
                <td className="py-4 px-4">
                  <span className={`px-2 py-1 rounded-full text-xs border ${getStatusColor(tx.status)}`}>
                    {tx.status.charAt(0).toUpperCase() + tx.status.slice(1)}
                  </span>
                </td>
                <td className="py-4 px-4">
                  <div className="text-white text-sm">{formatDate(tx.timestamp)}</div>
                </td>
                <td className="py-4 px-4">
                  <div className="flex space-x-2">
                    <button className="p-1 text-gray-400 hover:text-white transition-colors">
                      <Eye size={16} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Empty State */}
      {filteredTransactions.length === 0 && (
        <div className="text-center py-12">
          <div className="text-gray-400 text-lg mb-2">No transactions found</div>
          <div className="text-gray-500 text-sm">
            {searchTerm || statusFilter !== "all" 
              ? "Try adjusting your search or filter criteria"
              : "Start by burning some tokens to see your transaction history"
            }
          </div>
        </div>
      )}
    </div>
  );
} 