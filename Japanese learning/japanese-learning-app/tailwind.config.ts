import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx,mdx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        ink: "var(--ink)",
        "ink-2": "var(--ink-2)",
        "ink-3": "var(--ink-3)",
        paper: "var(--paper)",
        "paper-2": "var(--paper-2)",
        "paper-3": "var(--paper-3)",
        accent: "var(--accent)",
        "accent-soft": "var(--accent-soft)",
        moss: "var(--moss)",
        gold: "var(--gold)",
        indigo: "var(--indigo)",
      },
      fontFamily: {
        sans: ["var(--font-inter)", "ui-sans-serif", "system-ui", "sans-serif"],
        serif: [
          "var(--font-noto-serif-jp)",
          "Noto Serif JP",
          "ui-serif",
          "serif",
        ],
        mono: ["var(--font-jetbrains)", "ui-monospace", "monospace"],
        jp: [
          "var(--font-noto-serif-jp)",
          "Noto Serif JP",
          "Hiragino Mincho ProN",
          "Yu Mincho",
          "serif",
        ],
      },
      borderRadius: {
        sm: "4px",
        md: "6px",
        lg: "10px",
        xl: "16px",
      },
      boxShadow: {
        sm: "0 1px 2px rgba(28,23,20,.08)",
        md: "0 4px 12px rgba(28,23,20,.10)",
        hanko: "4px 4px 0 var(--ink)",
      },
      fontSize: {
        xs: ["11px", { lineHeight: "1.5" }],
        sm: ["13px", { lineHeight: "1.55" }],
        base: ["15px", { lineHeight: "1.6" }],
        lg: ["18px", { lineHeight: "1.5" }],
        xl: ["22px", { lineHeight: "1.45" }],
        "2xl": ["28px", { lineHeight: "1.3" }],
        "3xl": ["38px", { lineHeight: "1.2" }],
        display: ["64px", { lineHeight: "1.05" }],
      },
      spacing: {
        rail: "200px",
      },
    },
  },
  plugins: [],
};

export default config;
