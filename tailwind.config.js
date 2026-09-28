/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: { sans: ['Inter', 'system-ui', 'sans-serif'], mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'] },
      colors: { lab: { line: '#e2e8f0', ink: '#0f172a', orange: '#f97316', red: '#dc2626' } },
    },
  },
  plugins: [],
};
