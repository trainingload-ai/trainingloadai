import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("FTP calculator page source", () => {
  it("keeps a typed field test, share card, and reference sections on one route", async () => {
    const client = await readFile(new URL("./client.tsx", import.meta.url), "utf8");
    const page = await readFile(new URL("./page.tsx", import.meta.url), "utf8");
    const css = await readFile(new URL("./ftp-calculator.module.css", import.meta.url), "utf8");

    expect(client.indexOf('t("manual.title")')).toBeGreaterThan(-1);
    expect(client.indexOf('t("manual.title")')).toBeLessThan(
      client.indexOf("<ToolFileDropzone"),
    );
    expect(client.indexOf("<ToolFileDropzone")).toBeLessThan(
      client.indexOf("<FtpShareCard"),
    );
    expect(client).toContain("estimateFieldFtp");
    expect(client).toContain("powerZonesHref");
    expect(client).toContain('id="result"');
    expect(client).toContain("window.print()");
    expect(client).toContain("navigator.clipboard.writeText");
    expect(client).toContain('const FTP_FILE_SPORT = "CYCLING" as const');
    expect(client).not.toContain('{ value: "ten_km"');
    expect(client).toContain('useState<EstimateCpTestType>("thirty_min")');
    expect(client).toContain("<TabsList");
    expect(client).toContain("<SelectTrigger");
    expect(client).toContain("<Input");
    expect(client).toContain('suffix="W"');
    expect(page).toContain("readProof");
    expect(client).toContain('role="radiogroup"');
    expect(client.indexOf('role="radiogroup"')).toBeLessThan(client.indexOf("<TabsList"));
    expect(client).toContain('t("manual.unitsMetric")');
    expect(client).toContain('t("fields.weightLb")');
    expect(client).toContain("bg-brand text-brand-foreground");
    expect(css).toContain("--ftp-accent: var(--brand)");
    expect(css).toContain("--ftp-canvas: var(--background)");
    expect(css).toContain("#94a3b8");
    expect(css).toContain("#3b82f6");
    expect(css).toContain("#10b981");
    expect(css).toContain("#f59e0b");
    expect(css).toContain("#ef4444");
    expect(css).toContain("#9333ea");
    expect(css).toContain("#ec4899");
    expect(client).toContain('useState<"field" | "file">("field")');
    expect(client).toContain("ftp-field-updated");
    expect(client).not.toContain("fileOpen");

    expect(page).toContain('tPage("title")');
    expect(page).toContain("sections.protocols.details");
    expect(page).toContain("sections.levels.rows");
    expect(page).toContain("ALLEN_COGGAN_FTP_CATEGORIES");
    expect(page).toContain("<FtpAppPromo");
    const promo = await readFile(new URL("./promo.tsx", import.meta.url), "utf8");
    expect(promo).toContain('toolId: "ftp_calculator"');
    expect(promo).toContain("/ftp-calculator/web-pmc.webp");
    expect(promo).toContain("/ftp-calculator/phone-zh.webp");
    expect(promo).toContain("/ftp-calculator/phone-en.webp");
    expect(promo).not.toMatch(/4\.8|★/);
    expect(page).toContain("<FtpTableHighlight");
    expect(page).toContain("data-band");
    expect(page).toContain("data-category");
    expect(page).toContain('data-sex="men"');
    expect(page).toContain('data-sex="women"');
    expect(page).not.toContain("sections.levels.note");
    expect(page).toContain("/power-zones-calculator");
    expect(page).toContain("/critical-power-calculator");
    expect(page).toContain("/lactate-threshold-calculator");
    expect(page).toContain("/tss-calculator");
    expect(page).toContain('detail.id !== "ten_km"');
    expect(page).not.toMatch(/-copy\.ts/);
    expect(page).not.toContain("sections.answer");
  });
});
