import {test,after} from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {PGlite} from '@electric-sql/pglite';
const db=new PGlite();after(()=>db.close());
test('health observations preserve complete groups, coded temporal scope and source ownership',async()=>{
 await db.exec(`CREATE TYPE enum_health_metric_type AS ENUM('BODY_MASS_KG');CREATE TYPE enum_health_data_provider AS ENUM('MANUAL','HEALTH_CONNECT','INTERVALS_ICU');CREATE TABLE t_user(id text PRIMARY KEY);CREATE TABLE t_import_source_object(id text PRIMARY KEY,user_id text NOT NULL);CREATE TABLE t_canonical_health_snapshot(id text PRIMARY KEY,user_id text NOT NULL);INSERT INTO t_user VALUES('a'),('b');INSERT INTO t_import_source_object VALUES('sa','a'),('sb','b');INSERT INTO t_canonical_health_snapshot VALUES('ha','a'),('hb','b');`);
 await db.exec(await readFile(new URL('./migration.sql',import.meta.url),'utf8'));
 const blood=async(id,user,source,systolic=120,diastolic=80)=>db.query(`INSERT INTO t_external_health_observation(id,user_id,provider,source_namespace,source_group_key,external_id,source_object_id,kind,scope,local_date,measured_at,systolic_mmhg,diastolic_mmhg,measurement_origin,source_updated_at,updated_at) VALUES($1::text,$2::text,'MANUAL','fixture',$3,$1,$4,'BLOOD_PRESSURE','MEASUREMENT','2026-11-01',NOW(),$5,$6,'DEVICE',NOW(),NOW())`,[id,user,'a'.repeat(64),source,systolic,diastolic]);
 await blood('valid','a','sa');
 await assert.rejects(blood('partial','a','sa',120,null),/health_observation_shape_valid/);
 await assert.rejects(blood('cross-owner','a','sb'),/health_observation_source_owner_fkey/);
 await assert.rejects(db.query(`INSERT INTO t_external_health_observation(id,user_id,provider,source_namespace,source_group_key,external_id,kind,scope,local_date,source_updated_at,updated_at) VALUES('missing-category','a','MANUAL','fixture',$1,'empty','BREATHING_VARIATION','DAILY','2026-11-01',NOW(),NOW())`,['b'.repeat(64)]),/health_observation_shape_valid/);
 await db.query(`INSERT INTO t_external_health_observation(id,user_id,provider,source_namespace,source_group_key,external_id,kind,scope,local_date,category_system,category_code,source_updated_at,updated_at) VALUES('daily','a','MANUAL','fixture',$1,'daily','BREATHING_VARIATION','DAILY','2026-11-01','urn:fixture:frequency:v1','MINIMAL',NOW(),NOW())`,['b'.repeat(64)]);
 await assert.rejects(db.query(`UPDATE t_external_health_observation SET scope='INTERVAL',interval_start=NOW(),interval_end=NOW()-interval '1 second' WHERE id='daily'`),/health_observation_shape_valid/);
 await assert.rejects(db.query(`UPDATE t_external_health_observation SET snapshot_id='hb' WHERE id='valid'`),/health_observation_snapshot_owner_fkey/);
 await db.query("DELETE FROM t_import_source_object WHERE id='sa'");assert.equal((await db.query("SELECT source_object_id FROM t_external_health_observation WHERE id='valid'")).rows[0].source_object_id,null);
 await db.query("DELETE FROM t_user WHERE id='a'");assert.equal((await db.query('SELECT * FROM t_external_health_observation')).rows.length,0);
});
