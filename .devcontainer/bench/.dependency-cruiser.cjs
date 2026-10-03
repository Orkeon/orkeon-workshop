/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  // Dependency direction: domain <- application <- infrastructure | interface.
  // `npm run test:arch` runs it; tests/arch/dependency-direction.test.ts runs it under vitest too.
  forbidden: [
    {
      name: 'domain-must-not-depend-on-outer-layers',
      severity: 'error',
      comment: 'The domain knows nothing about use cases, adapters or the CLI.',
      from: { path: '^src/domain' },
      to: { path: '^src/(application|infrastructure|interface)' },
    },
    {
      name: 'domain-must-not-use-node',
      severity: 'error',
      comment: 'The domain is pure: no node: builtins.',
      from: { path: '^src/domain' },
      to: { dependencyTypes: ['core'] },
    },
    {
      name: 'domain-may-only-use-zod',
      severity: 'error',
      comment: 'zod is the single library the domain may use (schema language, no I/O).',
      from: { path: '^src/domain' },
      to: { dependencyTypes: ['npm', 'npm-dev', 'npm-optional', 'npm-peer'], pathNot: '^node_modules/zod/' },
    },
    {
      name: 'application-must-not-depend-on-outer-layers',
      severity: 'error',
      comment: 'Use cases talk to the outside world through ports only.',
      from: { path: '^src/application' },
      to: { path: '^src/(infrastructure|interface)' },
    },
    {
      name: 'application-must-not-use-node',
      severity: 'error',
      from: { path: '^src/application' },
      to: { dependencyTypes: ['core'] },
    },
    {
      name: 'application-may-only-use-zod-and-yaml',
      severity: 'error',
      from: { path: '^src/application' },
      to: { dependencyTypes: ['npm', 'npm-dev', 'npm-optional', 'npm-peer'], pathNot: '^node_modules/(zod|yaml)/' },
    },
    {
      name: 'infrastructure-must-not-depend-on-interface',
      severity: 'error',
      from: { path: '^src/infrastructure' },
      to: { path: '^src/interface' },
    },
    {
      name: 'no-circular',
      severity: 'error',
      from: {},
      to: { circular: true },
    },
    {
      name: 'no-orphans',
      severity: 'warn',
      from: { orphan: true, pathNot: ['\\.d\\.ts$'] },
      to: {},
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: 'tsconfig.json' },
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default', 'types'],
      mainFields: ['module', 'main', 'types', 'typings'],
    },
    reporterOptions: {
      text: { highlightFocused: true },
    },
  },
};
