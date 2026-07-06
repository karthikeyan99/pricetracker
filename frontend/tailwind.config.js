/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        amazon: {
          orange: '#f97316',
          dark: '#131921',
          blue: '#232f3e',
        },
      },
    },
  },
  plugins: [],
};
