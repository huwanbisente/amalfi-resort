/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  corePlugins: {
    preflight: false,
  },
  theme: {
    extend: {
      colors: {
        desk: {
          canvas: 'var(--desk-canvas)',
          surface: 'var(--desk-surface)',
          paper: 'var(--desk-paper)',
          ink: 'var(--desk-ink)',
          muted: 'var(--desk-muted)',
          line: 'var(--desk-line)',
          soft: 'var(--desk-soft)',
          green: 'var(--desk-green)',
          deep: 'var(--desk-green-deep)',
          gold: 'var(--desk-gold)',
          red: 'var(--desk-red)',
          blue: 'var(--desk-blue)',
        },
      },
      boxShadow: {
        desk: 'var(--desk-shadow)',
        resort: 'var(--desk-shadow-resort)',
        embossed: 'inset 0 1px 0 rgba(255,255,255,0.92), inset 0 0 0 1px rgba(255,246,220,0.62), inset 0 -1px 0 rgba(93,61,24,0.18), 0 0 0 1px rgba(70,46,18,0.08), 0 20px 48px rgba(19,33,31,0.075), 0 10px 28px rgba(198,146,63,0.16)',
      },
      borderRadius: {
        desk: 'var(--desk-radius)',
      },
      fontFamily: {
        sans: ['var(--font-body)'],
        display: ['var(--font-display)'],
        data: ['var(--font-data)'],
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
};
