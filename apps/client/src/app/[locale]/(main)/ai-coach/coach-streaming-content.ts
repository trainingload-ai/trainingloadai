export function shouldShowTrailingCoachWaiting(
  content: readonly { kind: "text" | "tools" }[],
  isStreaming: boolean,
) {
  if (!isStreaming) return false;
  const last = content.at(-1);
  return !last || last.kind === "tools";
}
