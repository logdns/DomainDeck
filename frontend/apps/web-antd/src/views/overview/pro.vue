<script lang="ts" setup>
import { computed, onMounted } from "vue";
import { useRouter } from "vue-router";
import {
  ArrowRightLeft,
  Bell,
  ChevronRight,
  CircleAlert,
  Grid,
  Link2,
  LockKeyhole,
  RotateCw,
  Search,
} from "@vben/icons";
import { useUserStore } from "@vben/stores";
import {
  Alert,
  Avatar,
  Button,
  Card,
  Col,
  Empty,
  Progress,
  Row,
  Skeleton,
  Statistic,
  Tag,
} from "ant-design-vue";
import { usePermissions } from "#/composables/use-permissions";
import { $t } from "#/locales";
import { useOverviewStore } from "#/store/overview";
import { expiryTone, providerLabel } from "#/utils/domain-view";

const router = useRouter();
const user = useUserStore();
const overview = useOverviewStore();
const { can } = usePermissions();
onMounted(() => {
  if (!overview.data && !overview.loading) void overview.refresh();
});

const displayName = computed(
  () => user.userInfo?.realName || user.userInfo?.username || "DomainDeck",
);
const expiring = computed(() =>
  [...overview.domains]
    .filter((domain) => domain.daysLeft != null && domain.daysLeft <= 45)
    .sort((a, b) => a.daysLeft! - b.daysLeft!)
    .slice(0, 5),
);
const recentActivity = computed(() => overview.data?.audit?.slice(0, 5) || []);
const shortcuts = computed(() =>
  [
    {
      path: "/domains",
      title: $t("deck.pro.manageDomains"),
      detail: $t("deck.overview.inventoryHint"),
      icon: Grid,
      permission: "domain:read",
    },
    {
      path: "/register",
      title: $t("deck.pro.findDomain"),
      detail: $t("deck.overview.registerHint"),
      icon: Search,
      permission: "domain:read",
    },
    {
      path: "/dns",
      title: $t("deck.pro.manageDns"),
      detail: $t("deck.overview.dnsHint"),
      icon: Link2,
      permission: "dns:read",
    },
    {
      path: "/transfer",
      title: $t("deck.pro.transferDomain"),
      detail: $t("deck.overview.transferHint"),
      icon: ArrowRightLeft,
      permission: "transfer:read",
    },
    {
      path: "/providers",
      title: $t("deck.pro.providers"),
      detail: $t("deck.overview.providerHint"),
      icon: LockKeyhole,
      permission: "settings:read",
    },
    {
      path: "/notifications",
      title: $t("deck.pro.notifications"),
      detail: $t("deck.pro.notificationHint"),
      icon: Bell,
      permission: "settings:read",
    },
  ].filter((item) => can(item.permission)),
);

function go(path: string) {
  void router.push(path);
}
function daysText(days: null | number) {
  if (days == null) return "—";
  if (days < 0) return $t("deck.days.expired", { count: Math.abs(days) });
  return days === 0 ? $t("deck.days.today") : $t("deck.days.remaining", { count: days });
}
function formattedDate(value: string) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "—"
    : new Intl.DateTimeFormat(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      }).format(date);
}
</script>

