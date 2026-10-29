export type LLMTextPage = {
  url: string;
  data: {
    title: string;
    description?: string;
    getText: (mode: "processed") => Promise<string>;
  };
};

export async function renderLLMText(page: LLMTextPage, siteUrl = "") {
  const processed = (await page.data.getText("processed")).trim();
  const body = processed.replace(/^#\s+[^\r\n]+(?:\r?\n)+/, "");
  const absoluteUrl = `${siteUrl.replace(/\/+$/, "")}${page.url}`;

  return [
    `# ${page.data.title}`,
    page.data.description ? `> ${page.data.description}` : "",
    `Canonical URL: ${absoluteUrl}`,
    body,
  ]
    .filter(Boolean)
    .join("\n\n");
}
