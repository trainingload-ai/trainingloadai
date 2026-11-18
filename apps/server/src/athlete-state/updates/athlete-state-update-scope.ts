import { AsyncLocalStorage } from 'node:async_hooks';
const suppression = new AsyncLocalStorage<boolean>();
export const automaticStateUpdatesSuppressed = () =>
  suppression.getStore() === true;
export const withAutomaticStateUpdatesSuppressed = <T>(
  suppress: boolean,
  run: () => Promise<T>,
) => suppression.run(suppress || automaticStateUpdatesSuppressed(), run);
