import Link from "next/link";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";

export default function NotFound() {
  return (
    <main className="min-h-screen">
      <Header />
      
      <div className="container mx-auto px-4 py-16">
        <div className="text-center">
          <div className="mb-8">
            <h1 className="text-8xl font-bold text-orange-500 mb-4">404</h1>
            <h2 className="text-3xl font-bold text-white mb-4">Page Not Found</h2>
            <p className="text-xl text-gray-300 mb-8">
              The page you&apos;re looking for doesn&apos;t exist or has been moved.
            </p>
          </div>
          
          <div className="space-y-4">
            <Link 
              href="/"
              className="inline-block bg-orange-500 hover:bg-orange-600 text-white font-bold py-3 px-8 rounded-lg transition-colors"
            >
              Go to Homepage
            </Link>
            
            <div className="text-gray-400">
              <p>Or try one of these pages:</p>
              <div className="flex justify-center space-x-6 mt-4">
                <Link href="/" className="text-orange-400 hover:text-orange-300">
                  Exchange
                </Link>
                <Link href="/history" className="text-orange-400 hover:text-orange-300">
                  History
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>

      <Footer />
    </main>
  );
} 