/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // Warm paper palette
        paper: '#fafaf5',          // Main background — warm off-white
        cream: '#f4f2e9',          // Secondary surface — subtle cream
        line: '#e8e4d8',           // Borders — warm stone
        // Ink (text)
        ink: '#1a1a17',            // Primary — near-black with warm undertone
        'ink-body': '#44443e',     // Body text
        'ink-mute': '#8a8676',     // Muted / labels
        // Brand accent — deep forest teal
        forest: '#134e4a',
        'forest-dark': '#0f3e3b',
        'forest-light': '#5eead4',
      },
      fontFamily: {
        sans: ['Geist', 'system-ui', 'sans-serif'],
        serif: ['Fraunces', 'Georgia', 'serif'],
        mono: ['"Geist Mono"', 'monospace'],
      },
    },
  },
  plugins: [],
};
