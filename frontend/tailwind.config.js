
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#FBF5EF',
          100: '#F3E2CC',
          200: '#E6C8A4', // inferred
          300: '#D9AE7C',
          400: '#C18B5C', // inferred
          500: '#A9683B', // base
          600: '#925831', // inferred
          700: '#7A4826',
          800: '#62391E', // inferred
          900: '#4A2A16',
        },
        secondary: {
          50: '#F0FDF4', // inferred (Tailwind green)
          100: '#DCFCE7',
          200: '#BBF7D0', // inferred
          300: '#86EFAC', // inferred
          400: '#4ADE80', // inferred
          500: '#16A34A',
          600: '#169144', // inferred
          700: '#15803D',
          800: '#166534', // inferred
          900: '#14532D', // inferred
        },
        accent: {
          50: '#FFF7ED', // inferred (Tailwind orange)
          100: '#FFEDD5',
          200: '#FED7AA', // inferred
          300: '#FDBA74', // inferred
          400: '#FB923C', // inferred
          500: '#F97316',
          600: '#EA580C', // inferred
          700: '#C2410C',
          800: '#9A3412', // inferred
          900: '#7C2D12', // inferred
        },
        gray: {
          50: '#FAFAF9',
          100: '#F5F5F4',
          200: '#E7E5E4',
          300: '#D6D3D1',
          400: '#A8A29E',
          500: '#78716C',
          600: '#57534E',
          700: '#44403C',
          800: '#292524',
          900: '#1C1917',
        },
        // soft = nền badge/alert, DEFAULT = icon/viền/fill, strong = màu CHỮ (đủ tương phản trên nền trắng/soft)
        success: { soft: '#DCFCE7', DEFAULT: '#22C55E', strong: '#166534' }, // DEFAULT đúng spec (success-500)
        warning: { soft: '#FEF3C7', DEFAULT: '#F59E0B', strong: '#92400E' },
        error: { soft: '#FEE2E2', DEFAULT: '#DC2626', strong: '#991B1B' },
        info: { soft: '#DBEAFE', DEFAULT: '#2563EB', strong: '#1E40AF' },
        ai: { from: '#7C3AED', to: '#3B82F6', glow: '#A78BFA' }, // glow dùng với opacity ~20%
      },

      borderRadius: { sm: '8px', md: '12px', lg: '16px', xl: '24px' },

      fontFamily: {
        heading: ['"Plus Jakarta Sans Variable"', '"Plus Jakarta Sans"', 'system-ui', 'sans-serif'],
        body: ['"Inter Variable"', 'Inter', 'system-ui', 'sans-serif'],
      },

      fontSize: {
        display: ['2.25rem', { lineHeight: '2.75rem', letterSpacing: '-0.02em', fontWeight: '700' }],
        h1: ['1.75rem', { lineHeight: '2.25rem', letterSpacing: '-0.015em', fontWeight: '700' }],
        h2: ['1.5rem', { lineHeight: '2rem', letterSpacing: '-0.01em', fontWeight: '700' }],
        h3: ['1.25rem', { lineHeight: '1.75rem', fontWeight: '600' }],
        h4: ['1.125rem', { lineHeight: '1.625rem', fontWeight: '600' }],
        'body-lg': ['1rem', { lineHeight: '1.5rem' }],
        body: ['0.875rem', { lineHeight: '1.25rem' }],
        caption: ['0.75rem', { lineHeight: '1rem', fontWeight: '500' }],
      },

      boxShadow: {
        card: '0 1px 2px rgba(74,45,32,0.06), 0 1px 3px rgba(74,45,32,0.08)',
        dropdown: '0 4px 6px -1px rgba(74,45,32,0.08), 0 10px 20px -4px rgba(74,45,32,0.14)',
        modal: '0 24px 48px -12px rgba(74,45,32,0.30)',
        sticky: '0 2px 8px rgba(74,45,32,0.10)',
      },

      backgroundImage: {
        'ai-gradient': 'linear-gradient(135deg, #7C3AED 0%, #3B82F6 100%)',
      },

      keyframes: {
        'ai-pulse': {
          '0%, 100%': { boxShadow: '0 0 0 0 rgba(124,58,237,0.45)' },
          '50%': { boxShadow: '0 0 0 12px rgba(124,58,237,0)' },
        },
      },
      animation: { 'ai-pulse': 'ai-pulse 2s ease-out infinite' },
    },
  },
  plugins: [],
}