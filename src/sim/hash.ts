/** 53-bit string hash (cyrb53). Stable across engines; used for checksums and state hashes. */
export function cyrb53(text: string, seed = 0): number {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}

function byFirst(a: readonly [string, string], b: readonly [string, string]): number {
  return a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0;
}

/**
 * JSON with sorted object keys, Maps as sorted entries and typed arrays tagged by type,
 * so equal states always give equal strings. Non-finite numbers are a bug, so they throw.
 */
export function canonicalStringify(value: unknown): string {
  if (value === null || value === undefined) return 'null';
  switch (typeof value) {
    case 'number':
      if (!Number.isFinite(value)) throw new Error(`cannot hash a non-finite number: ${value}`);
      return JSON.stringify(Object.is(value, -0) ? 0 : value);
    case 'string':
      return JSON.stringify(value);
    case 'boolean':
      return value ? 'true' : 'false';
    case 'object':
      break;
    default:
      throw new Error(`cannot hash a ${typeof value}`);
  }
  if (Array.isArray(value)) return `[${value.map((v) => canonicalStringify(v)).join(',')}]`;
  if (ArrayBuffer.isView(value) && !(value instanceof DataView)) {
    const items = Array.from(value as unknown as ArrayLike<number>, (n) => canonicalStringify(n));
    return `{"$ta":"${value.constructor.name}","v":[${items.join(',')}]}`;
  }
  if (value instanceof Map) {
    const entries = [...value.entries()]
      .map(([k, v]) => [canonicalStringify(k), canonicalStringify(v)] as const)
      .sort(byFirst);
    return `{"$map":[${entries.map(([k, v]) => `[${k},${v}]`).join(',')}]}`;
  }
  if (value instanceof Set) {
    const items = [...value].map((v) => canonicalStringify(v)).sort();
    return `{"$set":[${items.join(',')}]}`;
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj)
    .filter((k) => obj[k] !== undefined)
    .sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalStringify(obj[k])}`).join(',')}}`;
}

export function hashState(value: unknown): string {
  return cyrb53(canonicalStringify(value)).toString(16).padStart(14, '0');
}
