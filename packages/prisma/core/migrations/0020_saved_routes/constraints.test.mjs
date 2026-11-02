import { test, after } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
const db = new PGlite();
after(() => db.close());
test("route migration enforces ownership, immutable versions and account deletion cascades", async () => {
  await db.exec(
    `CREATE TYPE enum_third_party_provider AS ENUM('garmin','coros');CREATE TABLE t_user(id text PRIMARY KEY);CREATE TABLE t_sport_definition(code text PRIMARY KEY);INSERT INTO t_sport_definition VALUES('ROAD_RUNNING');CREATE TABLE t_external_provider_connection(id text PRIMARY KEY);INSERT INTO t_user VALUES('a'),('b');`,
  );
  await db.exec(
    await readFile(new URL("./migration.sql", import.meta.url), "utf8"),
  );
  const version = (id, route, user) => ({ id, route, user });
  async function create({ id, route, user }) {
    await db.transaction(async (tx) => {
      await tx.query(
        "INSERT INTO t_saved_route(id,user_id,request_id,creation_checksum,updated_at) VALUES($1::text,$2::text,$1::text,$3::text,NOW())",
        [route, user, "a".repeat(64)],
      );
      await tx.query(
        `INSERT INTO t_saved_route_version(id,route_id,user_id,revision,name,sport_code,geometry,distance_meters,point_count,segment_count,has_complete_elevation,raw_storage_key,raw_size,raw_checksum,checksum) VALUES($1,$2,$3,1,'Route','ROAD_RUNNING',$4,111,2,1,FALSE,'route.gpx',200,$5,$5)`,
        [
          id,
          route,
          user,
          JSON.stringify({
            type: "MultiLineString",
            coordinates: [
              [
                [0, 0],
                [0.001, 0],
              ],
            ],
          }),
          "a".repeat(64),
        ],
      );
    });
  }
  await create(version("va", "ra", "a"));
  await create(version("vb", "rb", "b"));
  await assert.rejects(
    db.query("UPDATE t_saved_route_version SET name='Changed' WHERE id='va'"),
    /ROUTE_VERSION_IMMUTABLE/,
  );
  await assert.rejects(
    db.query(
      `INSERT INTO t_route_external_mapping(id,user_id,route_id,version_id,provider,account_ref,updated_at) VALUES('bad','b','rb','va','garmin','remote',NOW())`,
    ),
    /route_mapping_version_scope_fkey/,
  );
  await assert.rejects(
    db.transaction(async (tx) => {
      await tx.query(
        `INSERT INTO t_saved_route(id,user_id,request_id,creation_checksum,updated_at) VALUES('orphan','a','orphan',$1,NOW())`,
        ["a".repeat(64)],
      );
    }),
    /route_head_version_fkey/,
  );
  await db.query(
    `INSERT INTO t_route_external_mapping(id,user_id,route_id,version_id,provider,account_ref,external_id,updated_at) VALUES('ma','a','ra','va','garmin','remote','123',NOW())`,
  );
  await assert.rejects(
    db.query(
      `INSERT INTO t_route_external_mapping(id,user_id,route_id,version_id,provider,account_ref,external_id,updated_at) VALUES('duplicate','b','rb','vb','garmin','remote','123',NOW())`,
    ),
    /route_remote_identity_unique/,
  );
  await db.query("DELETE FROM t_user WHERE id='a'");
  assert.equal(
    (await db.query("SELECT * FROM t_saved_route_version WHERE user_id='a'"))
      .rows.length,
    0,
  );
  assert.equal(
    (await db.query("SELECT * FROM t_route_external_mapping WHERE user_id='a'"))
      .rows.length,
    0,
  );
  assert.equal(
    (await db.query("SELECT * FROM t_saved_route_version WHERE user_id='b'"))
      .rows.length,
    1,
  );
});
