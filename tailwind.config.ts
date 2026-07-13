import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          "Pretendard Variable",
          "Pretendard",
          "-apple-system",
          "BlinkMacSystemFont",
          "system-ui",
          "Roboto",
          "sans-serif",
        ],
      },
      colors: {
        brand: {
          50: "#eefbfa",
          100: "#d4f3f0",
          200: "#a9e7e1",
          300: "#75d3ca",
          400: "#42b8ad",
          500: "#209c92",
          600: "#177e77",
          700: "#166560",
          800: "#16514e",
          900: "#154442",
        },
        level: {
          normal: "#6b7280",
          interest: "#3b82f6",
          caution: "#f2b100",
          alert: "#f97316",
          severe: "#ef4444",
        },
      },
      boxShadow: {
        card: "0 1px 2px rgba(15, 23, 42, 0.04), 0 8px 24px -8px rgba(15, 23, 42, 0.10)",
        sheet: "0 -8px 30px -6px rgba(15, 23, 42, 0.18)",
      },
      borderRadius: {
        "2xl": "1.25rem",
        "3xl": "1.75rem",
      },
      keyframes: {
        pulseSoft: {
          "0%, 100%": { boxShadow: "0 0 0 0 rgba(32, 156, 146, 0.25)" },
          "50%": { boxShadow: "0 0 0 8px rgba(32, 156, 146, 0)" },
        },
        slideUp: {
          from: { transform: "translateY(16px)", opacity: "0" },
          to: { transform: "translateY(0)", opacity: "1" },
        },
      },
      animation: {
        "pulse-soft": "pulseSoft 2.2s ease-out 1",
        "slide-up": "slideUp 0.28s cubic-bezier(0.16, 1, 0.3, 1)",
      },
    },
  },
  plugins: [],
};

export default config;
