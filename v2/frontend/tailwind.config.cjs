module.exports = {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: { 50: "#eff5ff", 100: "#dbe8ff", 500: "#3168df", 600: "#2354c1", 700: "#153a9e", 900: "#102451" },
      },
      fontFamily: { sans: ["Inter", "system-ui", "sans-serif"] },
    },
  },
  plugins: [],
};
