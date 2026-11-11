import { execFileSync } from 'node:child_process';
import { ActivityAiReviewWorkerService } from '../activity-ai-review.worker';
jest.mock('@/api/ai/ai.service', () => ({ AiService: class {} }));

describe('activity review queue scheduling', () => {
  it('honors future deadlines and writes UTC leases in UTC and Shanghai sessions', async () => {
    let query: { sql: string; values: unknown[] } | undefined;
    const service = new ActivityAiReviewWorkerService(
      {
        $queryRaw: async (
          parts: TemplateStringsArray,
          ...values: unknown[]
        ) => {
          query = {
            sql: parts.reduce(
              (sql, part, index) =>
                sql +
                part +
                (index < values.length
                  ? `$${index + 1}${values[index] instanceof Date ? '::timestamptz' : ''}`
                  : ''),
              '',
            ),
            values,
          };
          return [];
        },
      } as never,
      { get: () => undefined } as never,
      {} as never,
    );
    await (service as any).claimBatch(5);
    const output = execFileSync(
      process.execPath,
      [
        '-e',
        `
      const {PGlite}=require(process.argv[1]);
      (async()=>{
        const {query,now}=JSON.parse(require('node:fs').readFileSync(0,'utf8'));
        const db=await PGlite.create();
        try {
          await db.exec(\`CREATE TABLE t_activity_ai_review (
            id text primary key,activity_id int,user_id text,status text,attempts int default 0,max_attempts int default 3,
            available_at timestamp,created_at timestamp default current_timestamp,updated_at timestamp,
            locked_at timestamp,started_at timestamp,finished_at timestamp,failed_at timestamp);\`);
          const utc=ms=>new Date(ms).toISOString().slice(0,23).replace('T',' ');
          const results=[];
          for(const zone of ['UTC','Asia/Shanghai']) {
            await db.query("SELECT set_config('TimeZone',$1,false)",[zone]);
            await db.exec('TRUNCATE t_activity_ai_review');
            await db.query("INSERT INTO t_activity_ai_review(id,activity_id,user_id,status,available_at) VALUES ('future',42,'user','FAILED',$1::timestamp),('ready',43,'user','PENDING',$2::timestamp)",[utc(now+120000),utc(now-1000)]);
            const jobs=(await db.query(query.sql,query.values)).rows;
            const lease=(await db.query("SELECT to_char(locked_at,'YYYY-MM-DD HH24:MI:SS.MS') AS stamp FROM t_activity_ai_review WHERE id='ready'")).rows[0].stamp;
            results.push({zone,ids:jobs.map(row=>row.id),lease});
          }
          process.stdout.write(JSON.stringify(results));
        } finally {await db.close();}
      })().catch(e=>{console.error(e);process.exitCode=1;});
    `,
        require.resolve('@electric-sql/pglite'),
      ],
      {
        input: JSON.stringify({ query, now: Date.now() }),
        encoding: 'utf8',
        env: { ...process.env, TZ: 'UTC' },
        timeout: 20000,
      },
    );
    const results = JSON.parse(output) as Array<{
      zone: string;
      ids: string[];
      lease: string;
    }>;
    for (const result of results) {
      expect(result.ids).toEqual(['ready']);
      expect(
        Math.abs(Date.parse(result.lease.replace(' ', 'T') + 'Z') - Date.now()),
      ).toBeLessThan(10000);
    }
  }, 25000);
});
