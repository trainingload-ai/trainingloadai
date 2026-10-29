/**
 * Backward-compatible public entry point for the versioned plan-template
 * registry. Concrete templates live under ./plan-templates/.
 */
export * from "./plan-templates/registry";
export * from "./plan-templates/running/intensity-resolver";
