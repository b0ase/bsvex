import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "BSVEX",
  description: "An open exchange for BSV-21 tokens, run by contracts on Bitcoin. Nobody holds your coins. Not open yet.",
  metadataBase: new URL("https://www.bsvex.com"),
  openGraph: { title: "BSVEX", description: "An open exchange for BSV-21 tokens, run by contracts on Bitcoin. Not open yet.", url: "/" },
  robots: { index: true, follow: true },
};

export const viewport = { width: "device-width", initialScale: 1, themeColor: "#000000" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