<template>
  <div class="pro-dashboard" :aria-busy="overview.loading">
    <Alert
      v-if="overview.failed"
      class="pro-alert"
      type="error"
      show-icon
      :message="$t('deck.common.loadFailed')"
      :action="undefined"
    >
      <template #description
        ><Button size="small" :loading="overview.loading" @click="overview.refresh">{{
          $t("deck.common.retry")
        }}</Button></template
      >
    </Alert>
    <Card class="pro-welcome-card" :bordered="false">
      <div class="pro-welcome-copy">
        <Avatar class="pro-welcome-avatar" size="large">{{
          displayName.slice(0, 1).toLocaleUpperCase()
        }}</Avatar>
        <div>
          <h1>{{ $t("deck.pro.greeting", { name: displayName }) }}</h1>
          <p>{{ $t("deck.pro.welcomeHint") }}</p>
          <div class="pro-welcome-state"><span />{{ $t("deck.pro.privateWorkspace") }}</div>
        </div>
      </div>
      <div class="pro-welcome-extra">
        <div>
          <span>{{ $t("deck.overview.total") }}</span
          ><strong>{{ overview.data ? overview.stats.total.toLocaleString() : "—" }}</strong>
        </div>
        <div>
          <span>{{ $t("deck.overview.zones") }}</span
          ><strong>{{ can("dns:read") && overview.data ? overview.stats.zoneTotal.toLocaleString() : "—" }}</strong>
        </div>
        <Button type="primary" :loading="overview.loading" @click="overview.refresh"
          ><RotateCw />{{ $t("deck.common.refresh") }}</Button
        >
      </div>
    </Card>

    <Row :gutter="16" class="pro-metric-row">
      <Col :xs="24" :sm="12" :xl="6"
        ><Card class="pro-metric-card"
          ><Statistic
            :title="$t('deck.overview.total')"
            :value="overview.data ? overview.stats.total : '—'" />
          <div class="pro-metric-foot">
            <span>{{ $t("deck.overview.totalHint", { count: overview.stats.registrars }) }}</span
            ><Grid /></div></Card
      ></Col>
      <Col :xs="24" :sm="12" :xl="6"
        ><Card class="pro-metric-card pro-metric-warning"
          ><Statistic
            :title="$t('deck.overview.expiring')"
            :value="overview.data ? overview.stats.expiring : '—'" />
          <div class="pro-metric-foot">
            <span>{{ $t("deck.overview.expiringHint") }}</span
            ><CircleAlert /></div></Card
      ></Col>
      <Col :xs="24" :sm="12" :xl="6"
        ><Card class="pro-metric-card"
          ><Statistic
            :title="$t('deck.overview.coverage')"
            :value="overview.data ? overview.stats.coverage : '—'"
            suffix="%" /><Progress
            :percent="overview.data ? overview.stats.coverage : 0"
            :show-info="false"
            size="small" /></Card
      ></Col>
      <Col :xs="24" :sm="12" :xl="6"
        ><Card class="pro-metric-card"
          ><Statistic
            :title="$t('deck.overview.zones')"
            :value="can('dns:read') && overview.data ? overview.stats.zoneTotal : '—'" />
          <div class="pro-metric-foot">
            <span>{{ can("dns:read") ? $t("deck.overview.zonesHint", { count: overview.stats.activeZones }) : $t("deck.pro.dnsRestricted") }}</span
            ><Link2 /></div></Card
      ></Col>
    </Row>

    <Row :gutter="16" class="pro-content-row">
      <Col :xs="24" :xl="16">
        <Card class="pro-section-card" :title="$t('deck.pro.expiryTitle')" :bordered="false">
          <template #extra
            ><Button type="link" @click="go('/domains?filter=expiring')"
              >{{ $t("deck.common.viewAll") }}<ChevronRight /></Button
          ></template>
          <Skeleton v-if="overview.loading && !overview.data" active :paragraph="{ rows: 4 }" />
          <Empty
            v-else-if="!overview.data || !expiring.length"
            :description="$t(overview.data ? 'deck.overview.noExpiry' : 'deck.pro.noData')"
          />
          <div v-else class="pro-expiry-list">
            <button
              v-for="domain in expiring"
              :key="`${domain.connectionId}:${domain.name}`"
              type="button"
              class="pro-expiry-item"
              @click="go(`/domains?q=${encodeURIComponent(domain.name)}`)"
            >
              <span class="pro-domain-avatar">{{ domain.name.slice(0, 1).toUpperCase() }}</span>
              <span class="pro-domain-info"
                ><strong>{{ domain.unicodeName || domain.name }}</strong
                ><small>{{ domain.connectionName || providerLabel(domain.provider) }}</small></span
              >
              <span class="pro-expiry-date">{{ formattedDate(domain.expirationDate) }}</span>
              <Tag :color="expiryTone(domain.daysLeft)">{{ daysText(domain.daysLeft) }}</Tag>
              <ChevronRight class="pro-item-arrow" />
            </button>
          </div>
        </Card>
        <Card
          class="pro-section-card pro-activity-card"
          :title="$t('deck.overview.recentActivity')"
          :bordered="false"
        >
          <Empty v-if="!recentActivity.length" :description="$t('deck.overview.noActivity')" />
          <div v-else class="pro-activity-list">
            <div
              v-for="(activity, index) in recentActivity"
              :key="`${activity.ts}:${activity.action}:${index}`"
              class="pro-activity-item"
            >
              <span class="pro-activity-marker" />
              <div>
                <strong>{{ activity.action }}</strong
                ><span>{{ activity.target || activity.summary }}</span>
              </div>
              <time>{{ formattedDate(activity.ts) }}</time>
            </div>
          </div>
        </Card>
      </Col>
      <Col :xs="24" :xl="8">
        <Card
          class="pro-section-card pro-quick-card"
          :title="$t('deck.pro.quickStart')"
          :bordered="false"
        >
          <button
            v-for="item in shortcuts"
            :key="item.path"
            type="button"
            class="pro-quick-item"
            @click="go(item.path)"
          >
            <span class="pro-quick-icon"><component :is="item.icon" /></span
            ><span
              ><strong>{{ item.title }}</strong
              ><small>{{ item.detail }}</small></span
            ><ChevronRight />
          </button>
        </Card>
        <Card class="pro-provider-card" :bordered="false"
          ><div class="pro-provider-icon"><Link2 /></div>
          <h2>{{ $t("deck.pro.providerPrompt") }}</h2>
          <p>{{ $t("deck.pro.providerPromptHint") }}</p>
          <Button v-if="can('settings:read')" type="primary" @click="go('/providers')"
            >{{ $t("deck.overview.addProvider") }}<ChevronRight /></Button
        ></Card>
      </Col>
    </Row>
  </div>
