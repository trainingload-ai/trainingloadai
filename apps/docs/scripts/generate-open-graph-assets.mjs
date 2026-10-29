import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const currentDir = dirname(fileURLToPath(import.meta.url));
const outputDir = resolve(currentDir, "../public/og");

const assets = {
  converter: {
    kicker: "FILE TOOL",
    title: ["GPX / FIT / TCX", "Converter"],
    description: "Convert workout files for training platforms",
    screenTitle: "File converter",
    metric: "FIT",
    unit: "READY",
    detail: "Route and activity data preserved",
    preview: "file",
    tabs: ["GPX", "FIT", "TCX"],
  },
  "critical-power-calculator": {
    kicker: "POWER TOOL",
    title: ["Critical Power", "Calculator"],
    description: "Estimate CP and W' from test efforts",
    screenTitle: "Critical power model",
    metric: "312",
    unit: "W CP",
    detail: "Model fitted from your best efforts",
    preview: "power",
    tabs: ["CP", "W'", "CURVE"],
  },
  "estimate-cp": {
    kicker: "FREE TOOL",
    title: ["CP / FTP", "Estimator"],
    description: "Estimate CP, FTP, and W' from activity files",
    screenTitle: "Power model",
    metric: "294",
    unit: "W CP",
    detail: "Calculated from uploaded activities",
    preview: "power",
    tabs: ["CP", "FTP", "W'"],
  },
  "fit-course-converter": {
    kicker: "ROUTE TOOL",
    title: ["FIT Course", "Converter"],
    description: "Turn routes into device-ready course files",
    screenTitle: "Course preview",
    metric: "42.6",
    unit: "KM",
    detail: "Elevation and course points preserved",
    preview: "route",
    tabs: ["GPX", "TCX", "FIT"],
  },
  "fit-file-viewer": {
    kicker: "LOCAL TOOL",
    title: ["FIT File Viewer", "Online"],
    description: "Open Garmin FIT files locally in your browser",
    screenTitle: "Activity.fit",
    metric: "25",
    unit: "MB MAX",
    detail: "Parsed locally · No upload",
    preview: "viewer",
    tabs: ["HEADER", "CRC", "MESSAGES"],
  },
  "fit-file-viewer-zh": {
    kicker: "本地工具",
    title: ["FIT 文件", "在线查看"],
    description: "在浏览器本地打开 Garmin FIT 文件",
    screenTitle: "活动文件.fit",
    metric: "25",
    unit: "MB 上限",
    detail: "本地解析 · 无需上传",
    preview: "viewer",
    tabs: ["文件头", "CRC", "消息"],
  },
  "fit-file-viewer-zh-hant": {
    kicker: "本機工具",
    title: ["FIT 檔案", "線上查看"],
    description: "在裝置內解析 FIT 檔案，無需上傳",
    screenTitle: "活動檔案.fit",
    metric: "25",
    unit: "MB 上限",
    detail: "本機解析 · 無需上傳",
    preview: "viewer",
    tabs: ["檔頭", "CRC", "訊息"],
  },
  "fit-file-viewer-ja": {
    kicker: "ローカルツール",
    title: ["FITファイルを", "オンラインで表示"],
    description: "端末内で解析。アップロード不要。",
    screenTitle: "アクティビティ.fit",
    metric: "25",
    unit: "MB 上限",
    detail: "端末内で解析 · 通信なし",
    preview: "viewer",
    tabs: ["ヘッダー", "CRC", "メッセージ"],
  },
  "ftp-calculator": {
    kicker: "FREE TOOL",
    title: ["FTP Calculator"],
    description: "Estimate FTP, CP, and W' from activity files",
    screenTitle: "Power model",
    metric: "294",
    unit: "W FTP",
    detail: "Calculated from your power curve",
    preview: "power",
    tabs: ["FTP", "CP", "W'"],
  },
  "heart-rate-zones-calculator": {
    kicker: "FREE TOOL",
    title: ["Heart Rate Zones", "Calculator"],
    description: "Karvonen / LTHR / Max HR zone models",
    screenTitle: "Heart rate zones",
    metric: "168",
    unit: "BPM LTHR",
    detail: "Five personalized training zones",
    preview: "zones",
    tabs: ["HRR", "LTHR", "MAX HR"],
  },
  "lactate-threshold-calculator": {
    kicker: "THRESHOLD TOOL",
    title: ["Lactate Threshold", "Calculator"],
    description: "Estimate threshold pace, power, and heart rate",
    screenTitle: "Threshold profile",
    metric: "4:08",
    unit: "/KM",
    detail: "Steady-hard intensity anchor",
    preview: "threshold",
    tabs: ["PACE", "POWER", "HR"],
  },
  "max-heart-rate-calculator": {
    kicker: "HEART RATE TOOL",
    title: ["Max Heart Rate", "Calculator"],
    description: "Estimate HRmax and training zones",
    screenTitle: "Heart rate estimate",
    metric: "188",
    unit: "BPM HRMAX",
    detail: "Compare proven estimation formulas",
    preview: "zones",
    tabs: ["FORMULA", "ZONES", "BPM"],
  },
  "power-zones-calculator": {
    kicker: "FREE TOOL",
    title: ["Power Zones", "Calculator"],
    description: "FTP / CP zones for running and cycling",
    screenTitle: "Power zones",
    metric: "286",
    unit: "W FTP",
    detail: "Six actionable intensity ranges",
    preview: "zones",
    tabs: ["FTP", "CP", "WATTS"],
  },
  "vdot-calculator": {
    kicker: "RUNNING TOOL",
    title: ["VDOT Calculator"],
    description: "Race result, training paces, and predictions",
    screenTitle: "Race predictions",
    metric: "52",
    unit: "VDOT",
    detail: "Training paces matched to fitness",
    preview: "pace",
    tabs: ["EASY", "TEMPO", "INTERVAL"],
  },
  "running-pace-calculator": {
    kicker: "RUNNING TOOL",
    title: ["Running Pace", "Calculator"],
    description: "Pace, time, distance, and even-split charts",
    screenTitle: "Pace conversion",
    metric: "5:00",
    unit: "/KM",
    detail: "Even-split marathon chart included",
    preview: "pace",
    tabs: ["PACE", "TIME", "DISTANCE"],
  },
  "race-time-predictor": {
    kicker: "RUNNING TOOL",
    title: ["Race Time", "Predictor"],
    description: "5K, 10K, half, and marathon finish times",
    screenTitle: "Finish times",
    metric: "3:49",
    unit: "MARATHON",
    detail: "Daniels VDOT from a recent race",
    preview: "pace",
    tabs: ["5K", "HALF", "MARATHON"],
  },
  "tss-calculator": {
    kicker: "LOAD TOOL",
    title: ["TSS Calculator"],
    description: "Training Stress Score from NP, FTP, and duration",
    screenTitle: "Session load",
    metric: "100",
    unit: "TSS",
    detail: "One hour at FTP = 100 TSS",
    preview: "power",
    tabs: ["NP", "IF", "TSS"],
  },
  "css-calculator": {
    kicker: "SWIM TOOL",
    title: ["CSS Calculator"],
    description: "Critical swim speed from two timed distances",
    screenTitle: "CSS pace",
    metric: "1:45",
    unit: "/100M",
    detail: "400 / 200 timed swims",
    preview: "pace",
    tabs: ["400", "200", "CSS"],
  },
  "training-load-calculator": {
    kicker: "PMC TOOL",
    title: ["Training Load", "Calculator"],
    description: "CTL, ATL, and TSB from a week of TSS",
    screenTitle: "Load projection",
    metric: "−7.6",
    unit: "TSB",
    detail: "42-day CTL · 7-day ATL",
    preview: "dashboard",
    tabs: ["CTL", "ATL", "TSB"],
  },
  "workout-editor": {
    kicker: "WORKOUT TOOL",
    title: ["Workout Editor", "& Builder"],
    description: "Structured endurance sessions in the browser",
    screenTitle: "Session preview",
    metric: "5x3",
    unit: "MIN",
    detail: "Warm-up, intervals, cooldown",
    preview: "zones",
    tabs: ["SPORT", "STEPS", "DSL"],
  },
  "vo2max-calculator": {
    kicker: "AEROBIC TOOL",
    title: ["VO₂ Max", "Calculator"],
    description: "Cooper, Rockport, and Beep test estimates",
    screenTitle: "Aerobic fitness",
    metric: "54.2",
    unit: "ML/KG/MIN",
    detail: "High aerobic fitness",
    preview: "oxygen",
    tabs: ["COOPER", "ROCKPORT", "BEEP"],
  },
};

