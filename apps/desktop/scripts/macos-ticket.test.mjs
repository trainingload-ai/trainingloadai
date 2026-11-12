import assert from "node:assert/strict";
import test from "node:test";
import { runMacStapler } from "./macos-ticket.mjs";

const connectionLost = () =>
  Object.assign(new Error("stapler failed"), {
    status: 68,
    stdout: Buffer.from(
      'Error Domain=NSURLErrorDomain Code=-1005 "The network connection was lost."',
    ),
  });

test("ticket operations retry a dropped connection without resubmitting or signing", async () => {
  for (const action of ["staple", "validate"]) {
    const commands = [];
    const delays = [];
    const output = await runMacStapler(action, "/temporary/Trainingload.ai.dmg", {
      execute: (...command) => {
        commands.push(command.slice(0, 2));
        if (commands.length === 1) throw connectionLost();
        return "The action worked!\n";
      },
      wait: async (delay) => delays.push(delay),
      log: () => {},
    });
    assert.equal(output, "The action worked!\n");
    assert.equal(commands.length, 2);
    assert.deepEqual(commands[0], [
      "xcrun",
      ["stapler", action, "/temporary/Trainingload.ai.dmg"],
    ]);
    assert.deepEqual(commands[1], commands[0]);
    assert.deepEqual(delays, [10_000]);
  }
});

test("invalid tickets and other errors fail without retries", async () => {
  for (const error of [
    Object.assign(new Error("invalid ticket"), { status: 65 }),
    Object.assign(new Error("invalid response"), {
      status: 68,
      stdout: "invalid ticket",
    }),
    Object.assign(new Error("untrusted server"), {
      status: 68,
      stderr: "NSURLErrorDomain Code=-1202",
    }),
    new Error("tool missing"),
  ]) {
    let attempts = 0;
    await assert.rejects(
      runMacStapler("validate", "/temporary/app", {
        execute: () => {
          attempts++;
          throw error;
        },
        wait: async () => assert.fail("must not retry"),
        log: () => {},
      }),
      (caught) => caught === error,
    );
    assert.equal(attempts, 1);
  }
});

test("persistent connection loss fails after three attempts", async () => {
  const error = connectionLost();
  let attempts = 0;
  const delays = [];
  await assert.rejects(
    runMacStapler("validate", "/temporary/app", {
      execute: () => {
        attempts++;
        throw error;
      },
      wait: async (delay) => delays.push(delay),
      log: () => {},
    }),
    (caught) => caught === error,
  );
  assert.equal(attempts, 3);
  assert.deepEqual(delays, [10_000, 20_000]);
});
