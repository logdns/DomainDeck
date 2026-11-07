import { describe, expect, it } from 'vitest';

import { toCsv } from '../csv';

describe('CSV export', () => {
  it('neutralizes formulas after whitespace while preserving the DNS root label', () => {
    expect(toCsv(['value'], [['  +cmd'], ['@SUM(A1)'], ['=1'], ['@']]))
      .toBe("value\r\n'  +cmd\r\n'@SUM(A1)\r\n'=1\r\n@");
  });

  it('quotes multiline text, commas and double quotes', () => {
    expect(toCsv(['value'], [['a"b,c\nd']])).toBe('value\r\n"a""b,c\nd"');
  });
});