const escapeXml = (value) =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

const text = (value, x, y, options = {}) => {
  const {
    size = 18,
    weight = 500,
    fill = "#111827",
    anchor = "start",
    spacing = 0,
    opacity = 1,
  } = options;
  return `<text x="${x}" y="${y}" fill="${fill}" fill-opacity="${opacity}" font-family="Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Noto Sans SC', 'Noto Sans JP', Arial, sans-serif" font-size="${size}" font-weight="${weight}" text-anchor="${anchor}" letter-spacing="${spacing}">${escapeXml(value)}</text>`;
};

function barsPreview(type) {
  if (type === "pace") {
    return [
      ["5K", "18:42", 0.88],
      ["10K", "38:52", 0.76],
      ["21K", "1:26", 0.64],
    ]
      .map(([label, value, width], index) => {
        const y = 120 + index * 55;
        return `<rect x="28" y="${y}" width="430" height="38" rx="12" fill="#F1F5F4"/>
          <rect x="28" y="${y}" width="${430 * width}" height="38" rx="12" fill="url(#bar)"/>
          ${text(label, 48, y + 26, { size: 14, weight: 800 })}
          ${text(value, 438, y + 26, { size: 15, weight: 700, anchor: "end" })}`;
      })
      .join("");
  }

  const labels = type === "zones" ? ["Z1", "Z2", "Z3", "Z4", "Z5"] : ["EASY", "STEADY", "HARD"];
  return labels
    .map((label, index) => {
      const y = 116 + index * (type === "zones" ? 35 : 52);
      const widths = type === "zones" ? [235, 292, 342, 385, 420] : [260, 335, 405];
      const colors = ["#D8F99D", "#A7F3D0", "#67E8F9", "#5EEAD4", "#2DD4BF"];
      return `<rect x="28" y="${y}" width="${widths[index]}" height="24" rx="8" fill="${colors[index]}"/>
        ${text(label, 39, y + 17, { size: 11, weight: 900, fill: "#0B241E" })}`;
    })
    .join("");
}

