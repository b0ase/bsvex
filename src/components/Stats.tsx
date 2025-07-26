"use client";

import { TrendingUp, Users, Coins, Activity } from "lucide-react";

interface StatCard {
  title: string;
  value: string;
  change: string;
  icon: React.ReactNode;
  color: string;
}

const stats: StatCard[] = [
  {
    title: "Total BSV Issued",
    value: "1,247.5 BSV",
    change: "+12.5%",
    icon: <Coins className="text-blue-500" size={20} />,
    color: "bg-blue-500/20"
  },
  {
    title: "Active Users",
    value: "2,847",
    change: "+8.2%",
    icon: <Users className="text-green-500" size={20} />,
    color: "bg-green-500/20"
  },
  {
    title: "Exchange Volume",
    value: "$4.2M",
    change: "+15.7%",
    icon: <TrendingUp className="text-purple-500" size={20} />,
    color: "bg-purple-500/20"
  },
  {
    title: "Total Burns",
    value: "15,432",
    change: "+23.1%",
    icon: <Activity className="text-orange-500" size={20} />,
    color: "bg-orange-500/20"
  }
];

export function Stats() {
  return (
    <div className="space-y-6 relative">
      {/* Background Pattern */}
      <div 
        className="absolute inset-0 bg-cover bg-center opacity-5 rounded-xl"
        style={{
          backgroundImage: "url('/bsvex/network_matrix.jpg')"
        }}
      />
      <div className="relative z-10">
        {/* Stats Cards */}
        <div className="space-y-4">
          <h3 className="text-xl font-bold text-white mb-4">Exchange Statistics</h3>
          {stats.map((stat, index) => (
            <div
              key={index}
              className="bg-white/10 backdrop-blur-md rounded-lg p-4 border border-white/20"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className={`p-2 rounded-lg ${stat.color}`}>
                    {stat.icon}
                  </div>
                  <div>
                    <div className="text-gray-300 text-sm">{stat.title}</div>
                    <div className="text-white font-bold text-lg">{stat.value}</div>
                  </div>
                </div>
                <div className="text-green-400 text-sm font-medium">
                  {stat.change}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Recent Activity */}
        <div className="bg-white/10 backdrop-blur-md rounded-lg p-4 border border-white/20">
          <h3 className="text-lg font-bold text-white mb-4">Recent Activity</h3>
          <div className="space-y-3">
            {[
              { token: "ETH", amount: "2.5", user: "0x7a3...f8b", time: "2 min ago" },
              { token: "SOL", amount: "15.2", user: "0x9c1...a4d", time: "5 min ago" },
              { token: "AVAX", amount: "8.7", user: "0x3e5...c2f", time: "8 min ago" },
              { token: "BTC", amount: "0.15", user: "0x1f7...e9a", time: "12 min ago" }
            ].map((activity, index) => (
              <div key={index} className="flex items-center justify-between py-2 border-b border-white/10 last:border-b-0">
                <div className="flex items-center space-x-3">
                  <div className="w-2 h-2 bg-green-400 rounded-full" />
                  <div>
                    <div className="text-white text-sm">
                      {activity.amount} {activity.token} burned
                    </div>
                    <div className="text-gray-400 text-xs">
                      by {activity.user}
                    </div>
                  </div>
                </div>
                <div className="text-gray-400 text-xs">
                  {activity.time}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Exchange Rates */}
        <div className="bg-white/10 backdrop-blur-md rounded-lg p-4 border border-white/20">
          <h3 className="text-lg font-bold text-white mb-4">Current Rates</h3>
          <div className="space-y-2">
            {[
              { token: "ETH", rate: "0.0015 BSV" },
              { token: "SOL", rate: "0.0020 BSV" },
              { token: "AVAX", rate: "0.0018 BSV" },
              { token: "TRX", rate: "0.0008 BSV" },
              { token: "BTC", rate: "0.0001 BSV" }
            ].map((rate, index) => (
              <div key={index} className="flex justify-between items-center py-1">
                <span className="text-gray-300 text-sm">1 {rate.token}</span>
                <span className="text-white font-medium">= {rate.rate}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
} 