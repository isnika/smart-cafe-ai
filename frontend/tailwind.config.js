/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#FAF5F0', 100: '#F2E6DA', 200: '#E4CBB3', 300: '#D3AA84', 400: '#BF875B',
          500: '#A9683B', 600: '#8E5430', 700: '#6F4126', 800: '#5A3523', 900: '#4A2D20',
        },
        secondary: {
          50: '#F0FDF4', 100: '#DCFCE7', 200: '#BBF7D0', 300: '#86EFAC', 400: '#4ADE80',
          500: '#16A34A', 600: '#15803D', 700: '#166534', 800: '#14532D', 900: '#0F3D22',
        },
        accent: {
          50: '#FFF7ED', 100: '#FFEDD5', 200: '#FED7AA', 300: '#FDBA74', 400: '#FB923C',
          500: '#F97316', 600: '#EA580C', 700: '#C2410C', 800: '#9A3412', 900: '#7C2D12',
        },
        gray: {
          50: '#FAFAF9', 100: '#F5F5F4', 200: '#E7E5E4', 300: '#D6D3D1', 400: '#A8A29E',
          500: '#78716C', 600: '#57534E', 700: '#44403C', 800: '#292524', 900: '#1C1917',
        },
        success: { soft: '#DCFCE7', DEFAULT: '#16A34A', strong: '#166534' },
        warning: { soft: '#FEF3C7', DEFAULT: '#F59E0B', strong: '#92400E' },
        error:   { soft: '#FEE2E2', DEFAULT: '#DC2626', strong: '#991B1B' },
        info:    { soft: '#DBEAFE', DEFAULT: '#2563EB', strong: '#1E40AF' }, 
        ai: { from: '#7C3AED', to: '#3B82F6' },
      },
      borderRadius: { sm: '8px', md: '12px', lg: '16px', xl: '24px' },
      fontFamily: {
        heading: ['"Plus Jakarta Sans Variable"', '"Plus Jakarta Sans"', 'system-ui', 'sans-serif'],
        body: ['"Inter Variable"', 'Inter', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        display:   ['2.25rem', { lineHeight: '2.75rem', letterSpacing: '-0.02em', fontWeight: '700' }],
        h1:        ['1.75rem', { lineHeight: '2.25rem', letterSpacing: '-0.015em', fontWeight: '700' }],
        h2:        ['1.5rem',  { lineHeight: '2rem',    letterSpacing: '-0.01em',  fontWeight: '700' }],
        h3:        ['1.25rem', { lineHeight: '1.75rem', fontWeight: '600' }],
        h4:        ['1.125rem',{ lineHeight: '1.625rem',fontWeight: '600' }],
        'body-lg': ['1rem',    { lineHeight: '1.5rem' }],
        body:      ['0.875rem',{ lineHeight: '1.25rem' }],
        caption:   ['0.75rem', { lineHeight: '1rem' }],
      },
      boxShadow: {
        card:     '0 1px 2px rgba(74,45,32,0.06), 0 1px 3px rgba(74,45,32,0.08)',
        dropdown: '0 4px 6px -1px rgba(74,45,32,0.08), 0 10px 20px -4px rgba(74,45,32,0.14)',
        modal:    '0 24px 48px -12px rgba(74,45,32,0.30)',
        sticky:   '0 2px 8px rgba(74,45,32,0.10)',
      },
      backgroundImage: {
        'ai-gradient': 'linear-gradient(135deg, #7C3AED 0%, #3B82F6 100%)',
      },
      keyframes: {
        'ai-pulse': {
          '0%, 100%': { boxShadow: '0 0 0 0 rgba(124,58,237,0.45)' },
          '50%':      { boxShadow: '0 0 0 12px rgba(124,58,237,0)' },
        },
      },
      animation: { 'ai-pulse': 'ai-pulse 2s ease-out infinite' },
    },
  },
  plugins: [],
}