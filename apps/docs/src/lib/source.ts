import { docs, meta } from "@/.source";
import { loader } from "fumadocs-core/source";
import { createMDXSource } from "fumadocs-mdx/runtime/next";
import { i18n } from "@/lib/i18n";
import { renderLLMText } from "@/lib/llm-text";

// See https://fumadocs.vercel.app/docs/headless/source-api for more info
export const source = loader({
  // it assigns a URL to your pages
  i18n,
  baseUrl: "/docs",
  source: createMDXSource(docs, meta),
});

type SourcePage = ReturnType<typeof source.getPages>[number];

export async function getLLMText(page: SourcePage, siteUrl = "") {
  return renderLLMText(page, siteUrl);
}
