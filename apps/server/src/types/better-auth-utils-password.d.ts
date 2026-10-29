// @better-auth/utils 0.4.1 publishes CJS/ESM declarations but omits an
// explicit `types` export condition. Keep the narrow surface used by the
// self-host management path typed until the upstream export map includes it.
declare module '@better-auth/utils/password' {
  export function hashPassword(password: string): Promise<string>;
  export function verifyPassword(
    hash: string,
    password: string,
  ): Promise<boolean>;
}