function mainVisualization(asset) {
  if (["zones", "pace"].includes(asset.preview)) return barsPreview(asset.preview);

  if (asset.preview === "route") {
    return `<rect x="28" y="110" width="430" height="152" rx="18" fill="#E7F1EE"/>
      <path d="M54 224C95 190 90 145 139 157C188 169 197 219 245 196C292 173 302 126 355 140C388 149 408 122 438 126" fill="none" stroke="#D1D9D6" stroke-width="18" stroke-linecap="round"/>
      <path d="M54 224C95 190 90 145 139 157C188 169 197 219 245 196C292 173 302 126 355 140C388 149 408 122 438 126" fill="none" stroke="url(#bar)" stroke-width="6" stroke-linecap="round"/>
      <circle cx="54" cy="224" r="9" fill="#00BFA5" stroke="#fff" stroke-width="4"/>
      <circle cx="438" cy="126" r="9" fill="#0B241E" stroke="#fff" stroke-width="4"/>`;
  }

  if (asset.preview === "file" || asset.preview === "viewer") {
    return `<rect x="28" y="112" width="430" height="80" rx="18" fill="#F0F5F3" stroke="#DCE7E3"/>
      <circle cx="64" cy="152" r="19" fill="#CCFBF1"/>
      <path d="M57 152L63 158L73 145" fill="none" stroke="#009F8E" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
      ${text(asset.screenTitle, 96, 146, { size: 16, weight: 800 })}
      ${text("Validated and ready", 96, 170, { size: 13, fill: "#64748B" })}
      <rect x="28" y="212" width="130" height="50" rx="14" fill="#E8EFED"/>
      <rect x="178" y="212" width="130" height="50" rx="14" fill="#E8EFED"/>
      <rect x="328" y="212" width="130" height="50" rx="14" fill="#E8EFED"/>`;
  }

  if (asset.preview === "oxygen") {
    return `<path d="M95 235A128 128 0 0 1 351 235" fill="none" stroke="#E5ECEA" stroke-width="28" stroke-linecap="round"/>
      <path d="M95 235A128 128 0 0 1 326 159" fill="none" stroke="url(#bar)" stroke-width="28" stroke-linecap="round"/>
      <circle cx="326" cy="159" r="9" fill="#fff" stroke="#00BFA5" stroke-width="5"/>
      ${text("AEROBIC CAPACITY", 223, 236, { size: 13, weight: 800, fill: "#64748B", anchor: "middle", spacing: 1.5 })}`;
  }

  const threshold = asset.preview === "threshold";
  return `<rect x="28" y="110" width="430" height="152" rx="18" fill="#F3F6F5"/>
    <path d="M48 230C93 215 124 185 166 198C209 211 230 158 274 172C322 187 351 134 438 132" fill="none" stroke="#D9E3E0" stroke-width="5" stroke-linecap="round"/>
    <path d="M48 229C92 218 126 195 170 184C212 173 246 168 282 151C330 128 370 127 438 124" fill="none" stroke="url(#bar)" stroke-width="7" stroke-linecap="round"/>
    ${threshold ? '<path d="M285 124V240" stroke="#0F766E" stroke-width="2" stroke-dasharray="6 7"/><circle cx="285" cy="151" r="9" fill="#fff" stroke="#0F766E" stroke-width="5"/>' : ""}
    ${text("3 min", 48, 250, { size: 11, fill: "#64748B" })}
    ${text("20 min", 438, 250, { size: 11, fill: "#64748B", anchor: "end" })}`;
}

