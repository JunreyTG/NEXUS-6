/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./index.html", "./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        "nexus-bg": "#070B14",
        "nexus-panel": "#0D1323",
        "nexus-cyan": "#38D5FF",
        "nexus-green": "#7CFFB2",
        "nexus-muted": "#9AA8C7"
      },
      fontFamily: {
        display: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"]
      }
    }
  },
  plugins: []
};
