import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./CustomHeader.tsx", import.meta.url), "utf8");

describe("CustomHeader stacking order", () => {
  it("keeps the header controls above the release banner", () => {
    expect(source).toContain('className="relative z-20 mx-auto flex h-16');
    expect(source).toContain('max-w-[1440px]');
    expect(source).toContain('className="relative z-10"');
  });
});
