import type { Metadata, Viewport } from 'next'
import '@/styles/globals.css'
import Providers from './providers'

export const metadata: Metadata = {
    title: 'Sentinel — Shadow IT Detection',
    description: 'AI-Powered Network Anomaly Detection System',
}

export const viewport: Viewport = {
    width: 'device-width',
    initialScale: 1,
}

export default function RootLayout({
    children,
}: {
    children: React.ReactNode
}) {
    return (
        <html lang="en" suppressHydrationWarning>
            <head>
                <link rel="preconnect" href="https://fonts.googleapis.com" />
                <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
                <link href="https://fonts.googleapis.com/css2?family=Jersey+10+Charted&family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
                {/* WINCK light theme is the only theme — proactively strip any stale `.dark`. */}
                <script
                    dangerouslySetInnerHTML={{
                        __html: `document.documentElement.classList.remove('dark');`,
                    }}
                />
            </head>
            <body>
                <Providers>
                    {children}
                </Providers>
            </body>
        </html>
    )
}
