import defaultMdxComponents from "fumadocs-ui/mdx";
import type { MDXComponents } from "mdx/types";
import { Mermaid } from "@/components/Mermaid";
import * as TabsComponents from "fumadocs-ui/components/tabs";
import { ZoomableImage } from "@/components/ZoomableImage";
import { DocsScreenshot } from "@/components/DocsScreenshot";
import {
  DocsTaskCard,
  DocsTaskGrid,
} from "@/components/DocsTaskGrid";

import { PDCChart } from "@/components/charts/PDCChart";
import {
  AcRatioStatPreviewCard,
  AtlStatPreviewCard,
  CtlStatPreviewCard,
  MonotonyStatPreviewCard,
  TsbStatPreviewCard,
} from "@/app/components/doc-previews/fitness-status/AtlStatPreviewCard";

// use this function to get MDX components, you will need it for rendering MDX
export function getMDXComponents(components?: MDXComponents): MDXComponents {
  return {
    ...defaultMdxComponents,
    ...TabsComponents,
    Mermaid,
    DocsScreenshot,
    DocsTaskCard,
    DocsTaskGrid,
    img: (props) => (
      <ZoomableImage
        {...props}
        className="my-7 rounded-surface bg-card ring-1 ring-border"
      />
    ),
    PDCChart,
    AcRatioStatPreviewCard,
    AtlStatPreviewCard,
    CtlStatPreviewCard,
    MonotonyStatPreviewCard,
    TsbStatPreviewCard,
    ...components,
  };
}
