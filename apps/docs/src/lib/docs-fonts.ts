import localFont from "next/font/local";

// Keep the family names used by the shared design tokens. next/font owns the
// Latin files and their preload hints; Fontsource retains the optional
// Unicode faces, which are fetched only when their glyphs are needed.
const uiFont = localFont({
  src: "../../node_modules/@fontsource-variable/space-grotesk/files/space-grotesk-latin-wght-normal.woff2",
  variable: "--docs-ui-font",
  weight: "300 700",
  style: "normal",
  display: "swap",
  preload: true,
  adjustFontFallback: false,
  declarations: [
    { prop: "font-family", value: "'Space Grotesk Variable'" },
    {
      prop: "unicode-range",
      value:
        "U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD",
    },
  ],
});

const displayFont = localFont({
  src: "../../node_modules/@fontsource-variable/jost/files/jost-latin-wght-normal.woff2",
  variable: "--docs-display-font",
  weight: "100 900",
  style: "normal",
  display: "swap",
  preload: true,
  adjustFontFallback: false,
  declarations: [
    { prop: "font-family", value: "'Jost Variable'" },
    {
      prop: "unicode-range",
      value:
        "U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD",
    },
  ],
});

export const docsFontVariables = `${uiFont.variable} ${displayFont.variable}`;
