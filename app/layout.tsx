import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import SWListener from "./components/sw-listener";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata = {
  title: {
    default: "EPP Control",
    template: "%s | EPP Control",
  },
  description: "EPP Control — Gestión inteligente de EPP",
  icons: {
    icon: "/logoepp.png",
    apple: "/logoepp.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <SWListener />
        {children}
      </body>
    </html>
  );
}
