/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  safelist: [
    ...Array.from({ length: 31 }, (_, index) => `[grid-column-start:${index + 1}]`),
    ...Array.from({ length: 31 }, (_, index) => `[grid-column-end:span_${index + 1}]`),
    ...Array.from({ length: 101 }, (_, index) => `h-[${index}%]`),
    ...Array.from({ length: 24 }, (_, index) => `z-[${index + 5}]`),
  ],
  corePlugins: {
    preflight: false,
  },
  theme: {
    extend: {
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        breeze: {
          canvas: 'var(--admin-canvas)',
          surface: 'var(--admin-surface)',
          ink: 'var(--admin-ink)',
          muted: 'var(--admin-muted)',
          emerald: 'var(--admin-emerald)',
          lagoon: 'var(--admin-lagoon)',
          gold: 'var(--admin-gold)',
          sand: 'var(--admin-sand)',
          night: 'var(--admin-night)',
          coral: 'var(--admin-coral)',
        },
        resort: {
          bg: '#F4EFE6',
          surface: '#FFFDF8',
          sidebar: '#0A3B37',
          sidebarDark: '#092A28',
          sidebarLight: '#125A52',
          teal: '#0A6B5F',
          tealDark: '#08443F',
          aqua: '#6EC7B5',
          sand: '#EEE2CF',
          gold: '#C6923F',
          coral: '#C84A4A',
          red: '#D92D20',
          purple: '#7C3AED',
          ink: '#13211F',
          muted: '#69776F',
          line: '#E5D8C4',
          card: '#FFFDF8',
        },
      },
      boxShadow: {
        resort: 'var(--admin-shadow-resort)',
        soft: 'var(--admin-shadow-soft)',
        card: '0 8px 20px rgba(23, 51, 48, 0.06)',
      },
      borderRadius: {
        resort: 'var(--admin-radius-lg)',
        panel: '22px',
      },
      fontFamily: {
        sans: ['var(--font-ui)'],
        display: ['var(--font-display)'],
        data: ['var(--font-data)'],
        resortDisplay: ['Plus Jakarta Sans', 'sans-serif'],
        resortSans: ['Plus Jakarta Sans', 'sans-serif'],
        resortMono: ['IBM Plex Mono', 'monospace'],
      },
      backgroundImage: {
        'tropical-header': 'linear-gradient(90deg, #FDF7EA 0%, #EAF8F4 35%, #17A7A5 72%, #008C8C 100%)',
        'teal-sidebar': 'linear-gradient(180deg, #007B78 0%, #005E5B 55%, #004340 100%)',
      },
      fontSize: {
        'admin-page': ['var(--type-page-title)', { lineHeight: 'var(--line-title)', letterSpacing: '0' }],
        'admin-section': ['var(--type-section-title)', { lineHeight: 'var(--line-section)', letterSpacing: '0' }],
        'admin-card': ['var(--type-card-title)', { lineHeight: 'var(--line-body)', letterSpacing: '0' }],
        'admin-body': ['var(--type-body)', { lineHeight: 'var(--line-body)', letterSpacing: '0' }],
        'admin-label': ['var(--type-label)', { lineHeight: 'var(--line-label)', letterSpacing: '0' }],
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
};
