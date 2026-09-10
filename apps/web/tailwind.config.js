/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        ink: '#0f1c18',
        moss: '#1f4d3a',
        leaf: '#3d8b6e',
        mist: '#e8f2ec',
        sand: '#f7f3eb',
        ember: '#c45c26',
      },
      fontFamily: {
        display: ['"Fraunces"', 'Georgia', 'serif'],
        sans: ['"Source Sans 3"', 'Segoe UI', 'sans-serif'],
      },
      boxShadow: {
        soft: '0 18px 50px rgba(15, 28, 24, 0.08)',
      },
    },
  },
  plugins: [],
};
