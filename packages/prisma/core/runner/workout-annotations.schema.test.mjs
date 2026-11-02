import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
test("optional step annotations preserve old rows and enforce the bounded versioned shape", async () => {
  const db = await PGlite.create();
  try {
    await db.exec(
      "CREATE TABLE t_plan_workout_step(id text PRIMARY KEY); INSERT INTO t_plan_workout_step VALUES('old');",
    );
    await db.exec(
      await readFile(
        new URL(
          "../migrations/0019_workout_step_annotations/migration.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    assert.equal(
      (
        await db.query(
          "SELECT step_annotations FROM t_plan_workout_step WHERE id='old'",
        )
      ).rows[0].step_annotations,
      null,
    );
    const insert = (value) =>
      db.query(
        "INSERT INTO t_plan_workout_step(id,step_annotations) VALUES($1,$2::jsonb)",
        ["new", JSON.stringify(value)],
      );
    for (const bad of [
      { swimMeta: {} },
      { version: "1", swimMeta: {} },
      { version: 2 },
      { version: 1, garminToken: "forbidden" },
      { version: 1, secondaryTarget: { zoneLabel: "x".repeat(8300) } },
    ])
      await assert.rejects(insert(bad));
    await insert({
      version: 1,
      swimMeta: { stroke: "FREESTYLE" },
      secondaryTarget: { kind: "CADENCE", value: 80 },
    });
    assert.equal(
      (
        await db.query(
          "SELECT step_annotations#>>'{swimMeta,stroke}' AS stroke FROM t_plan_workout_step WHERE id='new'",
        )
      ).rows[0].stroke,
      "FREESTYLE",
    );
  } finally {
    await db.close();
  }
});
