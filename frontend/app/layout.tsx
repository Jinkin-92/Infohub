import type { Metadata } from 'next'
import './globals.css'
import { ThemeProvider } from './components/ThemeProvider'

export const metadata: Metadata = {
  title: '个人信息中枢',
  description: '多平台内容聚合系统',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body className="antialiased min-h-screen bg-bg-primary">
        <ThemeProvider defaultTheme="system" storageKey="infohub-theme">
          {children}
        </ThemeProvider>
      </body>
    </html>
  )
}
