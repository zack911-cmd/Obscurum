/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // Obscurum website palette — blue/cyan "ghost glow" theme
        ghost: {
          bg:        '#0a0c10',
          'bg-soft': '#0d0f15',
          surface:   '#12151c',
          'surface-2': '#181c26',
          border:    'rgba(255,255,255,0.08)',
          'border-strong': 'rgba(255,255,255,0.14)',
          text:      '#e6ebf2',
          'text-dim': '#8b93a3',
          'text-dimmer': '#565d6b',
          accent:    '#38bdf8',
          'accent-2': '#22d3ee',
          'accent-3': '#0ea5e9',
          green:     '#34d399',
          red:       '#f87171',
          yellow:    '#fbbf24',
        },
        // Keep old terminal/worm colors for backward compatibility during migration
        terminal: {
          bg:      '#0d1117',
          surface: '#161b22',
          card:    '#1c2128',
          border:  '#30363d',
          green:   '#39d353',
          red:     '#f85149',
          yellow:  '#d29922',
          blue:    '#58a6ff',
          purple:  '#bc8cff',
          cyan:    '#39c5cf',
          text:    '#c9d1d9',
          muted:   '#8b949e',
        },
        worm: {
          bg:      '#0a0506',
          surface: 'rgba(15,8,9,0.85)',
          border:  'rgba(248,49,47,0.25)',
          red:     '#f8312f',
          text:    '#f0d8d8',
          muted:   '#8a6d6d',
        },
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'Fira Code', 'Courier New', 'monospace'],
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif'],
      },
      backgroundImage: {
        'ghost-gradient': 'linear-gradient(135deg, #38bdf8 0%, #22d3ee 50%, #0ea5e9 100%)',
      },
    },
  },
  plugins: [],
}