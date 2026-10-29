import { DocsLayout } from "fumadocs-ui/layouts/docs";
import { Suspense, type CSSProperties, type ReactNode } from "react";
import { baseOptions } from "@/app/layout.config";
import { source } from "@/lib/source";
import { DocsHeader } from "@/components/DocsHeader";
import { docsSidebarComponents } from "@/components/DocsSidebarComponents";

const docsShellStyle = {
  "--fd-banner-height": "3.5rem",
  "--fd-nav-height": "0px",
} as CSSProperties;

// const ROOT_ORDER_BY_URL: Record<string, number> = {
//   "/docs": 1,
//   "/docs/core-concepts": 2,
//   "/docs/metrics": 3,
//   "/docs/system-design": 4,
//   "/docs/usage": 5,
//   "/docs/philosophy": 6,
//   "/docs/developers": 7,
// };

// function getNodeUrlForOrdering(node: Node): string | undefined {
//   if (node.type === "page") return (node as Item).url;
//   if (node.type === "folder") return (node as Folder).index?.url;
//   return undefined;
// }

export default async function Layout({
  params,
  children,
}: {
  params: Promise<{ lang: string }>;
  children: ReactNode;
}) {
  const { lang } = await params;
  const tree = source.getPageTree(lang);
  const options = baseOptions(lang);

  return (
    <div
      className="docs-system-shell flex min-h-screen flex-1 flex-col"
      style={docsShellStyle}
    >
      <Suspense
        fallback={
          <div className="sticky top-0 z-50 h-14 w-full border-b border-border bg-background/95 backdrop-blur" />
        }
      >
        <DocsHeader />
      </Suspense>
      <DocsLayout
        tree={tree}
        {...options}
        nav={{ ...options.nav, enabled: false }}
        sidebar={{ components: docsSidebarComponents }}
        // githubUrl removed (private for now)
        // links={[
        //   {
        //     type: "custom",
        //     children: (
        //       <GithubInfo
        //         owner="Buerber"
        //         repo="Trainingload.ai"
        //         className="lg:-mx-2"
        //       />
        //     ),
        //   },
        // ]}
      >
        {children}
      </DocsLayout>
    </div>
  );
}
