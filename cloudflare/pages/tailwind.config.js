/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        abyss: {
          50: "#e6f4fa",
          100: "#b3dff0",
          200: "#80cae6",
          300: "#4db5dc",
          400: "#1aa0d2",
          500: "#0087b9",
          600: "#006a91",
          700: "#004d69",
          800: "#003041",
          900: "#001319",
        },
      },
    },
  },
  plugins: [],
};
