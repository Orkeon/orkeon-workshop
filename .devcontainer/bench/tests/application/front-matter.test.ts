import { describe, expect, it } from 'vitest';

import { ApplicationError } from '../../src/application/errors.js';
import { logLines, parseFrontMatter } from '../../src/application/status/front-matter.js';

describe('parseFrontMatter', () => {
  it('splits the YAML block from the body', () => {
    const document = parseFrontMatter('---\nphase: need\ngate_passed: false\n---\n\n- 2026-09-30 10:02 — /team-init\n');
    expect(document.data).toEqual({ phase: 'need', gate_passed: false });
    expect(document.body).toBe('\n- 2026-09-30 10:02 — /team-init\n');
  });

  it('tolerates CRLF, a BOM and a closing fence at end of file', () => {
    expect(parseFrontMatter('﻿---\r\nphase: need\r\n---\r\nbody').data).toEqual({ phase: 'need' });
    expect(parseFrontMatter('---\nphase: need\n---').body).toBe('');
  });

  it('rejects a file without front matter', () => {
    expect(() => parseFrontMatter('# Status\n')).toThrow(ApplicationError);
    expect(() => parseFrontMatter('# Status\n')).toThrow(/must start with a "---" line/);
  });

  it('rejects an unterminated block and invalid YAML', () => {
    expect(() => parseFrontMatter('---\nphase: need\n')).toThrow(/unterminated/);
    expect(() => parseFrontMatter('---\nphase: [\n---\n')).toThrow(/not valid YAML/);
  });
});

describe('logLines', () => {
  it('keeps the bullets and drops the rest', () => {
    expect(logLines('# Title\n\n- first\n  - nested\ntext\n- second \n')).toEqual(['first', 'nested', 'second']);
  });
});
