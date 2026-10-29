const selfhost = require('./jest.selfhost.config.cjs');
module.exports = { ...selfhost, testMatch: ['<rootDir>/**/*.spec.ts'], testPathIgnorePatterns: [] };
