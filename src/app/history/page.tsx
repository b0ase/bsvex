import { TransactionHistory } from "@/components/TransactionHistory";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";

export default function HistoryPage() {
  return (
    <main className="min-h-screen">
      <Header />
      
      <div className="container mx-auto px-4 py-8">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-white mb-4">
            Transaction History
          </h1>
          <p className="text-xl text-gray-300 max-w-2xl mx-auto">
            View all your token burns and BSV issuances. Track your exchange activity 
            and monitor transaction status.
          </p>
        </div>

        <TransactionHistory />
      </div>

      <Footer />
    </main>
  );
} 