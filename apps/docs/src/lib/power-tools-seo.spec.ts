import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("power tool SEO ownership", () => {
  it("locks FTP, CP, and power-zone calculator heads in the keyword map", async () => {
    const source = await readFile(
      new URL("../../../../../SEO_KEYWORD_MAP.md", import.meta.url),
      "utf8",
    );

    expect(source).toMatch(
      /\| `\/ftp-calculator`\s+\|[^|]+\|\s+FTP calculator\s+\|/,
    );
    expect(source).toContain(
      "FTP Calculator | 20-Min, Ramp Test, W/kg & Zones",
    );
    expect(source).toContain("cycling FTP calculator");
    expect(source).toContain("×0.95");
    expect(source).toContain("FTP 计算器");
    expect(source).toContain("FTP計算機");
    expect(source).toContain("FTP 計算器");

    expect(source).toMatch(
      /\| `\/critical-power-calculator`\s+\|[^|]+\|\s+critical power calculator\s+\|/,
    );
    expect(source).toContain("Critical Power Calculator | CP & W′ from 2–3 Efforts");
    expect(source).toContain("临界功率计算器");
    expect(source).toContain("クリティカルパワー計算機");
    expect(source).toContain("臨界功率計算器");

    expect(source).toMatch(
      /\| `\/power-zones-calculator`\s+\|[^|]+\|\s+power zones calculator\s+\|/,
    );
    expect(source).toContain("Power Zones Calculator | FTP, Coggan & 7 Zones");
    expect(source).toContain("cycling power zones calculator");
    expect(source).toContain("power zone calculator");
    expect(source).toContain("功率区间计算器");
    expect(source).toContain("パワーゾーン計算機");
    expect(source).toContain("功率區間計算器");
  });

  it("keeps race-distance overlay files out of these calculator pages", async () => {
    const files = [
      "../app/[lang]/(home)/ftp-calculator/page.tsx",
      "../app/[lang]/(home)/critical-power-calculator/page.tsx",
      "../app/[lang]/(home)/power-zones-calculator/page.tsx",
    ];
    for (const file of files) {
      const source = await readFile(new URL(file, import.meta.url), "utf8");
      expect(source).not.toMatch(/-copy\.ts/);
    }
  });
});