function miniPanel(asset) {
  if (asset.preview === "dashboard") {
    const days = Array.from({ length: 21 }, (_, index) => {
      const x = 28 + (index % 7) * 52;
      const y = 86 + Math.floor(index / 7) * 44;
      const active = [8, 9, 15, 16, 17, 18].includes(index);
      return `<rect x="${x}" y="${y}" width="42" height="34" rx="8" fill="${active ? "#C9F7E7" : "#F1F5F4"}"/>
        ${text(index + 1, x + 10, y + 21, { size: 10, weight: 700, fill: active ? "#087F70" : "#64748B" })}`;
    }).join("");
    return `${text("TRAINING CALENDAR", 28, 50, { size: 12, weight: 900, fill: "#64748B", spacing: 2 })}${days}
      <rect x="410" y="86" width="118" height="122" rx="16" fill="#F1F5F4"/>
      ${text("THIS WEEK", 430, 112, { size: 10, weight: 900, fill: "#64748B", spacing: 1.5 })}
      ${text("6h 42m", 430, 151, { size: 25, weight: 850 })}
      ${text("+8% load", 430, 181, { size: 13, weight: 700, fill: "#009F8E" })}`;
  }

  const chips = asset.tabs
    .map((label, index) => {
      const x = 28 + index * 167;
      const fills = ["#C9F7E7", "#D9F99D", "#CFFAFE"];
      return `<rect x="${x}" y="186" width="145" height="43" rx="13" fill="${fills[index]}"/>
        ${text(label, x + 72.5, 213, { size: label.length > 8 ? 11 : 13, weight: 900, fill: "#0B241E", anchor: "middle" })}`;
    })
    .join("");
  return `${text("RESULT", 28, 48, { size: 12, weight: 900, fill: "#64748B", spacing: 2 })}
    ${text(asset.metric, 28, 105, { size: asset.metric.length > 4 ? 42 : 52, weight: 900 })}
    ${text(asset.unit, 180, 102, { size: 14, weight: 850, fill: "#0F766E" })}
    ${text(asset.detail, 28, 143, { size: 15, fill: "#64748B" })}
    ${chips}`;
}

