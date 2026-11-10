<script lang="ts" setup>
import { computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';

import {
  ArrowRightLeft,
  Bell,
  ChevronRight,
  CircleCheckBig,
  Grid,
  Link2,
  LockKeyhole,
  Plus,
  RotateCw,
  Search,
} from '@vben/icons';
import { preferences } from '@vben/preferences';

import { Alert, Badge, Button, Card, Empty, Table, Tag } from 'ant-design-vue';
import { storeToRefs } from 'pinia';

import Page from '#/components/deck-page.vue';
import MetricCard from '#/components/metric-card.vue';
import { usePermissions } from '#/composables/use-permissions';
import { $t } from '#/locales';
import { useOverviewStore } from '#/store/overview';
import { expiryTone, filterDomains, providerLabel } from '#/utils/domain-view';
import BoardOverview from './board.vue';
import ProOverview from './pro.vue';
import { useInterfaceTemplate } from '#/composables/use-interface-template';

const { interfaceTemplate } = useInterfaceTemplate();

const router = useRouter();
const { can } = usePermissions();
const overview = useOverviewStore();
const { data, domains, failed, loading, stats, updatedAt } =
  storeToRefs(overview);
onMounted(() => {
  void overview.refresh();
});

const updatedLabel = computed(() =>
  updatedAt.value
    ? $t('deck.common.updated', {
        time: new Intl.DateTimeFormat(preferences.app.locale, {
          hour: '2-digit',
          minute: '2-digit',
        }).format(updatedAt.value),
      })
    : $t('deck.common.notSynced'),
);
const ordered = computed(() =>
  filterDomains(domains.value, { filter: 'all', keyword: '', sort: 'expiry' }),
);
const expiring = computed(() =>
  ordered.value.filter(
    (domain) => domain.daysLeft != null && domain.daysLeft <= 45,
  ),
);
const shortcuts = computed(() =>
  [
    {
      path: '/register',
      icon: Search,
      permission: 'domain:read',
      title: 'register',
      hint: 'registerHint',
    },
    {
      path: '/dns',
      icon: Grid,
      permission: 'dns:read',
      title: 'dns',
      hint: 'dnsHint',
    },
    {
      path: '/transfer',
      icon: ArrowRightLeft,
      permission: 'transfer:read',
      title: 'transfer',
      hint: 'transferHint',
    },
    {
      path: '/providers',
      icon: Link2,
      permission: 'settings:read',
      title: 'providers',
      hint: 'providerHint',
    },
  ].filter((action) => can(action.permission)),
);
const columns = computed(() => [
  { title: $t('deck.common.domain'), key: 'name', width: 220 },
  { title: $t('deck.common.provider'), key: 'provider', width: 140 },
  { title: $t('deck.common.expiry'), key: 'expiry', width: 180 },
  { title: $t('deck.common.autorenew'), key: 'autoRenew', width: 120 },
]);

function daysText(days: null | number) {
  if (days == null) return $t('deck.days.unknown');
  if (days < 0) return $t('deck.days.expired', { count: Math.abs(days) });
  return days === 0
    ? $t('deck.days.today')
    : $t('deck.days.remaining', { count: days });
}

function openDomains(filter = 'all') {
  void router.push({
    path: '/domains',
    query: filter === 'all' ? {} : { filter },
  });
}

function activityTime(timestamp: string) {
  const date = new Date(timestamp);
  return Number.isNaN(date.getTime())
    ? '—'
    : new Intl.DateTimeFormat(preferences.app.locale, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }).format(date);
}

function activityLabel(action: string) {
  const known = new Set([
    'domain.renew',
    'domain.register',
    'domain.autorenew',
    'domain.nameservers',
    'domain.transferLock',
    'domain.transferIn',
    'domain.authcode',
    'dns.create',
    'dns.update',
    'dns.delete',
    'dns.save',
    'cache.purge',
    'auth.login',
    'payment.create',
    'payment.default',
    'payment.sync',
    'account.create',
    'role.update',
    'settings.update',
    'order.update',
  ]);
  return known.has(action) ? $t(`deck.actions.${action}`) : action;
}
</script>

