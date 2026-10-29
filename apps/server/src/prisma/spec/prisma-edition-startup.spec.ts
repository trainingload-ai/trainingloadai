import {afterEach,describe,expect,it,jest} from '@jest/globals';
import {PrismaService} from '../prisma.service';
const original=process.env.SELF_HOST_MODE;
afterEach(()=>{if(original===undefined)delete process.env.SELF_HOST_MODE;else process.env.SELF_HOST_MODE=original;});
function service(state:unknown){
  const instance=Object.create(PrismaService.prototype) as PrismaService;
  Object.assign(instance,{$connect:jest.fn(async()=>undefined),$disconnect:jest.fn(async()=>undefined),$queryRaw:jest.fn(async()=>[state])});
  return instance;
}
describe('Prisma edition startup',()=>{
 it('rejects Managed databases and missing single-owner constraints before application startup',async()=>{
  process.env.SELF_HOST_MODE='core-local';
  for(const state of [{core:null,managed:'_prisma_migrations',singleOwner:false},{core:'_trainingload_core_migrations',managed:null,singleOwner:false}]){
   const db=service(state);await expect(db.onModuleInit()).rejects.toMatchObject({code:'SELF_HOST_DATABASE_LINEAGE_MISMATCH'});
   expect(db.$disconnect).toHaveBeenCalledTimes(1);
  }
 });
 it('accepts the independent Core lineage',async()=>{
  process.env.SELF_HOST_MODE='core-local';await expect(service({core:'_trainingload_core_migrations',managed:null,singleOwner:true}).onModuleInit()).resolves.toBeUndefined();
 });
 it('leaves Managed database ownership to the Managed entrypoint',async()=>{
  delete process.env.SELF_HOST_MODE;const db=service(null);await db.onModuleInit();expect(db.$queryRaw).not.toHaveBeenCalled();
 });
});
