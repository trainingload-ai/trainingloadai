/** Apply opacity to a configured hex color; works in native, SVG, canvas and maps. */
export function withAlpha(color, opacity) {
  const { r, g, b, a } = toRgb(color);
  const alpha = Math.max(0, Math.min(1, Number.isFinite(opacity) ? opacity : 1)) * a;
  return `rgba(${r},${g},${b},${alpha})`;
}

export function toRgb(color) {
  const match = /^#([\da-f]{3,4}|[\da-f]{6}|[\da-f]{8})$/i.exec(color);
  if (!match) throw new TypeError('Expected a configured hex color');
  const value = match[1].length <= 4 ? [...match[1]].map(channel => channel + channel).join('') : match[1];
  const channels = [0, 2, 4].map(index => Number.parseInt(value.slice(index, index + 2), 16));
  return { r: channels[0], g: channels[1], b: channels[2], a: value.length === 8 ? Number.parseInt(value.slice(6), 16) / 255 : 1 };
}
