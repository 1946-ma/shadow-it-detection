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
                <script
                    dangerouslySetInnerHTML={{
                        __html: `
                            (function() {
                                try {
                                    var isLogin = window.location.pathname === '/login';
                                    var saved = localStorage.getItem('darkMode');
                                    var dark = saved !== null ? JSON.parse(saved) : true;
                                    if (dark) document.documentElement.classList.add('dark');
                                } catch (e) {}
                            })();
                        `,
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
