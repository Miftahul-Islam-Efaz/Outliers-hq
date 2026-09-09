import type { Metadata } from "next"
import "./globals.css"
import "./ui.css"
import "./extras.css"

export const metadata: Metadata = {
  title: "Outliers Hq",
  description: "Idea and concept HQ for the Outliers team.",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
