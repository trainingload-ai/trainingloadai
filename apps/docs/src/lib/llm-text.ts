import { remark } from "remark";
import remarkGfm from "remark-gfm";
import remarkMdx from "remark-mdx";
import remarkMath from "remark-math";
import { resolveDocsScreenshot } from "@/lib/docs-screenshot";
import { splitLocalePrefix } from "@/lib/public-html-url";

export type LLMTextPage = {
  url: string;
  data: {
    title: string;
    description?: string;
    getText: (mode: "processed") => Promise<string>;
  };
};

type MarkdownNode = {
  type: string;
  name?: string;
  url?: string;
  value?: string;
  alt?: string;
  depth?: number;
  children?: MarkdownNode[];
  attributes?: Array<{ type: string; name?: string; value?: unknown }>;
};

function stringAttributes(node: MarkdownNode) {
  const attributes: Record<string, string> = {};
  for (const attribute of node.attributes ?? []) {
    if (attribute.name && typeof attribute.value === "string") {
      attributes[attribute.name] = attribute.value;
    }
  }
  return attributes;
}

function screenshotNodes(node: MarkdownNode, locale: string): MarkdownNode[] {
  const attributes = stringAttributes(node);
  const { images, destination } = resolveDocsScreenshot({
    id: attributes.id ?? "",
    locale,
    imageSrc: attributes.imageSrc,
    appPath: attributes.appPath,
  });
  const title = attributes.title ?? attributes.imageAlt ?? "Screenshot";
  const nodes: MarkdownNode[] = [
    {
      type: "paragraph",
      children: [
        { type: "strong", children: [{ type: "text", value: title }] },
      ],
    },
  ];
  if (attributes.description) {
    nodes.push({
      type: "paragraph",
      children: [{ type: "text", value: attributes.description }],
    });
  }
  for (const image of images) {
    const platform = image.platform === "web" ? "Web" : "Mobile";
    nodes.push({
      type: "paragraph",
      children: [
        {
          type: "image",
          url: image.imageSrc,
          alt: `${attributes.imageAlt ?? title}${images.length > 1 ? ` — ${platform}` : ""}`,
        },
      ],
    });
  }
  nodes.push({
    type: "paragraph",
    children: [
      {
        type: "link",
        url: destination.href,
        children: [{ type: "text", value: attributes.demoLabel ?? "Demo" }],
      },
    ],
  });
  return nodes;
}

function taskCardNodes(node: MarkdownNode): MarkdownNode[] {
  const attributes = stringAttributes(node);
  const title = attributes.title ?? attributes.action ?? "Guide";
  const nodes: MarkdownNode[] = [
    { type: "heading", depth: 2, children: [{ type: "text", value: title }] },
  ];
  if (attributes.description) {
    nodes.push({
      type: "paragraph",
      children: [{ type: "text", value: attributes.description }],
    });
  }
  if (attributes.imageSrc) {
    nodes.push({
      type: "paragraph",
      children: [
        {
          type: "image",
          url: attributes.imageSrc,
          alt: attributes.imageAlt ?? title,
        },
      ],
    });
  }
  if (attributes.href) {
    nodes.push({
      type: "paragraph",
      children: [
        {
          type: "link",
          url: attributes.href,
          children: [{ type: "text", value: attributes.action ?? title }],
        },
      ],
    });
  }
  return nodes;
}

function rewriteDocumentation(
  node: MarkdownNode,
  locale: string,
  canonical: string,
) {
  if (node.children) {
    node.children = node.children.flatMap((child) => {
      rewriteDocumentation(child, locale, canonical);
      if (child.type !== "mdxJsxFlowElement") return [child];
      if (child.name === "DocsTaskGrid") return child.children ?? [];
      const replacement =
        child.name === "DocsScreenshot"
          ? screenshotNodes(child, locale)
          : child.name === "DocsTaskCard"
            ? taskCardNodes(child)
            : [child];
      if (replacement[0] !== child) {
        for (const item of replacement)
          rewriteDocumentation(item, locale, canonical);
      }
      return replacement;
    });
  }
  if (node.url && ["link", "image", "definition"].includes(node.type)) {
    node.url = new URL(node.url, canonical).href;
  }
}

export async function renderLLMText(page: LLMTextPage, siteUrl = "") {
  const processed = (await page.data.getText("processed")).trim();
  const body = processed.replace(/^#\s+[^\r\n]+(?:\r?\n)+/, "");
  const absoluteUrl = `${siteUrl.replace(/\/+$/, "")}${page.url}`;
  const { locale } = splitLocalePrefix(page.url);
  // A parser preserves code examples, tables and math while replacing actual
  // documentation components. The browser and text export share capture data.
  const markdown = await remark()
    .use(remarkGfm)
    .use(remarkMdx)
    .use(remarkMath)
    .use(() => (tree: MarkdownNode) => {
      rewriteDocumentation(
        tree,
        locale,
        new URL(absoluteUrl, "https://www.trainingload.ai").href,
      );
    })
    .process(body);

  return [
    `# ${page.data.title}`,
    page.data.description ? `> ${page.data.description}` : "",
    `Canonical URL: ${absoluteUrl}`,
    String(markdown).trim(),
  ]
    .filter(Boolean)
    .join("\n\n");
}
