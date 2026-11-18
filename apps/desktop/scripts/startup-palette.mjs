const properties = [
  "background", "foreground", "muted-foreground", "border", "desktop-chrome",
  "desktop-workspace-radius", "tl-font-ui",
];
const inherited = new Set(["desktop-workspace-radius", "tl-font-ui"]);

/** Follow source order across imported theme colors and Client layout rules. */
function palette(css, selector, allowInherited = false) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const blocks = [...css.matchAll(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`, "g"))];
  if (!blocks.length) throw new Error(`Missing Core desktop palette: ${selector}`);
  const values = {};
  for (const [, body] of blocks) {
    for (const [, name, value] of body.matchAll(/--([\w-]+):\s*([^;]+);/g)) {
      if (properties.includes(name)) values[name] = value.trim();
    }
  }
  for (const name of properties) {
    if (!values[name] && !(allowInherited && inherited.has(name))) {
      throw new Error(`Missing Core desktop token: ${selector} --${name}`);
    }
  }
  return values;
}

export function desktopStartupPalettes(css) {
  const light = palette(css, ':root[data-desktop-self-host="true"]');
  const dark = { ...light, ...palette(css, ':root.dark[data-desktop-self-host="true"]', true) };
  return { light, dark };
}
