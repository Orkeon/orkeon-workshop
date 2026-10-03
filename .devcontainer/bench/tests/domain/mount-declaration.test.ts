import { describe, expect, it } from 'vitest';

import { DomainError } from '../../src/domain/errors.js';
import { isWritable, mountDeclarationSchema } from '../../src/domain/mounts/mount-declaration.js';
import { RESERVED_VIRTUAL_ROOTS, isReservedRoot, parseVirtualRoot } from '../../src/domain/mounts/virtual-root.js';

describe('virtual roots', () => {
  it.each(['/workspace', '/output', '/state', '/mailbox', '/ref-2', '/in_box'])('accepts %s', (root) => {
    expect(parseVirtualRoot(root)).toBe(root);
  });

  it.each(RESERVED_VIRTUAL_ROOTS)('rejects the reserved root %s', (root) => {
    expect(isReservedRoot(root)).toBe(true);
    expect(() => parseVirtualRoot(root)).toThrow(/reserved/);
  });

  it.each(['workspace', '/Workspace', '/a/b', '/', '/-x', '/x y'])('rejects the malformed root %s', (root) => {
    expect(() => parseVirtualRoot(root)).toThrow(DomainError);
  });
});

describe('mount declarations', () => {
  it('parses root, access, role and default binding', () => {
    const declaration = mountDeclarationSchema.parse({ root: '/output', access: 'rw', role: 'deliverables', default: './output' });
    expect(declaration).toEqual({ root: '/output', access: 'rw', role: 'deliverables', default: './output' });
    expect(isWritable(declaration)).toBe(true);
  });

  it('knows ro from rw and rwnd', () => {
    expect(isWritable({ access: 'ro' })).toBe(false);
    expect(isWritable({ access: 'rwnd' })).toBe(true);
  });

  it.each([
    ['unknown access', { root: '/output', access: 'write', role: 'deliverables', default: './output' }],
    ['missing default', { root: '/output', access: 'rw', role: 'deliverables' }],
    ['role with spaces', { root: '/output', access: 'rw', role: 'the deliverables', default: './output' }],
    ['reserved root', { root: '/crew', access: 'ro', role: 'reference', default: './crew' }],
  ])('rejects %s', (_label, input) => {
    expect(mountDeclarationSchema.safeParse(input).success).toBe(false);
  });

  it('30. takes /plugins read-only only, where orkeon-harness-run loads plugins from', () => {
    expect(mountDeclarationSchema.safeParse({ root: '/plugins', access: 'ro', role: 'reference', default: './plugins' }).success).toBe(true);
    for (const access of ['rw', 'rwnd']) {
      const result = mountDeclarationSchema.safeParse({ root: '/plugins', access, role: 'reference', default: './plugins' });
      expect(result.error?.issues.map((issue) => [issue.path.join('.'), issue.message])).toEqual([
        [
          'access',
          '/plugins is where orkeon-harness-run loads plugins from when no --plugins names a folder: declare it "access": "ro", or its agents could drop code that the next run executes',
        ],
      ]);
    }
    expect(mountDeclarationSchema.safeParse({ root: '/plugin', access: 'rw', role: 'state', default: './plugin' }).success).toBe(true);
  });
});
