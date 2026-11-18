/** Isolates content policy tests; database coordination has PostgreSQL scenarios. */
export function uncontendedGeneration(prisma: {
  $transaction: (work: (tx: any) => Promise<any>) => Promise<any>;
}) {
  return {
    claim: async (scope: any) => ({
      kind: 'ACQUIRED',
      lease: { ...scope, token: 'lease', fence: 1 },
    }),
    bind: async (lease: any, scope: any) => {
      Object.assign(lease, scope);
    },
    publish: (_lease: any, work: (tx: any) => Promise<any>) =>
      prisma.$transaction(work),
    release: async () => undefined,
  } as never;
}
