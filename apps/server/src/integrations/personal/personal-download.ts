import { lookup } from 'node:dns/promises';
import { get } from 'node:https';
import { isIP } from 'node:net';
import { PersonalProviderError } from './personal-errors';

export function publicDownloadAddress(address: string) {
  if (isIP(address) !== 4) return false;
  const [a, b, c] = address.split('.').map(Number);
  return !(
    a === 0 ||
    a === 10 ||
    a === 127 ||
    a >= 224 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && (b === 168 || b === 0 || b === 2)) ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
    (a === 203 && b === 0 && c === 113)
  );
}

/** Pinned DNS lookup prevents signed upstream links from reaching local services. */
export async function downloadCorosFile(raw: string): Promise<Buffer> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new PersonalProviderError('PROVIDER_DOWNLOAD_URL_INVALID');
  }
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    (url.port && url.port !== '443') ||
    isIP(url.hostname)
  )
    throw new PersonalProviderError('PROVIDER_DOWNLOAD_URL_INVALID');
  const addresses = await lookup(url.hostname, { all: true, family: 4 }).catch(
    () => [],
  );
  if (
    !addresses.length ||
    addresses.some((entry) => !publicDownloadAddress(entry.address))
  )
    throw new PersonalProviderError('PROVIDER_DOWNLOAD_URL_REJECTED');
  return new Promise((resolve, reject) => {
    const error = () =>
      reject(new PersonalProviderError('PROVIDER_DOWNLOAD_FAILED'));
    const req = get(
      url,
      {
        // Never attach the MCP access token to the signed file request.
        signal: AbortSignal.timeout(60_000),
        headers: { Accept: 'application/octet-stream' },
        lookup: ((_host, options, callback) => {
          const address = addresses[0];
          if (options.all) callback(null, [address]);
          else callback(null, address.address, address.family);
        }) as any,
      },
      (response) => {
        if (
          response.statusCode !== 200 ||
          Number(response.headers['content-length']) > 64 * 1024 * 1024
        ) {
          response.destroy();
          error();
          return;
        }
        const chunks: Buffer[] = [];
        let bytes = 0;
        response.on('data', (chunk: Buffer) => {
          bytes += chunk.length;
          if (bytes > 64 * 1024 * 1024) {
            response.destroy();
            error();
          } else chunks.push(chunk);
        });
        response.on('error', error);
        response.on('end', () =>
          bytes ? resolve(Buffer.concat(chunks)) : error(),
        );
      },
    );
    req.on('error', error);
  });
}
