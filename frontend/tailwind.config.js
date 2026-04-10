/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx,js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-sans)'],
        compact: ['MTS Compact', 'var(--font-sans)'],
        wide: ['MTS Wide', 'var(--font-sans)']
      }
    }
  },
  plugins: []
};
