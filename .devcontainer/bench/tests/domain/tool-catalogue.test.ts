import { describe, expect, it } from 'vitest';

import { parseToolCatalogue } from '../../src/domain/tool-catalogue.js';

describe('parseToolCatalogue', () => {
  it('keeps one snake_case name per line', () => {
    expect(parseToolCatalogue('email_parser\nfile_read\nfile_write\n')).toEqual(['email_parser', 'file_read', 'file_write']);
  });

  it('ignores banners, blank lines and CRLF', () => {
    expect(parseToolCatalogue('Orkeon 1.0.0-rc.4\r\n\r\n  web_search  \r\nwarn: BRAVE_API_KEY is not set\r\n')).toEqual(['web_search']);
  });

  it('returns nothing for an empty output', () => {
    expect(parseToolCatalogue('')).toEqual([]);
  });
});
