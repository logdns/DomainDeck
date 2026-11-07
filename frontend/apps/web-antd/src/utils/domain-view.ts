import type { DomainItem } from '../api/domaindeck';

export type DomainFilter = 'all' | 'expiring' | 'noauto';
export type DomainSort = 'expiry' | 'name';

export function normalizeDomainFilter(value: unknown): DomainFilter {
  return value === 'expiring' || value === 'noauto' ? value : 'all';
}

export function providerLabel(provider: string) {
  return (
    (
      {
        cloudflare: 'Cloudflare',
        spaceship: 'Spaceship',
        porkbun: 'Porkbun',
        godaddy: 'GoDaddy',
        namecheap: 'Namecheap',
      } as Record<string, string>
    )[provider] ||
    provider ||
    '—'
  );
}

export function filterDomains(
  items: DomainItem[],
  options: {
    connection?: string;
    filter: DomainFilter;
    keyword: string;
    sort: DomainSort;
  },
) {
  const keyword = options.keyword.trim().toLocaleLowerCase();
  return items
    .filter((domain) => {
      if (
        options.filter === 'expiring' &&
        (domain.daysLeft == null || domain.daysLeft > 45)
      )
        return false;
      if (options.filter === 'noauto' && domain.autoRenew) return false;
      if (options.connection && domain.connectionId !== options.connection)
        return false;
      return (
        !keyword ||
        [domain.name, domain.unicodeName, domain.connectionName].some((value) =>
          value?.toLocaleLowerCase().includes(keyword),
        )
      );
    })
    .sort((left, right) =>
      options.sort === 'name'
        ? left.name.localeCompare(right.name)
        : (left.daysLeft ?? Infinity) - (right.daysLeft ?? Infinity) ||
          left.name.localeCompare(right.name),
    );
}

export function expiryTone(days: null | number | undefined) {
  if (days == null) return 'default';
  if (days <= 14) return 'error';
  if (days <= 45) return 'warning';
  return 'success';
}
