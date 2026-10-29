import { describe, expect, it } from "vitest";
import {
  blogLinkTrackingProperties,
  classifyBlogLinkDestination,
  normalizeBlogLinkText,
} from "@/lib/blog-link-analytics";

describe("blog link analytics", () => {
  it("classifies clean internal blog and product destinations", () => {
    expect(classifyBlogLinkDestination("/blog/what-is-training-load")).toBe(
      "internal_blog",
    );
    expect(classifyBlogLinkDestination("/zh/blog/what-is-training-load")).toBe(
      "internal_blog",
    );
    expect(classifyBlogLinkDestination("/couch-to-5k-training-plan")).toBe(
      "internal_product",
    );
    expect(classifyBlogLinkDestination("#references")).toBe("article_anchor");
  });

  it("distinguishes the product app from external references", () => {
    expect(
      classifyBlogLinkDestination("https://app.trainingload.ai/en/pmc"),
    ).toBe("product_app");
    expect(
      classifyBlogLinkDestination("https://pubmed.ncbi.nlm.nih.gov/34478518/"),
    ).toBe("external_reference");
  });

  it("records the source blog while removing query strings and hashes", () => {
    expect(
      blogLinkTrackingProperties({
        contentLanguage: "zh",
        href: "/zh/couch-to-5k-training-plan?token=private#schedule",
        sourceBlogSlug: "couch-to-5k-missed-run",
      }),
    ).toEqual({
      event_schema_version: "1.0",
      source_blog_slug: "couch-to-5k-missed-run",
      content_language: "zh",
      destination_path: "/zh/couch-to-5k-training-plan",
      destination_type: "internal_product",
      link_location: "article_body",
    });
  });

  it("normalizes visible link text without collecting unbounded content", () => {
    expect(normalizeBlogLinkText("  Open\n  the plan  ")).toBe("Open the plan");
    expect(normalizeBlogLinkText("x".repeat(140))).toHaveLength(120);
    expect(normalizeBlogLinkText("   ")).toBeUndefined();
  });
});
