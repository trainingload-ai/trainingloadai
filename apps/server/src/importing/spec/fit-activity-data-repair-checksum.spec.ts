jest.mock('../trackswap-file', () => ({ decodeTrackFile: jest.fn() }));

import { FitActivityDataRepairService } from '../fit-activity-data-repair.service';
import { decodeTrackFile } from '../trackswap-file';

const md5 = '900150983cd24fb0d6963f7d28e17f72';
const sha256 =
  'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad';

function scanner(rawChecksum: string, bytes = 'abc') {
  const source = {
    id: 'source-1',
    rawStorageKey: 'source.gpx',
    rawChecksum,
    activitySources: [],
  };
  const service = new FitActivityDataRepairService(
    {} as never,
    { getFileWithKey: async () => Buffer.from(bytes) } as never,
    { sourceObjects: () => ({ findMany: async () => [source] }) } as never,
  );
  return { service, source };
}

describe('repair scanner source integrity', () => {
  beforeEach(() => jest.resetAllMocks());

  it.each([md5, sha256])(
    'continues scanning a non-FIT source with a valid stored digest %s',
    async (checksum) => {
      jest.mocked(decodeTrackFile).mockResolvedValueOnce({
        detectedFormat: 'gpx',
      } as never);
      const { service, source } = scanner(checksum);
      const result = await service.scan({
        all: false,
        limit: 1,
        failFast: true,
      });
      expect(result.failures).toEqual([]);
      expect(result.noRecoverableData).toBe(1);
      expect(decodeTrackFile).toHaveBeenCalledTimes(1);
      expect(source.rawChecksum).toBe(checksum);
    },
  );

  it.each([md5, sha256, 'malformed'])(
    'stops before decoding changed or unrecognized source digest %s',
    async (checksum) => {
      const { service } = scanner(checksum, 'altered');
      const result = await service.scan({
        all: false,
        limit: 1,
        failFast: true,
      });
      expect(result.failures).toEqual([
        { sourceObjectId: 'source-1', code: 'RAW_CHECKSUM_MISMATCH' },
      ]);
      expect(result.candidates).toEqual([]);
      expect(result.invalidFitFiles).toBe(0);
      expect(decodeTrackFile).not.toHaveBeenCalled();
    },
  );
});
