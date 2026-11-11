import type { Metadata } from "next";
import "./globals.css";
import { Geist, Geist_Mono } from "next/font/google";

export const metadata: Metadata = {
  title: "DSQL Movies Demo",
  description: "Search movies from an AWS Aurora DSQL Postgres database.",
};

const geist = Geist({
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
});

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${geist.className} ${geistMono.variable} antialiased bg-white dark:bg-black`}>
        {children}
      </body>
    </html>
  );
}
