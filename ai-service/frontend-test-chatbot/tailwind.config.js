/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        cafe: {
          50: '#fbf8f3',
          100: '#f5ede2',
          200: '#e8d8c2',
          300: '#d6b996',
          400: '#bd9368',
          500: '#a87549',
          600: '#8c5938',
          700: '#70432f',
          800: '#5c372b',
          900: '#4d3028',
          950: '#291813',
        },
        sage: {
          50: '#f4f8f3',
          100: '#e4efe1',
          200: '#c9dfc5',
          300: '#a1c59a',
          400: '#78a971',
          500: '#578b51',
          600: '#436e3e',
          700: '#385735',
          800: '#30462e',
          900: '#293b28',
        },
      },
      boxShadow: {
        soft: '0 18px 50px rgba(77, 48, 40, 0.10)',
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        display: ['Georgia', 'Cambria', 'serif'],
      },
    },
  },
  plugins: [],
}
