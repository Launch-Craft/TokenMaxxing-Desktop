import type { Config } from 'tailwindcss'
import animate from 'tailwindcss-animate'

export default {
  darkMode: 'class',
  content: ['./src/renderer/index.html', './src/renderer/**/*.{ts,tsx}'],
  theme: {
    container: {
      center: true,
      padding: '2rem',
      screens: { '2xl': '1400px' }
    },
    extend: {
      fontFamily: {
        sans: ['Inter', 'Inter Fallback', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace']
      },
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))'
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))'
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))'
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))'
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))'
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))'
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))'
        },
        // Brand + chart palette (tool colors)
        brand: {
          DEFAULT: 'hsl(var(--brand))',
          foreground: 'hsl(var(--brand-foreground))'
        },
        viz: {
          green: 'hsl(var(--viz-green))',
          cyan: 'hsl(var(--viz-cyan))',
          violet: 'hsl(var(--viz-violet))',
          amber: 'hsl(var(--viz-amber))',
          rose: 'hsl(var(--viz-rose))',
          blue: 'hsl(var(--viz-blue))',
          orange: 'hsl(var(--viz-orange))',
          slate: 'hsl(var(--viz-slate))'
        }
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 4px)',
        sm: 'calc(var(--radius) - 8px)',
        xl: 'calc(var(--radius) + 4px)',
        '2xl': 'calc(var(--radius) + 8px)'
      },
      boxShadow: {
        glass: '0 1px 0 0 hsl(0 0% 100% / 0.04) inset, 0 8px 24px -12px hsl(0 0% 0% / 0.6)',
        // "glow" kept for API compatibility — now a neutral elevation, no color.
        glow: '0 1px 0 0 hsl(0 0% 100% / 0.06) inset, 0 10px 28px -16px hsl(0 0% 0% / 0.7)',
        'inner-top': 'inset 0 1px 0 0 hsl(0 0% 100% / 0.06)'
      },
      backgroundImage: {
        'grid-faint':
          'linear-gradient(to right, hsl(0 0% 100% / 0.03) 1px, transparent 1px), linear-gradient(to bottom, hsl(0 0% 100% / 0.03) 1px, transparent 1px)',
        'radial-glow': 'none'
      },
      keyframes: {
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' }
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0' }
        },
        shimmer: {
          '100%': { transform: 'translateX(100%)' }
        },
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' }
        },
        'pulse-glow': {
          '0%, 100%': { opacity: '0.6' },
          '50%': { opacity: '1' }
        }
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
        shimmer: 'shimmer 2s infinite',
        'fade-up': 'fade-up 0.5s cubic-bezier(0.16, 1, 0.3, 1)',
        'pulse-glow': 'pulse-glow 3s ease-in-out infinite'
      }
    }
  },
  plugins: [animate]
} satisfies Config
