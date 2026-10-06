/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],

  theme: {
    extend: {
      colors: {
        ivory: "#F5F0E7",
        parchment: "#EDE5D8",

        charcoal: "#1F211F",
        muted: "#5E625E",

        forest: "#244A3A",
        "forest-deep": "#18352A",

        bronze: "#A47A45",
        "bronze-ink": "#795A32",
        "bronze-soft": "#C5A77A",

        border: "#D8D0C4",

        white: "#FFFFFF",
      },

      fontFamily: {
        serif: [
          "Cormorant Garamond",
          "Georgia",
          "serif",
        ],

        sans: [
          "Inter",
          "Arial",
          "Helvetica",
          "sans-serif",
        ],
      },

      fontSize: {
        "display-xl": [
          "6rem",
          {
            lineHeight: "0.95",
            letterSpacing: "-0.04em",
          },
        ],

        "display-lg": [
          "4.5rem",
          {
            lineHeight: "1",
            letterSpacing: "-0.035em",
          },
        ],

        "heading-xl": [
          "3.5rem",
          {
            lineHeight: "1.05",
            letterSpacing: "-0.025em",
          },
        ],

        "heading-lg": [
          "3rem",
          {
            lineHeight: "1.1",
            letterSpacing: "-0.02em",
          },
        ],

        "heading-md": [
          "2.25rem",
          {
            lineHeight: "1.15",
            letterSpacing: "-0.015em",
          },
        ],

        "verse-lg": [
          "2.5rem",
          {
            lineHeight: "1.25",
            letterSpacing: "-0.01em",
          },
        ],
      },

      maxWidth: {
        reading: "760px",
        verse: "720px",
        content: "1280px",
      },

      spacing: {
        "18": "4.5rem",
        "22": "5.5rem",
        "26": "6.5rem",
        "30": "7.5rem",
      },

      borderRadius: {
        soft: "6px",
      },

      boxShadow: {
        subtle: "0 2px 12px rgba(31, 33, 31, 0.05)",
      },

      transitionTimingFunction: {
        editorial: "cubic-bezier(0.22, 1, 0.36, 1)",
      },
    },
  },

  plugins: [],
}
