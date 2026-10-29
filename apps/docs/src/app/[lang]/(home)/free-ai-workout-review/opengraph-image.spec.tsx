import { describe, expect, it } from "vitest";
import OpenGraphImage, { contentType, size } from "./opengraph-image";

describe("free AI workout review OpenGraph image", () => {
  it("renders a complete PNG response with the declared dimensions", async () => {
    const response = OpenGraphImage();

    expect(response.headers.get("content-type")).toBe(contentType);
    const bytes = new Uint8Array(await response.arrayBuffer());
    expect(bytes.length).toBeGreaterThan(10_000);
    expect(Array.from(bytes.slice(0, 8))).toEqual([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ]);

    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    expect(view.getUint32(16)).toBe(size.width);
    expect(view.getUint32(20)).toBe(size.height);
  });
});
