import { base64ToBytes, bytesToBase64, fromBase64Url, toBase64Url } from './base64';
import type { SaveFile } from './types';

const PREFIX = 'PMO1.';

async function pipe(
  bytes: Uint8Array<ArrayBuffer>,
  stream: CompressionStream | DecompressionStream,
) {
  const out = new Blob([bytes]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(out).arrayBuffer());
}

export async function encodeExportCode(file: SaveFile): Promise<string> {
  const json = new TextEncoder().encode(JSON.stringify(file));
  const gz = await pipe(json, new CompressionStream('gzip'));
  return PREFIX + toBase64Url(bytesToBase64(gz));
}

export async function decodeExportCode(
  code: string,
): Promise<{ ok: true; file: SaveFile } | { ok: false; error: 'BAD_PREFIX' | 'BAD_DATA' }> {
  const trimmed = code.trim();
  if (!trimmed.startsWith(PREFIX)) return { ok: false, error: 'BAD_PREFIX' };
  try {
    const gz = base64ToBytes(fromBase64Url(trimmed.slice(PREFIX.length)));
    const json = await pipe(gz, new DecompressionStream('gzip'));
    return { ok: true, file: JSON.parse(new TextDecoder().decode(json)) as SaveFile };
  } catch {
    return { ok: false, error: 'BAD_DATA' };
  }
}
