import { describe, expect, it } from 'vitest';

import english from '../../locales/langs/en-US/deck.json';
import chinese from '../../locales/langs/zh-CN/deck.json';

function flatten(
  messages: Record<string, unknown>,
  prefix = '',
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(messages).flatMap(([key, value]) => {
      const fullKey = prefix ? `${prefix}.${key}` : key;
      return typeof value === 'string'
        ? [[fullKey, value]]
        : Object.entries(flatten(value as Record<string, unknown>, fullKey));
    }),
  );
}

describe('DomainDeck locale contract', () => {
  it('uses nested objects rather than ambiguous dotted message keys', () => {
    function check(messages: Record<string, unknown>) {
      for (const [key, value] of Object.entries(messages)) {
        expect(key).not.toContain('.');
        if (typeof value !== 'string') check(value as Record<string, unknown>);
      }
    }
    check(chinese);
    check(english);
  });
  it('keeps identical keys and interpolation variables in both languages', () => {
    const source = flatten(chinese);
    const target = flatten(english);
    expect(Object.keys(target).sort()).toEqual(Object.keys(source).sort());
    for (const [key, value] of Object.entries(source)) {
      expect((target[key]?.match(/\{\w+\}/g) ?? []).sort(), key).toEqual(
        (value.match(/\{\w+\}/g) ?? []).sort(),
      );
    }
  });
});
