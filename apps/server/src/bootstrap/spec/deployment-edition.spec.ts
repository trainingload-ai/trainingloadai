import { assertDeploymentEdition } from '../deployment-edition';

describe('build edition startup assertion', () => {
  it('defaults only the public entrypoint to self-host', () => {
    const env: NodeJS.ProcessEnv = {};
    assertDeploymentEdition('self-host', env);
    expect(env).toMatchObject({ DEPLOYMENT_MODE: 'self-host', SELF_HOST_MODE: 'core-local' });
    expect(() => assertDeploymentEdition('cloud', {})).toThrow(/DEPLOYMENT_MODE=cloud/);
  });
  it('rejects both cross-edition combinations', () => {
    expect(() => assertDeploymentEdition('self-host', { DEPLOYMENT_MODE: 'cloud' })).toThrow();
    expect(() => assertDeploymentEdition('cloud', { DEPLOYMENT_MODE: 'self-host' })).toThrow();
    expect(() => assertDeploymentEdition('cloud', { DEPLOYMENT_MODE: 'cloud', SELF_HOST_MODE: 'core-local' })).toThrow();
  });
});
