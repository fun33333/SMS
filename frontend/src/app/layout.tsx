import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "sonner";
// import { Breadcrumbs } from "@/components/Breadcrumbs";


const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "IAK SMS",
  description: "Created by AIT",
};



export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`} suppressHydrationWarning={true}>
        <Toaster position="top-right" richColors />
        <div className="min-h-screen bg-[#e7ecef] flex">
          <main className="flex-1 py-8">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
