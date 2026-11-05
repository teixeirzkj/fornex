/** @type {import('tailwindcss').Config} */
// Tokens oficiais FORNEX (brand/colors.json + src/styles/fornex-design-tokens.css)
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        heading: ['Manrope', 'Inter', 'sans-serif'],
        sans: ['Inter', 'Manrope', 'sans-serif'],
      },
      colors: {
        // Semânticas (trocam entre tema escuro e .fx-light)
        bg: 'rgb(var(--c-bg) / <alpha-value>)',
        surface: 'rgb(var(--c-surface) / <alpha-value>)',
        'surface-2': 'rgb(var(--c-surface-2) / <alpha-value>)',
        line: 'rgb(var(--c-line) / <alpha-value>)',
        fg: 'rgb(var(--c-fg) / <alpha-value>)',
        muted: 'rgb(var(--c-muted) / <alpha-value>)',
        primary: 'rgb(var(--c-primary) / <alpha-value>)',
        accent: 'rgb(var(--c-accent) / <alpha-value>)',
        fornex: {
          midnight: 'var(--fx-midnight)',
          navy: 'var(--fx-deep-navy)',
          electric: 'var(--fx-electric-blue)',
          'electric-hover': 'var(--fx-primary-hover)',
          blue: 'var(--fx-bright-blue)',
          ice: 'var(--fx-ice-blue)',
          cloud: 'var(--fx-cloud)',
          slate: 'var(--fx-slate)',
          border: 'var(--fx-border-dark)',
          text: 'var(--fx-text)',
          muted: 'var(--fx-text-muted)',
          success: '#16A34A',
          warning: '#D97706',
          danger: '#DC2626',
        },
      },
      borderRadius: {
        'fx-sm': 'var(--fx-radius-sm)',
        'fx-md': 'var(--fx-radius-md)',
        'fx-lg': 'var(--fx-radius-lg)',
        'fx-xl': 'var(--fx-radius-xl)',
        fornex: '18px',
      },
      // Padrão macio para todas as transições CSS (hover, foco, cores)
      transitionTimingFunction: { DEFAULT: 'cubic-bezier(0.16, 1, 0.3, 1)', fx: 'cubic-bezier(0.16, 1, 0.3, 1)' },
      transitionDuration: { DEFAULT: '300ms' },
      boxShadow: {
        card: '0 1px 0 0 rgba(255,255,255,.03) inset, 0 16px 40px -24px rgba(0,0,0,.7)',
        cta: '0 8px 24px -10px rgba(21,94,239,.6)',
        soft: '0 1px 2px rgba(8,15,29,.06), 0 8px 24px -12px rgba(8,15,29,.12)',
      },
      keyframes: { shimmer: { '100%': { transform: 'translateX(100%)' } } },
      animation: { shimmer: 'shimmer 1.6s infinite' },
    },
  },
  plugins: [],
}
