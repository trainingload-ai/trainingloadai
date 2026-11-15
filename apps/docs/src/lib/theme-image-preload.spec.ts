import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  new URL("../../public/theme-image-preload.js", import.meta.url),
  "utf8",
);
function preload({
  theme,
  systemDark = false,
  mobile = false,
  storageDenied = false,
}: {
  theme?: string;
  systemDark?: boolean;
  mobile?: boolean;
  storageDenied?: boolean;
}) {
  const links: Record<string, string>[] = [];
  runInNewContext(source, {
    localStorage: {
      getItem: () => {
        if (storageDenied) throw new Error("Storage unavailable");
        return theme;
      },
    },
    matchMedia: (query: string) => ({
      matches: query.includes("color-scheme") ? systemDark : mobile,
    }),
    document: {
      currentScript: {
        dataset: {
          desktopLight: "/desktop.webp 1x, /desktop-2x.webp 2x",
          desktopDark: "/desktop-dark.webp",
          mobileLight: "/mobile.webp",
          mobileDark: "/mobile-dark.webp",
        },
      },
      createElement: () => ({}),
      head: { append: (link: Record<string, string>) => links.push(link) },
    },
  });
  return links;
}

describe("critical screenshot preloading", () => {
  it.each([
    { theme: "dark", systemDark: false, expected: "/desktop-dark.webp" },
    { theme: "light", systemDark: true, expected: "/desktop.webp" },
  ])(
    "honors a persisted $theme override without preloading the system variant",
    ({ expected, ...options }) => {
      const links = preload(options);
      expect(links).toHaveLength(1);
      expect(links[0]).toMatchObject({
        href: expected,
        rel: "preload",
        as: "image",
        fetchPriority: "high",
      });
    },
  );
  it("keeps density candidates for the browser to choose", () => {
    expect(preload({ theme: "light" })[0]?.imageSrcset).toBe(
      "/desktop.webp 1x, /desktop-2x.webp 2x",
    );
  });
  it("falls back to the current system preference when storage is blocked", () => {
    expect(
      preload({ storageDenied: true, systemDark: true, mobile: true })[0]?.href,
    ).toBe("/mobile-dark.webp");
  });
});
