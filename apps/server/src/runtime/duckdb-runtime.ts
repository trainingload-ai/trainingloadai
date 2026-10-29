type DuckDBModule = typeof import('@duckdb/node-api');

let duckDBModulePromise: Promise<DuckDBModule> | undefined;

/** Load the native DuckDB binding only when a Parquet operation needs it. */
export function loadDuckDBModule(): Promise<DuckDBModule> {
  duckDBModulePromise ??= import('@duckdb/node-api');
  return duckDBModulePromise;
}
