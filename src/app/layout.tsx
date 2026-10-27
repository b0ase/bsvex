import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "BSVEX · Coming soon",
  description: "BSVEX, from The Bitcoin Corporation. Coming soon.",
  metadataBase: new URL("https://www.bsvex.com"),
  openGraph: { title: "BSVEX", description: "Coming soon.", url: "/" },
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
