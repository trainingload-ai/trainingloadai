import assert from "node:assert/strict";
import { createServer } from "node:net";
import test from "node:test";

import { getAvailableLoopbackPort } from "./port.js";

test("allocates a usable random loopback port", async () => {
  const port = await getAvailableLoopbackPort();
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolve);
  });
  assert.equal((server.address() as { port: number }).port, port);
  await new Promise<void>((resolve) => server.close(() => resolve()));
});