<template>
  <BoardOverview v-if="interfaceTemplate === 'boardui'" />
  <ProOverview v-else-if="interfaceTemplate === 'pro'" />
  <Page v-else>
    <template #extra>
      <span class="sync-time" role="status">{{ updatedLabel }}</span>
      <Button :loading="loading" @click="overview.refresh"
        ><template #icon><RotateCw class="size-3.5" /></template
        >{{ $t('deck.common.refresh') }}</Button
      >
    </template>

    <Alert
      v-if="failed"
      class="mb-4"
      type="error"
      show-icon
      :message="$t('deck.common.loadFailed')"
    >
      <template #action
        ><Button size="small" :loading="loading" @click="overview.refresh">{{
          $t('deck.common.retry')
        }}</Button></template
      >
    </Alert>
    <Alert
      v-if="data?.domains?.errors?.length"
      class="mb-4"
      type="warning"
      show-icon
      :message="$t('deck.overview.partialError')"
    />

    <section class="workspace-hero">
      <div class="hero-copy">
        <div class="hero-eyebrow">
          <span />{{ $t('deck.overview.eyebrow') }}
        </div>
        <h2>{{ $t('deck.overview.greeting') }}</h2>
        <p>{{ $t('deck.overview.intro') }}</p>
        <div class="hero-actions">
          <Button class="hero-primary" @click="openDomains()"
            >{{ $t('deck.overview.manageDomains')
            }}<ChevronRight class="ml-1 size-4"
          /></Button>
          <Button
            v-if="can('settings:read')"
            class="hero-secondary"
            @click="router.push('/providers')"
            ><Plus class="mr-1 size-4" />{{
              $t('deck.overview.addProvider')
            }}</Button
          >
        </div>
      </div>
      <div class="hero-summary">
        <div class="hero-summary-label">
          <CircleCheckBig class="size-4" />{{ $t('deck.overview.snapshot') }}
        </div>
        <div class="coverage-value">
          {{ data ? `${stats.coverage}%` : '—'
          }}<span>{{ $t('deck.overview.coverage') }}</span>
        </div>
        <div
          class="coverage-track"
          role="progressbar"
          :aria-label="$t('deck.overview.coverage')"
          :aria-valuenow="stats.coverage"
          :aria-valuemin="0"
          :aria-valuemax="100"
        >
          <span :style="{ width: `${stats.coverage}%` }" />
        </div>
        <p>{{ $t('deck.overview.coverageHint') }}</p>
      </div>
    </section>

    <section class="metrics-grid" :aria-label="$t('deck.overview.snapshot')">
      <MetricCard
        :icon="Grid"
        :label="$t('deck.overview.total')"
        :value="data ? stats.total : '—'"
        :detail="$t('deck.overview.totalHint', { count: stats.registrars })"
        :loading="loading && !data"
        :action-label="$t('deck.overview.manageDomains')"
        @select="openDomains()"
      />
      <MetricCard
        :icon="Bell"
        :label="$t('deck.overview.expiring')"
        :value="data ? stats.expiring : '—'"
        :detail="$t('deck.overview.expiringHint')"
        :tone="stats.critical ? 'danger' : 'warning'"
        :loading="loading && !data"
        :action-label="$t('deck.domainFilter.expiring')"
        @select="openDomains('expiring')"
      />
      <MetricCard
        :icon="RotateCw"
        :label="$t('deck.overview.autoOff')"
        :value="data ? stats.autoOff : '—'"
        :detail="$t('deck.overview.autoOffHint')"
        tone="warning"
        :loading="loading && !data"
        :action-label="$t('deck.domainFilter.noauto')"
        @select="openDomains('noauto')"
      />
      <MetricCard
        v-if="can('dns:read')"
        :icon="Link2"
        :label="$t('deck.overview.zones')"
        :value="data ? stats.zoneTotal : '—'"
        :detail="$t('deck.overview.zonesHint', { count: stats.activeZones })"
        tone="success"
        :loading="loading && !data"
        :action-label="$t('deck.nav.dns')"
        @select="router.push('/dns')"
      />
    </section>

    <section
      v-if="data && !stats.registrars && can('settings:read')"
      class="onboarding-card"
    >
      <div class="onboarding-icon"><Link2 class="size-5" /></div>
      <div>
        <h3>{{ $t('deck.overview.onboarding') }}</h3>
        <p>{{ $t('deck.overview.onboardingHint') }}</p>
      </div>
      <Button type="primary" @click="router.push('/providers')">{{
        $t('deck.overview.addProvider')
      }}</Button>
    </section>

    <div class="overview-grid">
      <div class="main-column">
        <Card :loading="loading && !data">
          <template #title
            ><div>
              {{ $t('deck.overview.timeline')
              }}<span class="section-count">{{ expiring.length }}</span>
              <p class="section-description">
                {{ $t('deck.overview.timelineHint') }}
              </p>
            </div></template
          >
          <template #extra
            ><button class="deck-link" @click="openDomains('expiring')">
              {{ $t('deck.common.viewAll')
              }}<ChevronRight class="size-3" /></button
          ></template>
          <div v-if="expiring.length" class="expiry-list">
            <button
              v-for="domain in expiring.slice(0, 5)"
              :key="`${domain.connectionId}:${domain.name}`"
              class="expiry-row"
              @click="
                router.push({ path: '/domains', query: { q: domain.name } })
              "
            >
              <span class="domain-avatar">{{
                domain.name.slice(0, 1).toUpperCase()
              }}</span>
              <span class="expiry-domain"
                ><strong>{{ domain.unicodeName || domain.name }}</strong
                ><small>{{
                  domain.connectionName || providerLabel(domain.provider)
                }}</small></span
              >
              <span class="expiry-track" aria-hidden="true"
                ><span
                  :data-tone="expiryTone(domain.daysLeft)"
                  :style="{
                    width: `${Math.max(8, Math.min(100, ((45 - (domain.daysLeft ?? 45)) / 45) * 100))}%`,
                  }"
              /></span>
              <Tag :color="expiryTone(domain.daysLeft)">{{
                daysText(domain.daysLeft)
              }}</Tag>
              <ChevronRight class="expiry-arrow size-4" />
            </button>
          </div>
          <Empty
            v-else
            :image="Empty.PRESENTED_IMAGE_SIMPLE"
            :description="$t('deck.overview.noExpiry')"
            ><span class="deck-muted text-xs">{{
              $t('deck.overview.noExpiryHint')
            }}</span></Empty
          >
        </Card>

        <Card :loading="loading && !data">
          <template #title
            ><div>
              {{ $t('deck.overview.inventory') }}
              <p class="section-description">
                {{ $t('deck.overview.inventoryHint') }}
              </p>
            </div></template
          >
          <template #extra
            ><button class="deck-link" @click="openDomains()">
              {{ $t('deck.common.viewAll')
              }}<ChevronRight class="size-3" /></button
          ></template>
          <Table
            v-if="domains.length"
            :columns="columns"
            :data-source="ordered.slice(0, 5)"
            :pagination="false"
            :row-key="(domain: any) => `${domain.connectionId}:${domain.name}`"
            :scroll="{ x: 660 }"
            size="middle"
          >
            <template #bodyCell="{ column, record }">
              <template v-if="column.key === 'name'"
                ><button
                  class="domain-link"
                  @click="
                    router.push({ path: '/domains', query: { q: record.name } })
                  "
                >
                  {{ record.unicodeName || record.name }}</button
                ><span class="table-secondary">{{
                  record.connectionName
                }}</span></template
              >
              <template v-else-if="column.key === 'provider'"
                ><span class="provider-dot" />{{
                  providerLabel(record.provider)
                }}</template
              >
              <template v-else-if="column.key === 'expiry'"
                ><span class="deck-mono text-xs">{{
                  record.expirationDate?.slice(0, 10) || '—'
                }}</span
                ><span class="table-secondary">{{
                  daysText(record.daysLeft)
                }}</span></template
              >
              <template v-else-if="column.key === 'autoRenew'"
                ><Badge
                  :status="record.autoRenew ? 'success' : 'warning'"
                  :text="
                    record.autoRenew
                      ? $t('deck.common.enabled')
                      : $t('deck.common.disabled')
                  "
              /></template>
            </template>
          </Table>
          <Empty
            v-else
            :image="Empty.PRESENTED_IMAGE_SIMPLE"
            :description="$t('deck.overview.emptyTitle')"
            ><p class="deck-muted text-xs">
              {{ $t('deck.overview.emptyHint') }}
            </p></Empty
          >
        </Card>
      </div>

      <aside class="side-column">
        <Card v-if="shortcuts.length" :title="$t('deck.overview.quickActions')">
          <div class="shortcut-list">
            <button
              v-for="action in shortcuts"
              :key="action.path"
              class="shortcut"
              @click="router.push(action.path)"
            >
              <span class="shortcut-icon"
                ><component :is="action.icon" class="size-4" /></span
              ><span
                ><strong>{{ $t(`deck.nav.${action.title}`) }}</strong
                ><small>{{ $t(`deck.overview.${action.hint}`) }}</small></span
              ><ChevronRight class="shortcut-arrow size-4" />
            </button>
          </div>
        </Card>

        <Card
          v-if="can('audit:read')"
          :title="$t('deck.overview.recentActivity')"
          :loading="loading && !data"
        >
          <ol v-if="data?.audit?.length" class="activity-list">
            <li
              v-for="(item, index) in data.audit.slice(0, 4)"
              :key="`${item.ts}:${index}`"
            >
              <span
                class="activity-dot"
                :class="{
                  'is-error': !['ok', 'accepted'].includes(item.status),
                }"
                :aria-label="
                  $t(
                    ['ok', 'accepted'].includes(item.status)
                      ? 'deck.overview.activityOk'
                      : 'deck.overview.activityError',
                  )
                "
              />
              <div>
                <strong>{{ activityLabel(item.action) }}</strong>
                <p>{{ item.target }}</p>
                <time>{{ activityTime(item.ts) }}</time>
              </div>
            </li>
          </ol>
          <Empty
            v-else
            :image="Empty.PRESENTED_IMAGE_SIMPLE"
            :description="$t('deck.overview.noActivity')"
          />
        </Card>

        <Card
          v-if="can('payment:read')"
          :title="$t('deck.overview.finance')"
          :loading="loading && !data"
        >
          <template #extra
            ><button class="deck-link" @click="router.push('/payments')">
              {{ $t('deck.common.manage')
              }}<ChevronRight class="size-3" /></button
          ></template>
          <div
            class="billing-status"
            :class="{ 'billing-enabled': data?.stats?.billingEnabled }"
          >
            <LockKeyhole class="size-4" />
            <div>
              <strong>{{
                $t(
                  data?.stats?.billingEnabled
                    ? 'deck.overview.billingAllowed'
                    : 'deck.overview.billingLocked',
                )
              }}</strong>
              <p>{{ $t('deck.overview.billingHint') }}</p>
            </div>
          </div>
          <div class="payment-line">
            <span>{{ $t('deck.overview.defaultPayment') }}</span
            ><strong>{{
              data?.stats?.defaultPayment || $t('deck.overview.noPayment')
            }}</strong>
          </div>
          <div class="order-caption">
            {{ $t('deck.overview.recentOrders') }}
          </div>
          <div
            v-for="order in data?.orders?.slice(0, 3)"
            :key="order.id"
            class="order-line"
          >
            <span>{{ order.domain }}</span
            ><span>{{
              order.amount == null
                ? '—'
                : `${order.currency || ''} ${order.amount}`
            }}</span>
          </div>
          <p v-if="!data?.orders?.length" class="deck-muted text-xs">
            {{ $t('deck.overview.noOrders') }}
          </p>
        </Card>
      </aside>
    </div>
  </Page>
