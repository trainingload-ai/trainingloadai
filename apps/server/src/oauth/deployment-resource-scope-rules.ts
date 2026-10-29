export type ResourceScopeRule = {
  prefix: string;
  readScope: string | string[];
  writeScope?: string | string[];
};

const deploymentRules: ResourceScopeRule[] = [];

export function registerDeploymentResourceScopeRules(
  rules: readonly ResourceScopeRule[],
) {
  deploymentRules.push(...rules);
}

export function getDeploymentResourceScopeRules() {
  return deploymentRules;
}
