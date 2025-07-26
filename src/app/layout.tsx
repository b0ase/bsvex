import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "BSV Exchange - Burn L1 Tokens for BSV",
  description: "Exchange your L1 tokens (ETH, SOL, AVAX, TRX, BTC) for BSV through secure token burning",
  keywords: "BSV, Bitcoin SV, exchange, token burning, cryptocurrency, blockchain",
  authors: [{ name: "BSV Exchange Team" }],
  viewport: "width=device-width, initial-scale=1",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
          {children}
        </div>
      </body>
    </html>
  );
}
