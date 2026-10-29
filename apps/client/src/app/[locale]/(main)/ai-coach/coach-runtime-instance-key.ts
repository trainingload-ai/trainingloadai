/**
 * A runtime belongs to one conversation. Persisted query refreshes for that
 * conversation must not remount it: doing so discards the in-memory stream,
 * resets typewriter buffers and makes rich cards flash at turn completion.
 */
export function coachRuntimeInstanceKey(
  sid: string,
  _messages: readonly { id: string }[],
) {
  return sid || "__new__";
}
