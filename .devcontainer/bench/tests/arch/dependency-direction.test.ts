import { execFile } from 'node:child_process';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { describe, expect, it } from 'vitest';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SRC = join(ROOT, 'src');
const LAYERS = ['domain', 'application', 'infrastructure', 'interface'] as const;
type Layer = (typeof LAYERS)[number];

/** Who may import whom: domain ← application ← infrastructure | interface (interface also wires infrastructure). */
const ALLOWED: Record<Layer, readonly Layer[]> = {
  domain: ['domain'],
  application: ['domain', 'application'],
  infrastructure: ['domain', 'application', 'infrastructure'],
  interface: ['domain', 'application', 'infrastructure', 'interface'],
};
const ALLOWED_PACKAGES: Record<Layer, readonly string[]> = {
  domain: ['zod'],
  application: ['zod', 'yaml'],
  infrastructure: ['zod', 'yaml'],
  interface: ['zod', 'yaml', 'commander'],
};

function sourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    return statSync(path).isDirectory() ? sourceFiles(path) : path.endsWith('.ts') ? [path] : [];
  });
}

function imports(file: string): string[] {
  const text = readFileSync(file, 'utf8');
  const specifiers: string[] = [];
  for (const match of text.matchAll(/^\s*(?:import|export)\s[^'"]*?from\s+['"]([^'"]+)['"]/gm)) {
    specifiers.push(match[1] as string);
  }
  for (const match of text.matchAll(/import\(\s*['"]([^'"]+)['"]\s*\)/g)) {
    specifiers.push(match[1] as string);
  }
  return specifiers;
}

function layerOf(file: string): Layer {
  const first = relative(SRC, file).split('/')[0] as Layer;
  if (!LAYERS.includes(first)) {
    throw new Error(`${file} is outside the four layers`);
  }
  return first;
}

describe('dependency direction (import scan)', () => {
  const files = sourceFiles(SRC);

  it('finds the four layers', () => {
    expect(files.length).toBeGreaterThan(10);
    expect(new Set(files.map(layerOf))).toEqual(new Set(LAYERS));
  });

  it.each(files.map((file) => [relative(ROOT, file)]))('%s only imports what its layer may', (relativeFile) => {
    const file = join(ROOT, relativeFile);
    const layer = layerOf(file);
    for (const specifier of imports(file)) {
      if (specifier.startsWith('.')) {
        const target = join(dirname(file), specifier.replace(/\.js$/, '.ts'));
        if (target.startsWith(SRC)) {
          expect(ALLOWED[layer], `${relativeFile} → ${specifier}`).toContain(layerOf(target));
        }
      } else if (specifier.startsWith('node:')) {
        expect(['infrastructure', 'interface'], `${relativeFile} imports ${specifier}`).toContain(layer);
      } else {
        expect(ALLOWED_PACKAGES[layer], `${relativeFile} imports package ${specifier}`).toContain(specifier.split('/')[0]);
      }
    }
  });

  it('keeps console out of domain, application and infrastructure', () => {
    for (const file of files.filter((candidate) => layerOf(candidate) !== 'interface')) {
      expect(readFileSync(file, 'utf8'), relative(ROOT, file)).not.toMatch(/\bconsole\./);
    }
  });
});

describe('dependency direction (dependency-cruiser)', () => {
  // dependency-cruiser loads the TypeScript compiler: about 1 s on a local disk, up to a minute
  // on a slow bind mount under load. The timeout only bounds a hang.
  it('passes the rules of .dependency-cruiser.cjs', { timeout: 300_000 }, async () => {
    const depcruise = join(ROOT, 'node_modules', 'dependency-cruiser', 'bin', 'dependency-cruise.mjs');
    const args = [depcruise, '--config', '.dependency-cruiser.cjs', '--output-type', 'err', 'src'];
    const result = await promisify(execFile)(process.execPath, args, { cwd: ROOT }).catch(
      (error: { stdout?: string; stderr?: string; code?: number }) => ({ stdout: error.stdout ?? '', stderr: `${error.stderr ?? ''}\nexit ${String(error.code)}` }),
    );
    expect(result.stderr.trim(), result.stdout).toBe('');
    expect(result.stdout).toMatch(/no dependency violations found/);
  });
});