function createSvg(asset) {
  const titleSize = asset.title.some((line) => line.length > 19) ? 51 : 58;
  const titleStart = asset.title.length === 1 ? 286 : 258;
  const titleMarkup = asset.title
    .map((line, index) => text(line, 68, titleStart + index * 66, { size: titleSize, weight: 900, fill: "#F8FAFC", spacing: -1.8 }))
    .join("");
  const descriptionY = titleStart + asset.title.length * 66 + 28;

  return `<svg width="1200" height="630" viewBox="0 0 1200 630" fill="none" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="background" x1="0" y1="0" x2="1200" y2="630" gradientUnits="userSpaceOnUse">
      <stop stop-color="#020706"/><stop offset="0.58" stop-color="#03120F"/><stop offset="1" stop-color="#05231E"/>
    </linearGradient>
    <radialGradient id="glow" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(946 144) rotate(132) scale(570 460)">
      <stop stop-color="#00BFA5" stop-opacity="0.22"/><stop offset="0.7" stop-color="#00BFA5" stop-opacity="0.04"/><stop offset="1" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="logo" x1="14" y1="18" x2="88" y2="82" gradientUnits="userSpaceOnUse">
      <stop stop-color="#00DDB0"/><stop offset="1" stop-color="#009689"/>
    </linearGradient>
    <linearGradient id="bar" x1="28" y1="0" x2="458" y2="0" gradientUnits="userSpaceOnUse">
      <stop stop-color="#B8F34B"/><stop offset="0.55" stop-color="#56DDA4"/><stop offset="1" stop-color="#20CDBB"/>
    </linearGradient>
    <filter id="shadow" x="-25%" y="-25%" width="150%" height="170%" color-interpolation-filters="sRGB">
      <feDropShadow dx="0" dy="24" stdDeviation="25" flood-color="#000000" flood-opacity="0.42"/>
    </filter>
    <filter id="softShadow" x="-25%" y="-25%" width="150%" height="170%" color-interpolation-filters="sRGB">
      <feDropShadow dx="0" dy="18" stdDeviation="20" flood-color="#001D17" flood-opacity="0.30"/>
    </filter>
    <clipPath id="mainClip"><rect x="0" y="0" width="514" height="326" rx="22"/></clipPath>
  </defs>

  <rect width="1200" height="630" fill="url(#background)"/>
  <rect width="1200" height="630" fill="url(#glow)"/>
  <g opacity="0.14" fill="none" stroke="#78D8C4" stroke-width="1.5">
    <path d="M-95 77C35 12 92 117 226 51C353 -12 424 83 552 28C697 -34 764 87 909 23C1038 -34 1110 41 1268 -22"/>
    <path d="M-105 111C35 39 96 146 236 76C367 11 435 111 568 52C714 -13 784 112 928 47C1053 -10 1127 68 1282 2"/>
    <path d="M-98 532C42 466 104 567 242 500C375 436 444 536 580 478C727 415 797 535 941 472C1077 412 1135 492 1292 426"/>
    <path d="M-103 566C36 497 108 603 249 531C385 462 451 570 589 510C736 446 808 566 951 505C1087 447 1147 526 1298 461"/>
  </g>
  <path d="M-70 521C66 476 128 512 247 458C364 405 446 461 573 392C701 322 754 332 860 278C988 212 1070 231 1277 143" fill="none" stroke="#12B8A1" stroke-opacity="0.22" stroke-width="2"/>
  <g opacity="0.36">
    <circle cx="75" cy="491" r="5" fill="#20CDBB"/><circle cx="248" cy="458" r="5" fill="#20CDBB"/><circle cx="574" cy="392" r="5" fill="#20CDBB"/><circle cx="860" cy="278" r="5" fill="#20CDBB"/>
  </g>

  <g transform="translate(62 52) scale(.64)">
    <path d="M20 18H76L72 30H64L60 42H56L40 82H18L22 70H26L30 58H34L38 46H42L46 34H14L16 28H20Z" fill="url(#logo)"/>
    <path d="M68 42H74V50H72V58H68V66H64V70H88L86 76H82L80 82H46L50 70H54V62H58V54H62V46H68Z" fill="url(#logo)"/>
  </g>
  ${text("TrainingLoad.ai", 126, 92, { size: 28, weight: 850, fill: "#F8FAFC", spacing: -0.7 })}
  ${text(asset.kicker, 68, 197, { size: 15, weight: 900, fill: "#36E0BD", spacing: 3.2 })}
  ${titleMarkup}
  ${text(asset.description, 68, descriptionY, { size: 20, fill: "#BCD0CB" })}
  <rect x="68" y="${descriptionY + 38}" width="58" height="4" rx="2" fill="#00DDB0"/>
  ${text("trainingload.ai", 68, 576, { size: 15, weight: 750, fill: "#88AAA2", spacing: 0.7 })}

  <g transform="translate(640 48) rotate(-2 257 163)" filter="url(#shadow)">
    <rect width="514" height="326" rx="22" fill="#FDFEFE"/>
    <g clip-path="url(#mainClip)">
      <rect width="514" height="62" fill="#F7F9F8"/>
      <circle cx="28" cy="31" r="5" fill="#00BFA5"/>
      ${text("TrainingLoad.ai", 44, 37, { size: 13, weight: 850 })}
      <circle cx="442" cy="31" r="4" fill="#CBD5D1"/><circle cx="462" cy="31" r="4" fill="#CBD5D1"/><circle cx="482" cy="31" r="4" fill="#CBD5D1"/>
      ${text(asset.screenTitle, 28, 94, { size: 18, weight: 850 })}
      ${mainVisualization(asset)}
    </g>
  </g>

  <g transform="translate(628 328) rotate(1.4 282 126)" filter="url(#softShadow)">
    <rect width="565" height="252" rx="22" fill="#FFFFFF"/>
    ${miniPanel(asset)}
  </g>
  <rect width="1200" height="630" fill="none" stroke="#FFFFFF" stroke-opacity="0.05"/>
</svg>`;
}

