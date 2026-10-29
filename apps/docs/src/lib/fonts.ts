import localFont from "next/font/local";

export const inter = localFont({
  src: "../assets/fonts/InterVariable.woff2",
  variable: "--font-inter",
  weight: "100 900",
  style: "normal",
  display: "swap",
});

export const tiltWarp = localFont({
  src: "../assets/fonts/TiltWarp.woff2",
  weight: "400",
  style: "normal",
  display: "swap",
});
