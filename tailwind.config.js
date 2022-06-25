/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [ "./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      colors: {ui: {
        'gold': '#DFBD69',
        'gold2': '#daa520'
    }},
    },
  },
  plugins: [],
}
