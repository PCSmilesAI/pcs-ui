
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
  "./index.html",
  "./src/**/*.{js,jsx,ts,tsx}"
],
  ],
  theme: {
    extend: {
      colors: {
        primary: "#357ab2",
        secondary: "#a7c9e6",
        accent: "#74b4e4",
      },
      fontFamily: {
        sans: ['ui-sans-serif', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
