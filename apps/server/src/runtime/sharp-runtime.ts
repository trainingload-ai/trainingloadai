type SharpFactory = typeof import('sharp').default;

let sharpFactoryPromise: Promise<SharpFactory> | undefined;

/** Load the native Sharp binding only for image-backed map/elevation work. */
export function loadSharp(): Promise<SharpFactory> {
  sharpFactoryPromise ??= import('sharp').then((module) => {
    const direct = module as unknown;
    const first = (direct as { default?: unknown })?.default;
    const factory =
      typeof direct === 'function'
        ? direct
        : typeof first === 'function'
          ? first
          : (first as { default?: unknown } | undefined)?.default;
    if (typeof factory !== 'function') {
      throw new Error('Sharp runtime did not expose a callable factory');
    }
    return factory as unknown as SharpFactory;
  });
  return sharpFactoryPromise;
}
