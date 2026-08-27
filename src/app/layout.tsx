import type { Metadata, Viewport } from 'next'
import { Barlow_Condensed } from 'next/font/google'
import './globals.css'

const barlowCondensed = Barlow_Condensed({
  subsets: ['latin'],
  weight: ['600', '700', '800'],
  variable: '--font-barlow',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Degenerate Sweepstake',
  description: '2026/27 Football Sweepstake — Match Centre, Standings & Power-Ups',
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#0f1117',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={barlowCondensed.variable}>
      <body>{children}</body>
    </html>
  )
}
