import { TokenBurnForm } from "@/components/TokenBurnForm";
import { Header } from "@/components/Header";
import { Stats } from "@/components/Stats";
import { Footer } from "@/components/Footer";

export default function Home() {
  return (
    <main className="min-h-screen">
      <Header />
      
      <div className="container mx-auto px-4 py-8">
        <div className="text-center mb-12">
          <h1 className="text-5xl font-bold text-white mb-4">
            BSV Exchange
          </h1>
          <p className="text-xl text-gray-300 max-w-2xl mx-auto">
            Burn your L1 tokens and receive BSV instantly. Secure, fast, and transparent 
            token exchange powered by blockchain technology.
          </p>
        </div>

        <div className="grid lg:grid-cols-3 gap-8 mb-12">
          <div className="lg:col-span-2">
            <TokenBurnForm />
          </div>
          <div className="lg:col-span-1">
            <Stats />
          </div>
        </div>
      </div>

      <Footer />
    </main>
  );
}