</template>

<style>
.pro-dashboard {
  max-width: 1540px;
  margin: 0 auto;
}
.pro-alert {
  margin-bottom: 16px;
}
.pro-welcome-card {
  margin-bottom: 16px;
  border: 1px solid var(--pro-line);
  border-radius: 8px;
}
.pro-welcome-card > .ant-card-body {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
  padding: 22px 26px;
}
.pro-welcome-copy {
  display: flex;
  align-items: center;
  gap: 16px;
}
.pro-welcome-avatar {
  color: #fff;
  background: #1677ff;
}
.pro-welcome-copy h1 {
  margin: 0 0 5px;
  color: var(--pro-text);
  font-size: 22px;
  line-height: 1.35;
}
.pro-welcome-copy p {
  margin: 0;
  color: var(--pro-muted);
}
.pro-welcome-state {
  display: flex;
  align-items: center;
  gap: 7px;
  margin-top: 7px;
  color: var(--pro-muted);
  font-size: 13px;
}
.pro-welcome-state span {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #39b98a;
}
.pro-welcome-extra {
  display: flex;
  align-items: center;
  gap: 26px;
}
.pro-welcome-extra div {
  display: grid;
  gap: 2px;
}
.pro-welcome-extra div span {
  color: var(--pro-muted);
  font-size: 13px;
}
.pro-welcome-extra div strong {
  color: var(--pro-text);
  font-size: 22px;
}
.pro-welcome-extra .ant-btn,
.pro-provider-card .ant-btn {
  display: inline-flex;
  align-items: center;
  gap: 7px;
}
.pro-welcome-extra svg,
.pro-provider-card .ant-btn svg {
  width: 16px;
  height: 16px;
}
.pro-metric-row {
  row-gap: 16px;
}
.pro-metric-card {
  height: 100%;
  border: 1px solid var(--pro-line);
  border-radius: 8px;
}
.pro-metric-card .ant-statistic-title {
  color: var(--pro-muted);
  font-size: 14px;
}
.pro-metric-card .ant-statistic-content {
  color: var(--pro-text);
  font-size: 30px;
  font-weight: 650;
}
.pro-metric-warning .ant-statistic-content,
.pro-metric-warning .pro-metric-foot > svg {
  color: #d48806;
}
.pro-metric-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-top: 9px;
  color: var(--pro-muted);
  font-size: 13px;
}
.pro-metric-foot svg {
  width: 16px;
  height: 16px;
  flex: 0 0 auto;
  color: var(--pro-brand);
}
.pro-metric-card .ant-progress {
  margin-top: 8px;
}
.pro-content-row {
  margin-top: 16px;
  row-gap: 16px;
}
.pro-section-card {
  border: 1px solid var(--pro-line);
  border-radius: 8px;
}
.pro-section-card + .pro-section-card {
  margin-top: 16px;
}
.pro-section-card > .ant-card-head {
  min-height: 56px;
  padding-inline: 20px;
  border-bottom-color: var(--pro-line);
}
.pro-section-card > .ant-card-head .ant-card-head-title {
  color: var(--pro-text);
  font-size: 16px;
  font-weight: 650;
}
.pro-section-card > .ant-card-body {
  padding: 8px 20px 18px;
}
.pro-section-card .ant-card-extra .ant-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding-inline: 0;
}
.pro-section-card .ant-card-extra svg {
  width: 15px;
  height: 15px;
}
.pro-expiry-item {
  display: flex;
  width: 100%;
  min-height: 68px;
  align-items: center;
  gap: 13px;
  padding: 9px 2px;
  border: 0;
  border-bottom: 1px solid var(--pro-line);
  color: var(--pro-text);
  background: transparent;
  text-align: left;
  cursor: pointer;
}
.pro-expiry-item:last-child {
  border-bottom: 0;
}
.pro-expiry-item:hover .pro-domain-info strong {
  color: var(--pro-brand);
}
.pro-domain-avatar {
  display: grid;
  width: 34px;
  height: 34px;
  flex: 0 0 auto;
  place-items: center;
  border-radius: 7px;
  color: var(--pro-brand);
  background: color-mix(in srgb, var(--pro-brand) 10%, transparent);
  font-weight: 700;
}
.pro-domain-info {
  display: grid;
  min-width: 0;
  flex: 1;
}
.pro-domain-info strong,
.pro-domain-info small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.pro-domain-info strong {
  font-size: 14px;
}
.pro-domain-info small {
  color: var(--pro-muted);
  font-size: 12px;
}
.pro-expiry-date {
  color: var(--pro-muted);
  font-size: 13px;
  white-space: nowrap;
}
.pro-expiry-item .ant-tag {
  margin: 0;
  white-space: nowrap;
}
.pro-item-arrow {
  width: 15px;
  height: 15px;
  flex: 0 0 auto;
  color: var(--pro-muted);
}
.pro-activity-list {
  display: grid;
}
.pro-activity-item {
  position: relative;
  display: flex;
  min-height: 54px;
  align-items: center;
  gap: 11px;
  border-bottom: 1px solid var(--pro-line);
}
.pro-activity-item:last-child {
  border-bottom: 0;
}
.pro-activity-marker {
  width: 8px;
  height: 8px;
  flex: 0 0 auto;
  border: 2px solid var(--pro-brand);
  border-radius: 50%;
}
.pro-activity-item div {
  display: grid;
  min-width: 0;
  flex: 1;
}
.pro-activity-item strong {
  font-size: 13px;
}
.pro-activity-item div span,
.pro-activity-item time {
  overflow: hidden;
  color: var(--pro-muted);
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.pro-quick-card > .ant-card-body {
  padding-top: 4px;
}
.pro-quick-item {
  display: flex;
  width: 100%;
  min-height: 68px;
  align-items: center;
  gap: 12px;
  padding: 8px 2px;
  border: 0;
  border-bottom: 1px solid var(--pro-line);
  color: var(--pro-text);
  background: transparent;
  text-align: left;
  cursor: pointer;
}
.pro-quick-item:last-child {
  border-bottom: 0;
}
.pro-quick-item:hover > span:nth-child(2) strong {
  color: var(--pro-brand);
}
.pro-quick-icon {
  display: grid;
  width: 36px;
  height: 36px;
  flex: 0 0 auto;
  place-items: center;
  border-radius: 7px;
  color: var(--pro-brand);
  background: color-mix(in srgb, var(--pro-brand) 10%, transparent);
}
.pro-quick-icon svg {
  width: 18px;
  height: 18px;
}
.pro-quick-item > span:nth-child(2) {
  display: grid;
  min-width: 0;
  flex: 1;
}
.pro-quick-item strong {
  font-size: 14px;
}
.pro-quick-item small {
  overflow: hidden;
  color: var(--pro-muted);
  text-overflow: ellipsis;
  white-space: nowrap;
}
.pro-quick-item > svg {
  width: 15px;
  height: 15px;
  color: var(--pro-muted);
}
.pro-provider-card {
  margin-top: 16px;
  border: 1px solid #cfe2ff;
  border-radius: 8px;
  background: linear-gradient(135deg, #fff 0%, #f0f6ff 100%);
}
.pro-provider-card > .ant-card-body {
  padding: 22px;
}
.pro-provider-icon {
  display: grid;
  width: 38px;
  height: 38px;
  place-items: center;
  border-radius: 8px;
  color: #1677ff;
  background: #e6f4ff;
}
.pro-provider-icon svg {
  width: 20px;
  height: 20px;
}
.pro-provider-card h2 {
  margin: 13px 0 5px;
  font-size: 17px;
}
.pro-provider-card p {
  color: #697586;
}
html.dark .pro-provider-card {
  border-color: #24426b;
  background: linear-gradient(135deg, #1f2937 0%, #1d2d43 100%);
}
html.dark .pro-provider-icon {
  color: #91caff;
  background: #17365d;
}
html.dark .pro-provider-card p {
  color: #cbd5e1;
}
@media (width <= 1200px) {
  .pro-welcome-extra {
    gap: 15px;
  }
}
@media (width <= 767px) {
  .pro-welcome-card > .ant-card-body {
    align-items: flex-start;
    flex-direction: column;
    padding: 18px;
  }
  .pro-welcome-extra {
    width: 100%;
    justify-content: space-between;
    gap: 12px;
  }
  .pro-welcome-copy h1 {
    font-size: 19px;
  }
  .pro-expiry-item {
    gap: 8px;
  }
  .pro-expiry-date {
    display: none;
  }
  .pro-section-card > .ant-card-body {
    padding-inline: 14px;
  }
}
</style>
