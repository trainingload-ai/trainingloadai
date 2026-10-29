/** @type {import('jest').Config} */
module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: 'src',
  testMatch: [
    '<rootDir>/spec/self-host-app-module-di.spec.ts',
    '<rootDir>/self-host/**/*.spec.ts',
    '<rootDir>/runtime-capabilities/**/*.spec.ts',
    '<rootDir>/config/spec/self-host-*.spec.ts',
    '<rootDir>/storage/spec/storage*.spec.ts',
    '<rootDir>/auth/self-host-mail-auth.spec.ts',
    '<rootDir>/auth/spec/signup-policy.spec.ts',
    '<rootDir>/bootstrap/spec/deployment-edition.spec.ts',
    '<rootDir>/bootstrap/spec/self-host-network-security.spec.ts',
    '<rootDir>/api/intervals-icu/spec/intervals-icu-capability.spec.ts',
    '<rootDir>/api/ai/ai-operations.controller.spec.ts',
    '<rootDir>/api/user/spec/account-deletion-crypto.spec.ts',
    '<rootDir>/integrations/intervals-icu/spec/intervals-icu-credential.service.spec.ts',
  ],
  testPathIgnorePatterns: [
    '<rootDir>/self-host/self-host-bootstrap.migration.spec.ts',
  ],
  transform: {
    '^.+\\.(t|j)s$': [
      'ts-jest',
      { tsconfig: '<rootDir>/../tsconfig.selfhost.json' },
    ],
  },
  moduleNameMapper: {
    '^@prisma/client$': '<rootDir>/../../../packages/prisma/generated/core/index.js',
    '^@deployment/provider-catalog$': '<rootDir>/deployment/provider-catalog.ts',
    '^@/public-demo/(.*)$': '<rootDir>/self-host/public-demo/$1',
    '^@/(.*)$': '<rootDir>/$1',
    '^@shared/(.*)$': '<rootDir>/../../../packages/shared/$1',
    '^src/(.*)$': '<rootDir>/$1',
  },
  testEnvironment: 'node',
  maxWorkers: 2,
  workerIdleMemoryLimit: '768MB',
};
