const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

/** Compose ownership-disjoint catalogs; locale fallback is a separate step. */
export function mergeCatalogs(core, extension, prefix = '') {
  if (!isObject(core) || !isObject(extension)) throw new Error(`Invalid catalog at ${prefix || '<root>'}`);
  const result = { ...core };
  for (const [key, value] of Object.entries(extension)) {
    if (['__proto__', 'constructor', 'prototype'].includes(key)) throw new Error(`Unsafe catalog key: ${key}`);
    const path = prefix ? `${prefix}.${key}` : key;
    if (Object.hasOwn(core, key)) {
      if (!isObject(core[key]) || !isObject(value)) throw new Error(`Duplicate message leaf: ${path}`);
      result[key] = mergeCatalogs(core[key], value, path);
    } else result[key] = value;
  }
  return result;
}
