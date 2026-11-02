import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "BSVEX",
  description: "See what’s on BSV: tokens, art, music and films minted in bWalletX. Browsing only. Nothing is bought or sold on this site.",
  metadataBase: new URL("https://www.bsvex.com"),
  alternates: { canonical: "/" },
  openGraph: { title: "BSVEX", description: "See what’s on BSV: tokens, art, music and films minted in bWalletX. Browsing only. Nothing is bought or sold on this site.", url: "/" },
  twitter: { card: "summary_large_image", title: "BSVEX", description: "See what’s on BSV: tokens, art, music and films minted in bWalletX. Browsing only. Nothing is bought or sold on this site." },
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
