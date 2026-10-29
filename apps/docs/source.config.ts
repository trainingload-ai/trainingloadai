import {
  defineConfig,
  defineDocs,
  frontmatterSchema,
} from "fumadocs-mdx/config";
import { z } from "zod";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";

export const { docs, meta } = defineDocs({
  dir: "content/docs",
  docs: {
    schema: frontmatterSchema.extend({
      keywords: z.array(z.string()).optional(),
      seoTitle: z.string().optional(),
      seoDescription: z.string().optional(),
    }),
    postprocess: {
      includeProcessedMarkdown: true,
    },
  },
});

// Blog collection - separate from docs
export const blog = defineDocs({
  dir: "content/blog",
  docs: {
    schema: frontmatterSchema.extend({
      date: z.string().date().or(z.date()),
      author: z.string().optional(),
      image: z.string().optional(),
      tags: z.array(z.string()).optional(),
      draft: z.boolean().optional(),
    }),
  },
});

export default defineConfig({
  mdxOptions: {
    remarkPlugins: [remarkMath],
    rehypePlugins: (v) => [rehypeKatex, ...v],
  },
});
