import { describe, expect, it } from 'vitest';

import { typography } from '../../design/typography';

describe('readable typography defaults', () => {
  it('keeps body and secondary text above the readability baseline', () => {
    expect(typography.fontSize).toBeGreaterThanOrEqual(16);
    expect(typography.fontSizeSM).toBeGreaterThanOrEqual(14);
    expect(typography.fontSizeLG).toBeGreaterThan(typography.fontSize);
  });

  it('provides space for larger text in normal and compact controls', () => {
    expect(typography.controlHeight).toBeGreaterThanOrEqual(42);
    expect(typography.controlHeightSM).toBeGreaterThanOrEqual(34);
    expect(typography.lineHeight).toBeGreaterThanOrEqual(1.5);
  });

  it('uses local CJK and system fonts without a network font dependency', () => {
    expect(typography.fontFamily).toContain('PingFang SC');
    expect(typography.fontFamily).toContain('Microsoft YaHei');
    expect(typography.fontFamily).toContain('system-ui');
    expect(typography.fontFamily).not.toMatch(/url\(|https?:/);
  });
});
