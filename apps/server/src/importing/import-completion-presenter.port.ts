export const IMPORT_COMPLETION_PRESENTER = Symbol(
  'IMPORT_COMPLETION_PRESENTER',
);

export type ImportCompletionMessage = {
  title: { key: string; fallback: string };
  body: { key: string; fallback: string };
};

/** Optional deployment extension for source-specific completion copy. */
export interface ImportCompletionPresenter {
  resolve(args: {
    requestContext: Readonly<Record<string, unknown>>;
    completed: boolean;
  }): ImportCompletionMessage | null;
}
