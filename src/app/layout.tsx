import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "BSVEX",
  description: "Every BSV-21 token in one place, with live sales from 1sat.market. Part of bWalletX. BSVEX pools are not open yet.",
  metadataBase: new URL("https://www.bsvex.com"),
  openGraph: { title: "BSVEX", description: "An open exchange for BSV-21 tokens, run by contracts on Bitcoin. Not open yet.", url: "/" },
  robots: { index: true, follow: true },
};

export const viewport = { width: "device-width", initialScale: 1, themeColor: "#000000" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600&family=Space+Grotesk:wght@500;600;700;800&display=swap"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
