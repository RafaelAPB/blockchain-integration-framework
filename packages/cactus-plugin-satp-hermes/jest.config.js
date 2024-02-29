// packages/subproject/jest.config.js
module.exports = {
  // Your Jest configuration
  moduleNameMapper: {
    "^packages/cactus-plugin-satp-hermes/src/main/typescript/generated/proto/(.+)\\.js$": "<rootDir>/packages/cactus-plugin-satp-hermes/src/main/typescript/generated/proto/$1.ts"
  },
  // Any other configuration options...
};
