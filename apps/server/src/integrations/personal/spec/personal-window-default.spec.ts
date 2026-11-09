import {describe,it,expect} from '@jest/globals';
import {PersonalSyncService} from '../personal-sync.service';
import {dateRange} from '../personal-dates';
function fixture(){
 const jobs:any[]=[],connection:any={id:'connection',externalAthleteId:'remote',credentialFingerprint:'generation',metadata:{region:'global',settings:{timezone:'Asia/Shanghai',activities:true,wellness:false}}};
 const prisma:any={personalProviderJob:{upsert:async({create}:any)=>{const job={...create,id:'job',status:'QUEUED'};jobs.push(job);return job;}},externalProviderConnection:{updateMany:async()=>({count:1})}};
 const client:any={request:()=>{throw new Error('must only enqueue');}};
 const service=new PersonalSyncService(prisma,{require:async()=>connection,resolveAccountTimezone:async()=>'Asia/Shanghai'} as any,client,{} as any,{} as any,{} as any,{} as any,{} as any,{} as any);
 return {service,jobs};
}
describe('personal history defaults remain provider scoped',()=>{
 it('queues 60 local days for Garmin, including the supplied end day, without fetching vendor data',async()=>{const f=fixture();await f.service.enqueue('owner','garmin',{endDate:'2026-11-01'});expect(f.jobs[0].payload).toMatchObject({startDate:'2026-09-03',endDate:'2026-11-01',trigger:'manual',settings:{timezone:'Asia/Shanghai',wellness:false}});expect(dateRange(f.jobs[0].payload.startDate,f.jobs[0].payload.endDate)).toHaveLength(60);});
 it('preserves an explicit range and the other existing provider default',async()=>{const f=fixture();await f.service.enqueue('owner','garmin',{startDate:'2026-10-31',endDate:'2026-11-01'});await f.service.enqueue('owner','coros',{endDate:'2026-11-01'});expect(f.jobs[0].payload.startDate).toBe('2026-10-31');expect(dateRange(f.jobs[1].payload.startDate,f.jobs[1].payload.endDate)).toHaveLength(30);});
});
