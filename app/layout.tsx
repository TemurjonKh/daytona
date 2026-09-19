import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
const inter = Inter({variable: "--font-inter", subsets: ["latin"]});
export const metadata: Metadata = {title: "Opportunity Agent | Deadline", description: "Find opportunities, understand the evidence, and keep your next deadline in view."};
export default function RootLayout({children}: LayoutProps<"/">) {
  return <html lang="en" className={`${inter.variable} antialiased`}><body>{children}</body></html>;
}
