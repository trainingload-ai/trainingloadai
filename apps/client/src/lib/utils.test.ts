import { describe, expect, it } from "vitest";

import { cn } from "@/lib/utils";

describe("cn mobile typography", () => {
  it("keeps semantic mobile font sizes beside text colors", () => {
    expect(cn("text-mobile-control", "text-foreground")).toBe(
      "text-mobile-control text-foreground",
    );
    expect(cn("text-mobile-caption", "text-muted-foreground")).toBe(
      "text-mobile-caption text-muted-foreground",
    );
  });

  it("still lets a later semantic font size override an earlier one", () => {
    expect(cn("text-mobile-caption", "text-mobile-body")).toBe(
      "text-mobile-body",
    );
  });

  it("keeps the desktop fallback separate from the mobile font size", () => {
    expect(
      cn(
        "text-mobile-unit pc:text-[10px]",
        "font-medium text-muted-foreground",
      ),
    ).toBe(
      "text-mobile-unit pc:text-[10px] font-medium text-muted-foreground",
    );
  });
});
