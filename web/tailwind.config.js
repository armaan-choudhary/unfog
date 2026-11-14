/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        fog: {
          dark: '#0a0d14',
          card: '#111726',
          border: '#1e293b',
          muted: '#64748b',
          accent: '#38bdf8',
          amber: '#f59e0b',
          emerald: '#10b981',
          rose: '#f43f5e',
          purple: '#a855f7',
        }
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
        sans: ['Inter', 'sans-serif'],
      }
    },
  },
  plugins: [],
}
