import {datasetRepairFingerprint} from '../activity-dataset-repair';

describe('repair concurrency fingerprint',()=>{
  const activity={id:1,activityName:'mine',sessionRpe:3,sportType:'RUN',startTime:new Date('2020-01-01')};
  const primary={id:'s',sourceChecksum:'abc',canonicalSnapshotId:'c'};
  const files=[{type:'record',parquetPath:'old',checksum:'d',pointCount:10}];
  const original=()=>datasetRepairFingerprint(activity,primary,files);
  it.each([{activityName:'edited'},{sessionRpe:7},{sportType:'CYCLING'},{startTime:new Date('2020-01-02')},{state:0}])('fences user edits %j',change=>{
    expect(datasetRepairFingerprint({...activity,...change},primary,files)).not.toBe(original());
  });
  it('fences primary switches and concurrent rematerialization',()=>{
    expect(datasetRepairFingerprint(activity,{...primary,id:'new'},files)).not.toBe(original());
    expect(datasetRepairFingerprint(activity,primary,[{...files[0],checksum:'changed'}])).not.toBe(original());
  });
  it('does not conflict with unrelated HEAVY writeback',()=>{
    expect(datasetRepairFingerprint({...activity,updatedAt:new Date(),ecp:210},primary,files)).toBe(original());
  });
});
