import type { Config } from 'tailwindcss'

const config: Config = {
    darkMode: 'class',
    content: [
        './app/**/*.{js,ts,jsx,tsx,mdx}',
        './components/**/*.{js,ts,jsx,tsx,mdx}',
    ],
    theme: {
        extend: {
            colors: {
                'glass-bg': 'rgba(16, 24, 48, 0.55)',
                'glass-border': 'rgba(100, 160, 255, 0.18)',
            },
        },
    },
    plugins: [],
}
export default config
