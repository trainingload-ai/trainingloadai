import { isDeploymentUnprefixedPath } from "@deployment/route-policy";

export function shouldRewriteUnprefixedPath(pathname: string): boolean {
  return (
    pathname.startsWith("/auth/complete") ||
    isDeploymentUnprefixedPath(pathname)
  );
}
