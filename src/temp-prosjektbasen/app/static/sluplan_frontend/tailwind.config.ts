import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: "#7e57c2",
          dark: "#5e35b1"
        }
      }
    }
  },
  plugins: []
} satisfies Config;

