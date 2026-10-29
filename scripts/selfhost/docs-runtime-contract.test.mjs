import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { resolve } from "node:path";
import { repositoryRoot } from "./verify-image-contract.mjs";

const browserConsumers = [
  "apps/docs/src/hooks/use-track-file-inspection.ts",
  "apps/docs/src/components/ConverterDirectionClient.tsx",
  "apps/docs/src/app/[lang]/(home)/converter/client.tsx",
  "apps/docs/src/app/[lang]/(home)/critical-power-calculator/file-input.tsx",
  "apps/docs/src/app/[lang]/(home)/fit-course-converter/client.tsx",
  "apps/docs/src/app/[lang]/(home)/free-ai-workout-review/client.tsx",
  "apps/docs/src/app/[lang]/(home)/ftp-calculator/client.tsx",
  "apps/docs/src/app/[lang]/(home)/vdot-training-plan-generator/client.tsx",
];

test("standalone docs tools keep a restricted proxy outside the self-host runtime", async () => {
  const compose = await readFile(
    resolve(repositoryRoot, "compose.yml"),
    "utf8",
  );
  assert.doesNotMatch(compose, /DOCS_INTERNAL_API_URL|^  docs:|^  gateway:/m);

  const proxy = await readFile(
    resolve(repositoryRoot, "apps/docs/src/app/api/proxy/[...path]/route.ts"),
    "utf8",
  );
  assert.ok(proxy.includes('path[0] !== "public"'));
  assert.ok(proxy.includes('segment === ".."'));
  assert.ok(proxy.includes("MAX_REQUEST_BYTES"));
  assert.ok(proxy.includes("getDocsServerApiBaseUrl()"));

  for (const path of browserConsumers) {
    const source = await readFile(resolve(repositoryRoot, path), "utf8");
    assert.ok(source.includes("DOCS_BROWSER_API_BASE_URL"), path);
    assert.doesNotMatch(source, /process\.env\.NEXT_PUBLIC_API_URL/, path);
  }

  const planSharePage = await readFile(
    resolve(
      repositoryRoot,
      "apps/docs/src/app/[lang]/(home)/share/plans/[publicId]/page.tsx",
    ),
    "utf8",
  );
  assert.ok(planSharePage.includes('from "@/lib/plan-share-server"'));
});
