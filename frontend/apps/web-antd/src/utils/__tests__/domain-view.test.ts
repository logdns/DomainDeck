import type { DomainItem } from '../../api/domaindeck';

import { describe, expect, it } from 'vitest';

import {
  expiryTone,
  filterDomains,
  normalizeDomainFilter,
  providerLabel,
} from '../domain-view';

const domains = [
  {
    name: 'alpha.test',
    unicodeName: '阿尔法.test',
    connectionId: 'one',
    connectionName: 'Personal',
    daysLeft: 50,
    autoRenew: true,
  },
  {
    name: 'bravo.test',
    connectionId: 'two',
    connectionName: 'Team',
    daysLeft: -1,
    autoRenew: false,
  },
  {
    name: 'charlie.test',
    connectionId: 'one',
    connectionName: 'Personal',
    daysLeft: null,
    autoRenew: false,
  },
  {
    name: 'delta.test',
    connectionId: 'one',
    connectionName: 'Personal',
    daysLeft: 0,
    autoRenew: true,
  },
] as DomainItem[];

describe('domain portfolio view', () => {
  it('normalizes invalid URL filters', () => {
    expect(normalizeDomainFilter('noauto')).toBe('noauto');
    expect(normalizeDomainFilter(['expiring'])).toBe('all');
    expect(normalizeDomainFilter('unknown')).toBe('all');
  });
  it('includes expired and today but excludes unknown expirations', () => {
    expect(
      filterDomains(domains, {
        keyword: '',
        filter: 'expiring',
        sort: 'expiry',
      }).map((domain) => domain.name),
    ).toEqual(['bravo.test', 'delta.test']);
  });
  it('combines renewal and connection filters', () => {
    expect(
      filterDomains(domains, {
        connection: 'one',
        keyword: '',
        filter: 'noauto',
        sort: 'name',
      }).map((domain) => domain.name),
    ).toEqual(['charlie.test']);
  });
  it('searches ASCII, Unicode and connection labels', () => {
    for (const keyword of [' ALPHA ', '阿尔法', 'Team']) {
      expect(
        filterDomains(domains, { keyword, filter: 'all', sort: 'name' }),
      ).toHaveLength(1);
    }
  });
  it('sorts unknown dates last without mutating input', () => {
    const result = filterDomains(domains, {
      keyword: '',
      filter: 'all',
      sort: 'expiry',
    });
    expect(result.at(-1)?.name).toBe('charlie.test');
    expect(domains[0]?.name).toBe('alpha.test');
  });
  it('does not label every third-party registrar as Spaceship', () => {
    expect(providerLabel('porkbun')).toBe('Porkbun');
    expect(providerLabel('custom-reg')).toBe('custom-reg');
  });
  it('uses consistent expiry boundaries', () => {
    expect(expiryTone(null)).toBe('default');
    expect(expiryTone(14)).toBe('error');
    expect(expiryTone(45)).toBe('warning');
    expect(expiryTone(46)).toBe('success');
  });
});
