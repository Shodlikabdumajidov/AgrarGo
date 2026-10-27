// E2E testlar: haqiqiy PostgreSQL (agrargo_test) va to'liq HTTP stack bilan
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '..',
  roots: ['<rootDir>/test'],
  testRegex: '\\.e2e-spec\\.ts$',
  globalSetup: '<rootDir>/test/global-setup.ts',
  testTimeout: 30000,
};
