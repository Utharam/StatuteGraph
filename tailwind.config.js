/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        serif: ['Newsreader', 'Charter', 'Merriweather', 'Georgia', 'serif'],
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace']
      },
      colors: {
        parchment: {
          50: '#FDFCF7',
          100: '#FAF7EE',
          200: '#F4EFE2',
          300: '#E8DFC8',
          400: '#D5C7A3',
          500: '#B8A476',
          600: '#8E7B50',
          700: '#675836',
          800: '#463B23',
          900: '#2A2315',
        }
      }
    },
  },
  plugins: [],
}
