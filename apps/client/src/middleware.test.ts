import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { shouldRewriteUnprefixedPath } from "./lib/unprefixed-locale-routing";

describe("unprefixed callback routing", () => {
  it("classifies the auth completion URL as an internal locale rewrite", () => {
    expect(shouldRewriteUnprefixedPath("/auth/complete")).toBe(true);
    expect(shouldRewriteUnprefixedPath("/other")).toBe(false);
  });

  it("keeps deployment route policy inside the middleware", () => {
    const source = readFileSync(
      resolve(process.cwd(), "src/middleware.ts"),
      "utf8",
    );
    expect(source).toContain(
      "shouldRewriteUnprefixedPath(request.nextUrl.pathname)",
    );
    expect(source).toContain("isSensitiveDeploymentPath");
    expect(source).toContain(
      'response.headers.set("Referrer-Policy", "no-referrer")',
    );
  });
});