</template>

<style scoped>
.sync-time {
  margin-right: 4px;
  font-size: var(--dd-font-small);
  color: var(--dd-text-muted);
}
.workspace-hero {
  position: relative;
  display: grid;
  grid-template-columns: minmax(0, 1fr) 260px;
  gap: 40px;
  align-items: center;
  overflow: hidden;
  padding: 30px 34px;
  margin-bottom: 22px;
  color: #fff;
  background: #153b85;
  border: 1px solid #244a92;
  border-radius: 18px;
}
.workspace-hero::after {
  position: absolute;
  top: -140px;
  right: -100px;
  width: 420px;
  height: 420px;
  pointer-events: none;
  content: '';
  border: 70px solid rgb(126 174 255 / 6%);
  border-radius: 50%;
}
.hero-copy,
.hero-summary {
  z-index: 1;
}
.hero-eyebrow {
  display: flex;
  gap: 8px;
  align-items: center;
  margin-bottom: 14px;
  font-size: var(--dd-font-small);
  font-weight: 600;
  letter-spacing: 2px;
  color: #b2cdff;
}
.hero-eyebrow span {
  width: 5px;
  height: 5px;
  background: #8eb8ff;
  border-radius: 50%;
}
.hero-copy h2 {
  max-width: 600px;
  font-size: var(--dd-font-heading);
  font-weight: 700;
  line-height: 1.5;
  letter-spacing: -0.5px;
}
.hero-copy > p {
  max-width: 555px;
  margin-top: 9px;
  font-size: var(--dd-font-body);
  line-height: 1.9;
  color: #c6d8f6;
}
.hero-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 22px;
}
.hero-primary {
  display: inline-flex;
  align-items: center;
  color: #1d4ed8;
  background: #fff;
  border-color: #fff;
}
.hero-secondary {
  display: inline-flex;
  align-items: center;
  color: #e7efff;
  background: rgb(255 255 255 / 5%);
  border-color: rgb(255 255 255 / 30%);
}
.hero-summary {
  padding: 22px;
  background: rgb(255 255 255 / 6%);
  border: 1px solid rgb(255 255 255 / 16%);
  border-radius: 14px;
}
.hero-summary-label {
  display: flex;
  gap: 8px;
  align-items: center;
  font-size: var(--dd-font-small);
  color: #c9dcff;
}
.coverage-value {
  margin-top: 16px;
  font-size: var(--dd-font-metric);
  font-weight: 700;
  letter-spacing: -1px;
}
.coverage-value span {
  display: block;
  margin-top: 1px;
  font-size: var(--dd-font-small);
  font-weight: 400;
  letter-spacing: 0;
  color: #c6d8f6;
}
.coverage-track {
  height: 5px;
  overflow: hidden;
  margin-top: 16px;
  background: rgb(255 255 255 / 14%);
  border-radius: 4px;
}
.coverage-track span {
  display: block;
  height: 100%;
  background: #8bb9ff;
  border-radius: inherit;
}
.hero-summary > p {
  margin-top: 9px;
  font-size: var(--dd-font-small);
  color: #b9ceef;
}
.metrics-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(205px, 1fr));
  gap: 16px;
  margin-bottom: 22px;
}
.overview-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 320px;
  gap: 22px;
  align-items: start;
}
.main-column,
.side-column {
  display: grid;
  min-width: 0;
  gap: 22px;
}
.section-count {
  display: inline-block;
  min-width: 21px;
  padding: 2px 6px;
  margin-left: 8px;
  font-size: var(--dd-font-small);
  line-height: 1.3;
  text-align: center;
  color: var(--dd-brand);
  background: var(--dd-brand-soft);
  border-radius: 5px;
}
.section-description {
  margin-top: 4px;
  font-size: var(--dd-font-small);
  font-weight: 400;
  color: var(--dd-text-muted);
}
.expiry-row {
  display: flex;
  gap: 12px;
  align-items: center;
  width: 100%;
  padding: 16px 0;
  text-align: left;
  background: none;
  border: 0;
  border-bottom: 1px solid var(--dd-border);
  cursor: pointer;
}
.expiry-row:first-child {
  padding-top: 0;
}
.expiry-row:last-child {
  padding-bottom: 0;
  border-bottom: 0;
}
.domain-avatar {
  display: grid;
  width: 36px;
  height: 36px;
  flex-shrink: 0;
  font-size: var(--dd-font-body);
  font-weight: 650;
  color: var(--dd-brand);
  background: var(--dd-brand-soft);
  border: 1px solid var(--dd-border);
  border-radius: 10px;
  place-items: center;
}
.expiry-domain {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
}
.expiry-domain strong {
  overflow: hidden;
  font-family: var(--dd-font-mono);
  font-size: var(--dd-font-body);
  font-weight: 600;
  color: var(--dd-text);
  text-overflow: ellipsis;
  white-space: nowrap;
}
.expiry-domain small {
  margin-top: 4px;
  font-size: var(--dd-font-small);
  color: var(--dd-text-muted);
}
.expiry-track {
  width: 18%;
  height: 4px;
  overflow: hidden;
  margin-right: 6px;
  background: var(--dd-surface-raised);
  border-radius: 4px;
}
.expiry-track span {
  display: block;
  height: 100%;
  background: var(--dd-warning);
  border-radius: inherit;
}
.expiry-track span[data-tone='error'] {
  background: var(--dd-danger);
}
.expiry-arrow {
  color: var(--dd-text-muted);
}
.shortcut-list {
  display: grid;
  gap: 6px;
  margin: -8px;
}
.shortcut {
  display: flex;
  gap: 12px;
  align-items: center;
  width: 100%;
  padding: 10px 8px;
  text-align: left;
  color: var(--dd-text);
  background: none;
  border: 0;
  border-radius: 10px;
  cursor: pointer;
}
.shortcut:hover {
  background: var(--dd-surface-raised);
}
.shortcut-icon {
  display: grid;
  width: 37px;
  height: 37px;
  flex-shrink: 0;
  color: var(--dd-brand);
  background: var(--dd-brand-soft);
  border-radius: 11px;
  place-items: center;
}
.shortcut strong {
  display: block;
  font-size: var(--dd-font-body);
  font-weight: 600;
}
.shortcut small {
  display: block;
  margin-top: 4px;
  font-size: var(--dd-font-small);
  color: var(--dd-text-muted);
}
.shortcut-arrow {
  margin-left: auto;
  color: var(--dd-text-muted);
}
.domain-link {
  padding: 0;
  font-family: var(--dd-font-mono);
  font-size: var(--dd-font-body);
  font-weight: 600;
  color: var(--dd-brand);
  background: none;
  border: 0;
  cursor: pointer;
}
.table-secondary {
  display: block;
  margin-top: 5px;
  font-size: var(--dd-font-small);
  color: var(--dd-text-muted);
}
.provider-dot {
  display: inline-block;
  width: 5px;
  height: 5px;
  margin-right: 7px;
  vertical-align: middle;
  background: var(--dd-brand);
  border-radius: 50%;
}
.activity-list {
  padding: 0;
  margin: 0;
  list-style: none;
}
.activity-list li {
  position: relative;
  display: flex;
  gap: 12px;
  padding-bottom: 20px;
}
.activity-list li:last-child {
  padding-bottom: 0;
}
.activity-list li:not(:last-child)::after {
  position: absolute;
  top: 16px;
  bottom: 2px;
  left: 3px;
  width: 1px;
  content: '';
  background: var(--dd-border);
}
.activity-dot {
  width: 7px;
  height: 7px;
  flex-shrink: 0;
  margin-top: 5px;
  background: var(--dd-brand);
  border-radius: 50%;
}
.activity-dot.is-error {
  background: var(--dd-danger);
}
.activity-list strong {
  font-size: var(--dd-font-body);
  font-weight: 600;
  color: var(--dd-text);
}
.activity-list p {
  margin-top: 2px;
  overflow-wrap: anywhere;
  font-size: var(--dd-font-small);
  color: var(--dd-text-secondary);
}
.activity-list time {
  display: block;
  margin-top: 5px;
  font-size: var(--dd-font-small);
  color: var(--dd-text-muted);
}
.billing-status {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  padding: 13px;
  color: var(--dd-success);
  background: var(--dd-success-soft);
  border-radius: 10px;
}
.billing-enabled {
  color: var(--dd-warning);
  background: var(--dd-warning-soft);
}
.billing-status strong {
  font-size: var(--dd-font-small);
  font-weight: 600;
}
.billing-status p {
  margin-top: 5px;
  font-size: var(--dd-font-small);
}
.payment-line {
  display: grid;
  gap: 6px;
  padding-block: 16px;
  font-size: var(--dd-font-small);
  color: var(--dd-text-muted);
  border-bottom: 1px solid var(--dd-border);
}
.payment-line strong {
  font-size: var(--dd-font-body);
  color: var(--dd-text);
}
.order-caption {
  margin-block: 14px 10px;
  font-size: var(--dd-font-small);
  color: var(--dd-text-muted);
}
.order-line {
  display: flex;
  gap: 8px;
  justify-content: space-between;
  margin-top: 9px;
  font-family: var(--dd-font-mono);
  font-size: var(--dd-font-small);
  color: var(--dd-text-secondary);
}
.order-line span:first-child {
  overflow: hidden;
  text-overflow: ellipsis;
}
.onboarding-card {
  display: flex;
  gap: 16px;
  align-items: center;
  padding: 22px;
  margin-bottom: 22px;
  background: var(--dd-brand-soft);
  border: 1px solid var(--dd-border);
  border-radius: var(--dd-radius);
}
.onboarding-icon {
  color: var(--dd-brand);
}
.onboarding-card h3 {
  font-size: var(--dd-font-card-title);
  font-weight: 600;
  color: var(--dd-text);
}
.onboarding-card p {
  max-width: 780px;
  margin-top: 6px;
  font-size: var(--dd-font-body);
  line-height: 1.8;
  color: var(--dd-text-secondary);
}
.onboarding-card > .ant-btn {
  flex-shrink: 0;
  margin-left: auto;
}
@media (width <= 1250px) {
  .overview-grid {
    grid-template-columns: minmax(0, 1fr) 285px;
    gap: 16px;
  }
  .workspace-hero {
    gap: 24px;
    padding: 26px;
  }
  .metrics-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .expiry-track {
    display: none;
  }
}
@media (width <= 1000px) {
  .overview-grid {
    grid-template-columns: minmax(0, 1fr);
  }
  .side-column {
    grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
    align-items: start;
  }
}
@media (width <= 768px) {
  .workspace-hero {
    grid-template-columns: minmax(0, 1fr);
    gap: 20px;
    padding: 24px;
  }
  .hero-copy h2 {
    font-size: 26px;
  }
  .hero-summary {
    display: none;
  }
  .metrics-grid {
    gap: 10px;
  }
  .onboarding-card {
    flex-wrap: wrap;
  }
  .onboarding-card > .ant-btn {
    margin-left: 0;
  }
  .sync-time {
    display: none;
  }
  .expiry-row {
    gap: 8px;
  }
  .expiry-row .ant-tag {
    margin: 0;
    font-size: var(--dd-font-small);
  }
  .expiry-arrow {
    display: none;
  }
}
@media (width <= 420px) {
  .domain-avatar {
    display: none;
  }
}
</style>
