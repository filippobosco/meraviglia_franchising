import type { Metadata } from "next"
import { Inter } from "next/font/google"
import "./globals.css"

const inter = Inter({ subsets: ["latin"] })

export const metadata: Metadata = {
  title: "Meraviglialab — Franchising Dashboard",
  description: "Dashboard richieste franchising",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="it" className={`${inter.className} h-full`}>
      <body className="min-h-full" style={{ background: "#F8F9FB" }}>
        {children}
      </body>
    </html>
  )
}
