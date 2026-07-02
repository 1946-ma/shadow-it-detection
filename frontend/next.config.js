/** @type {import('next').NextConfig} */
const nextConfig = {
    reactStrictMode: true,
    swcMinify: true,
    poweredByHeader: false,
    compress: true,

    // Faster page transitions — prefetch on hover
    experimental: {
        optimizePackageImports: ['lucide-react', 'framer-motion', 'recharts'],
    },

    // Cache static assets aggressively
    headers: async () => [
        {
            source: '/_next/static/:path*',
            headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }],
        },
        {
            source: '/fonts/:path*',
            headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }],
        },
    ],
}

module.exports = nextConfig
