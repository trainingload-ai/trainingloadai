import { palette } from './palette.mjs';

/** Fixed domain and artwork colors; UI surfaces/text belong to colors.light/dark. */
export const visualColors = {
  providers: {
    garmin: '#007DC3', strava: '#FC4C02', polar: '#D71920',
    intervals: '#5856D6', coros: '#FF5A1F', suunto: '#E32636', wahoo: '#0068A5',
    google: { yellow: '#FFC107', red: '#FF3D00', green: '#4CAF50', blue: '#1976D2' },
  },
  system: {
    blue: '#007AFF', blueDark: '#0A84FF', cyan: '#64D2FF', indigo: '#5856D6',
    indigoDark: '#5E5CE6', purple: '#AF52DE', purpleDark: '#BF5AF2',
    orange: '#FF9500', orangeDark: '#FF9F0A', red: '#FF3B30', redDark: '#FF453A',
    green: '#34C759', greenDark: '#30D158', pink: '#FF2D55', sleepRem: '#32ADE6',
  },
  assessment: { accent: '#009689', accentDark: '#00BC7D' },
  metric: { heartRate: '#DC3545', flightRatio: '#7C6F1E' },
  recording: {
    background: '#161A19', surface: '#292D2B', foreground: '#F1F6EB', muted: '#A1A9A2',
    line: '#343C37', completed: '#20372B', currentBorder: '#547E68',
    paused: '#F5B66F', pausedSurface: '#3B3022', activeSurface: '#173B2D',
    accent: '#00BC7D', targetBand: '#2FC6B5', belowTargetBand: palette['sky-400'],
    aboveTargetBand: palette['orange-500'], warning: '#F4695E',
  },
  artwork: {
    mapDark: '#090C0B', coachDark: '#080B09', storyDark: '#161918',
    sheetDark: '#202221', insetDark: '#151817', cautionDark: '#382C20',
    muted: '#8E9690', previewSurface: '#383D3A', previewBorder: '#727A74', scrollEdgeDark: '#2A2E2C',
  },
  thumbnail: {
    cycling: { light: '#748392', dark: '#9BAEC1' },
    water: { light: '#6F8C90', dark: '#8EB4B9' },
    strength: { light: '#8D7B6D', dark: '#B9A38F' },
    flexibility: { light: '#877E91', dark: '#AAA0B7' },
    endurance: { light: '#6F877B', dark: '#91AD9E' },
  },
  review: {
    accent: '#4B8B70', accentDark: '#91C9AF', icon: '#3F8067', iconDark: '#9BCDB7',
    title: '#326C56', titleDark: '#A4D5BF', background: '#EDF6F1', backgroundDark: '#1C2722',
    quoteDark: '#8FC3AC', gradientStart: '#75B99B', gradientStartDark: '#70BD98',
    gradientEnd: '#80B9A1', gradientEndDark: '#528C72', diagramFill: '#8FC9AE',
  },
  poster: {
    surface: '#EEF2EF', surfaceDark: '#17201D', grid: '#DFE7E1', gridDark: '#2B3632',
    mutedDark: '#A3A6AA',
  },
  vip: {
    background: '#F8F4E8', backgroundDark: '#242117', pressed: '#F2EAD8', pressedDark: '#2D281A',
    accent: '#B99A58', accentDark: '#D5B86F', border: '#E4D9BD', borderDark: '#493F27',
    foreground: '#826B38', foregroundDark: '#E0C680', arrow: '#9B8046',
  },
  speech: { accent: '#4F7CFF', waveform: '#5D85FF' },
  map: {
    focus: '#2F7D61',
    activity: ['#DE813B', '#43A18A', '#223B4A', '#BA8E41', '#D97B2D', '#9B62A4', '#2590BC', '#45974D', '#E8D060', '#502A5A'],
  },
  cycle: { base: '#F5B619', inactive: '#B8C2CE' },
  heatmap: { emptyDark: '#333631', skeletonDark: '#343832', label: '#A5A69F' },
  editor: {
    "gray": "#808080",
    "textBrown": "hsl(25 95% 53%)",
    "textOrange": "hsl(24 95% 53%)",
    "textYellow": "hsl(48 96% 53%)",
    "textGreen": "hsl(160.1 84.1% 39.4%)",
    "textPurple": "hsl(269 97% 58%)",
    "textPink": "hsl(336 80% 58%)",
    "textRed": "hsl(0 84% 60%)",
    "highlightBrown": "hsl(43 96% 96%)",
    "highlightOrange": "hsl(33 100% 96%)",
    "highlightYellow": "hsl(54 100% 96%)",
    "highlightGreen": "hsl(142 71% 96%)",
    "highlightPurple": "hsl(269 97% 96%)",
    "highlightPink": "hsl(336 80% 96%)",
    "highlightRed": "hsl(0 84% 96%)"
},
  canvas: { axis: '#666666', grid: '#999999' },
  integration: { rechartsGrid: '#ccc', rechartsWhite: '#fff' },
  zones: [palette['slate-400'], palette['blue-500'], palette['emerald-500'], palette['amber-500'], palette['red-500'], palette['purple-600'], palette['pink-500']].map(color => color.toLowerCase()),
  recordingZones: ['sky-400', 'green-400', 'yellow-400', 'orange-400', 'red-400'].map(name => palette[name].toLowerCase()),
  workoutStep: Object.fromEntries(Object.entries({
    WARMUP: palette['blue-400'], WORK: palette['indigo-500'], RECOVERY: palette['emerald-300'],
    REST: palette['slate-400'], COOLDOWN: palette['cyan-500'], OTHER: palette['violet-500'],
  }).map(([key, value]) => [key, value.toLowerCase()])),
};

/** Native system colors retain Apple's adaptive rendering, shared by Watch and widgets. */
export const appleSystemColors = ['white', 'black', 'mint', 'orange', 'red', 'green', 'blue', 'yellow', 'cyan', 'pink', 'purple', 'indigo'];

/** Desktop Self-host chrome is a separate, deliberately neutral theme variant. */
export const desktopColors = {
  light: {
    background: '#FFFFFF', foreground: '#242424', card: '#F7F7F7', cardForeground: '#242424',
    popover: '#FFFFFF', popoverForeground: '#242424', muted: '#EDEDED', mutedForeground: '#707070',
    accent: '#E8E8E8', accentForeground: '#242424', border: '#E4E4E4', input: '#D8D8D8',
    sidebar: '#F7F7F7', sidebarForeground: '#303030', sidebarAccent: '#E5E5E5',
    sidebarAccentForeground: '#242424', sidebarBorder: '#E4E4E4', desktopChrome: '#F0F0F0',
    desktopRailSelected: '#DEDEDE',
  },
  dark: {
    background: '#191919', foreground: '#E8E8E8', card: '#222222', cardForeground: '#E8E8E8',
    popover: '#282828', popoverForeground: '#E8E8E8', muted: '#303030', mutedForeground: '#A0A0A0',
    accent: '#343434', accentForeground: '#F0F0F0', border: '#303030', input: '#424242',
    sidebar: '#222222', sidebarForeground: '#DFDFDF', sidebarAccent: '#343434',
    sidebarAccentForeground: '#F2F2F2', sidebarBorder: '#303030', desktopChrome: '#292929',
    desktopRailSelected: '#3B3B3B',
  },
};
