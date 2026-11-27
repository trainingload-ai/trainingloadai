import { palette } from "./palette.mjs";

export const schemaVersion = 1;

export const colors = {
  light: {
    background: "#F4F5F0",
    foreground: "#171A16",
    card: "#FFFFFF",
    // Client content cards use Neutral 100, clearly separated from the canvas and white cards.
    surface: palette["neutral-100"],
    surfaceStrong: palette["neutral-100"],
    surfacePressed: "#D8DDD2",
    track: "#D4D9CE",
    stateNeutral: palette["slate-300"],
    cardForeground: "#171A16",
    popover: "#FFFFFF",
    popoverForeground: "#171A16",
    primary: "#171A16",
    primaryForeground: "#FFFFFF",
    secondary: "#E9ECE4",
    secondaryForeground: "#2B3029",
    muted: "#DCE0D6",
    mutedForeground: "#4E554B",
    load: "#633CB8",
    accent: "#D9F2E3",
    accentForeground: "#153526",
    brand: "#20C77A",
    brandForeground: "#102319",
    brandSoft: "#D9F2E3",
    destructive: "#BD4E47",
    destructiveForeground: "#FFFFFF",
    success: "#237345",
    warning: "#946012",
    info: "#2E639B",
    border: "#C0C7B9",
    input: "#B2BBB0",
    ring: "#16865A",
    sidebar: "#E8EBE3",
    sidebarForeground: "#2B3029",
    sidebarAccent: "#20C77A",
    sidebarAccentForeground: "#102319",
    sidebarBorder: "#CDD3C6",
  },
  dark: {
    background: "#111312",
    foreground: "#F4F6F2",
    card: "#1C1F1D",
    // Precomposed Client muted/45 surface on dark background; no nested alpha layers on native.
    surface: "#1E221F",
    surfaceStrong: "#323834",
    surfacePressed: "#2A302C",
    track: "#2D332F",
    stateNeutral: palette["slate-300"],
    cardForeground: "#F4F6F2",
    popover: "#222724",
    popoverForeground: "#F4F6F2",
    primary: "#F4F6F2",
    primaryForeground: "#111312",
    secondary: "#252A27",
    secondaryForeground: "#ECEFE9",
    muted: "#2E3430",
    mutedForeground: "#B7BEB5",
    load: "#BFA9F8",
    accent: "#193F2D",
    accentForeground: "#D2F8E0",
    brand: "#20C77A",
    brandForeground: "#102319",
    brandSoft: "#193F2D",
    destructive: "#E87D76",
    destructiveForeground: "#111312",
    success: "#68D391",
    warning: "#DFA952",
    info: "#7BB0E6",
    border: "#39403C",
    input: "#474F4A",
    ring: "#3AD98E",
    sidebar: "#0B0D0C",
    sidebarForeground: "#ECEFE9",
    sidebarAccent: "#20C77A",
    sidebarAccentForeground: "#102319",
    sidebarBorder: "#323834",
  },
};

export const spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 12,
  four: 16,
  five: 20,
  six: 24,
  eight: 32,
  ten: 40,
  twelve: 48,
  sixteen: 64,
};

export const radii = {
  micro: 2,
  xs: 4,
  compact: 6,
  control: 8,
  lg: 10,
  controlLg: 10,
  surface: 12,
  overlay: 16,
  feature: 20,
  full: 999,
};

export const motion = {
  fast: 120,
  standard: 180,
  overlay: 220,
  page: 260,
};

export const chartColors = {
  actual: "#7C5CDA",
  planned: "#63A875",
  fitness: "#4C95B8",
  fatigue: "#8B6BC1",
  form: "#B18B4F",
  recovery: "#4E9A67",
  warning: "#C98B32",
  danger: "#D6645D",
};

export const typography = {
  webSans:
    "'Space Grotesk Variable', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', 'Noto Sans CJK SC', system-ui, sans-serif",
  webDisplay:
    "'Jost Variable', 'Space Grotesk Variable', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', 'Noto Sans CJK SC', system-ui, sans-serif",
  nativeSans: "system-ui",
  nativeMono: "ui-monospace",
};
