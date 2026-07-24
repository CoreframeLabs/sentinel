/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  testTimeout: 30000,
  // Integration tests share one test database; never run suites concurrently.
  maxWorkers: 1,
};
