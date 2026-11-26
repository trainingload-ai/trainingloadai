import { remark } from "remark";
import remarkGfm from "remark-gfm";

type MarkdownNode = {
  type: string;
  value?: string;
  children?: MarkdownNode[];
};

export function plainText(node: MarkdownNode): string {
  if (node.type === "text" || node.type === "inlineCode")
    return node.value ?? "";
  return node.children?.map(plainText).join("") ?? "";
}

export function releaseNoteSummary(markdown: string) {
  const { children } = remark().use(remarkGfm).parse(markdown);
  const list = children.find((node) => node.type === "list");
  const intro = children
    .slice(0, list ? children.indexOf(list) : children.length)
    .find((node) => node.type === "paragraph");
  return {
    intro: intro ? plainText(intro).trim() : "",
    highlights:
      list?.children
        .slice(0, 5)
        .map((item) =>
          item.children
            .filter((node) => node.type === "paragraph")
            .map(plainText)
            .join(" ")
            .trim(),
        )
        .filter(Boolean) ?? [],
  };
}