await mkdir(outputDir, { recursive: true });

for (const [name, asset] of Object.entries(assets)) {
  const svg = createSvg(asset).replace(/[ \t]+$/gm, "");
  const svgPath = resolve(outputDir, `${name}.svg`);
  const pngPath = resolve(outputDir, `${name}.png`);
  await writeFile(svgPath, `${svg}\n`, "utf8");
  await sharp(Buffer.from(svg)).png({ compressionLevel: 9, palette: true }).toFile(pngPath);
  console.log(`${name}: ${svgPath} -> ${pngPath}`);
}

const squareBrandCardPath = resolve(outputDir, "brand-card-square.png");
const squareBrandCardSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600" viewBox="0 0 600 600">
  <defs>
    <linearGradient id="brand-gradient" x1="20" y1="18" x2="86" y2="82" gradientUnits="userSpaceOnUse">
      <stop stop-color="#00DDB0"/>
      <stop offset="1" stop-color="#009689"/>
    </linearGradient>
  </defs>
  <rect width="600" height="600" fill="#FFFFFF"/>
  <g transform="translate(52 245) scale(1.1)" fill="url(#brand-gradient)">
    <path d="M20 18H76L72 30H64L60 42H56L40 82H18L22 70H26L30 58H34L38 46H42L46 34H14L16 28H20Z"/>
    <path d="M68 42H74V50H72V58H68V66H64V70H88L86 76H82L80 82H46L50 70H54V62H58V54H62V46H68Z"/>
  </g>
  ${text("Trainingload.ai", 175, 319, { size: 54, weight: 850, fill: "#080B0B", spacing: -1.8 })}
</svg>`;

await sharp(Buffer.from(squareBrandCardSvg))
  .png({ compressionLevel: 9 })
  .toFile(squareBrandCardPath);

console.log(`brand card: ${squareBrandCardPath}`);
