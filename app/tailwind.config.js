/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
      },
      colors: {
        hotel: {
          dark: '#030712',    // Deep Space Black (gray-950)
          card: '#08101a',    // Glassy Blue-Black
          accent: '#38bdf8',  // Sky Blue (Neon/Cyber feel)
          city: '#6CABDD',    // Man City Blue
          glow: '#0284c7',    // Deep Blue for shadows
          success: '#10b981', // Emerald Success
          warning: '#f59e0b', // Amber Warning
          danger: '#e11d48',  // Crimson Danger
        }
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'float': 'float 6s ease-in-out infinite',
        'aurora': 'aurora 15s linear infinite',
      },
      keyframes: {
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-10px)' },
        },
        aurora: {
          '0%': { backgroundPosition: '0% 50%' },
          '50%': { backgroundPosition: '100% 50%' },
          '100%': { backgroundPosition: '0% 50%' },
        }
      }
    },
  },
  plugins: [],
}
