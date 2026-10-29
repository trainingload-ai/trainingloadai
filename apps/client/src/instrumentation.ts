import type { Instrumentation } from "next";

function serializeRequestError(error: unknown) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
      digest:
        "digest" in error && typeof error.digest === "string"
          ? error.digest
          : undefined,
    };
  }

  if (error && typeof error === "object") {
    const candidate = error as { digest?: unknown; message?: unknown };
    return {
      message:
        typeof candidate.message === "string"
          ? candidate.message
          : "Unknown request error",
      digest:
        typeof candidate.digest === "string" ? candidate.digest : undefined,
    };
  }

  return { message: String(error) };
}

export const onRequestError: Instrumentation.onRequestError = (
  error,
  request,
  context,
) => {
  // Do not log request headers here: they can contain session cookies.
  console.error("[next:onRequestError]", {
    path: request.path.split("?", 1)[0],
    method: request.method,
    routerKind: context.routerKind,
    routePath: context.routePath,
    routeType: context.routeType,
    renderSource: context.renderSource,
    revalidateReason: context.revalidateReason,
    error: serializeRequestError(error),
  });
};
