export class NdjsonDecoder {
  private readonly decoder = new TextDecoder();
  private buffer = "";

  push(chunk: Uint8Array): unknown[] {
    this.buffer += this.decoder.decode(chunk, { stream: true });
    return this.takeLines(false);
  }

  finish(): unknown[] {
    this.buffer += this.decoder.decode();
    return this.takeLines(true);
  }

  private takeLines(includeRemainder: boolean) {
    const lines = this.buffer.split("\n");
    this.buffer = includeRemainder ? "" : (lines.pop() ?? "");
    const ready = includeRemainder ? lines : lines;
    const events: unknown[] = [];
    for (const raw of ready) {
      const line = raw.trim();
      if (!line) continue;
      try {
        events.push(JSON.parse(line));
      } catch {
        throw new Error("NDJSON_RESPONSE_INVALID");
      }
    }
    return events;
  }
}

export async function readNdjsonResponse(
  response: Response,
  onEvent: (event: unknown) => void,
) {
  if (!response.ok || !response.body) {
    throw new Error(`HTTP_${response.status}`);
  }
  const decoder = new NdjsonDecoder();
  const reader = response.body.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    for (const event of decoder.push(value)) onEvent(event);
  }
  for (const event of decoder.finish()) onEvent(event);
}
