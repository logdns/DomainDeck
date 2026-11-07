<script lang="ts" setup>
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import { useAccess } from '@vben/access';
import { Download, RotateCw, Search, SearchX } from '@vben/icons';

import Page from '#/components/deck-page.vue';
import { $t } from '#/locales';
import {
  filterDomains,
  normalizeDomainFilter,
  providerLabel,
} from '#/utils/domain-view';

import {
  Button,
  Card,
  Descriptions,
  DescriptionsItem,
  Drawer,
  Empty,
  Input,
  InputNumber,
  message,
  Modal,
  Select,
  Space,
  Switch,
  Table,
  Tag,
  Textarea,
} from 'ant-design-vue';
import dayjs from 'dayjs';

import { downloadCsv, stamped } from '#/utils/csv';
import { requestClient } from '#/api/request';

import {
  checkAvailability,
  getAuthCode,
  getDomain,
  getDomains,
  getPayments,
  renewDomain,
  setAutorenew,
  setNameservers,
  setTransferLock,
} from '#/api/domaindeck';

const { hasAccessByCodes } = useAccess();
const route = useRoute();
const router = useRouter();
const canWrite = computed(() => hasAccessByCodes(['domain:write']));
const canBill = computed(() => hasAccessByCodes(['domain:billing']));
const canTransfer = computed(() => hasAccessByCodes(['transfer:write']));

const loading = ref(false);
const items = ref<any[]>([]);
function setQuery(values: Record<string, string | undefined>) {
  void router.replace({ query: { ...route.query, ...values } });
}
const keyword = computed({
  get: () => (typeof route.query.q === 'string' ? route.query.q : ''),
  set: (value: string) => setQuery({ q: value || undefined }),
});
const filter = computed({
  get: () => normalizeDomainFilter(route.query.filter),
  set: (value: 'all' | 'expiring' | 'noauto') =>
    setQuery({ filter: value === 'all' ? undefined : value }),
});
const registrarFilter = computed({
  get: () =>
    typeof route.query.connection === 'string'
      ? route.query.connection
      : undefined,
  set: (value: string | undefined) => setQuery({ connection: value }),
});
const sort = computed({
  get: () =>
    route.query.sort === 'name' ? ('name' as const) : ('expiry' as const),
  set: (value: 'expiry' | 'name') =>
    setQuery({ sort: value === 'name' ? value : undefined }),
});
const failed = ref(false);
const currentPage = ref(1);
const pendingAuto = ref(new Set<string>());
const errors = ref<any[]>([]);

const detailOpen = ref(false);
const detailLoading = ref(false);
const detail = ref<any>(null);

const renewOpen = ref(false);
const renewTarget = ref<any>(null);
const renewYears = ref(1);
const renewPrice = ref<any>(null);
const renewPayment = ref<string | undefined>();
const payments = ref<any[]>([]);
const renewing = ref(false);

const nsOpen = ref(false);
const nsProvider = ref<'basic' | 'custom'>('custom');
const nsHosts = ref('');
const savingNs = ref(false);

const authOpen = ref(false);
const authCode = ref('');
const authLoading = ref(false);
const assetOpen = ref(false);
const assetName = ref('');
const assetExpiry = ref('');
const assetNotes = ref('');
const assetJson = ref('');
const assetSaving = ref(false);

async function saveAsset() {
  assetSaving.value = true;
  try {
    if (assetJson.value.trim()) {
      const parsed = JSON.parse(assetJson.value);
      await requestClient.post('/domains/import', { domains: Array.isArray(parsed) ? parsed : parsed.domains });
    } else {
      await requestClient.post('/domains', { name: assetName.value, expiresAt: assetExpiry.value, notes: assetNotes.value });
    }
    assetOpen.value = false;
    assetJson.value = '';
    assetName.value = '';
    assetExpiry.value = '';
    assetNotes.value = '';
    message.success('资产已保存');
    await load();
  } catch (error: any) {
    message.error(error?.message || '资产保存失败，请检查 JSON 与日期格式');
  } finally { assetSaving.value = false; }
}

async function saveNotes() {
  await requestClient.put(`/domains/${detail.value.info.id}`, { notes: detail.value.info.notes || '' });
  message.success('备注已保存');
  await load();
}

async function load() {
  if (loading.value) return;
  loading.value = true;
  failed.value = false;
  try {
    const res = await getDomains();
    items.value = res.items || [];
    errors.value = res.errors || [];
  } catch {
    failed.value = true;
  } finally {
    loading.value = false;
  }
}

onMounted(load);

const filtered = computed(() =>
  filterDomains(items.value, {
    filter: filter.value,
    keyword: keyword.value,
    connection: registrarFilter.value,
    sort: sort.value,
  }),
);
const filterOptions = computed(() => [
  { value: 'all' as const, count: items.value.length },
  {
    value: 'expiring' as const,
    count: items.value.filter(
      (domain) => domain.daysLeft != null && domain.daysLeft <= 45,
    ).length,
  },
  {
    value: 'noauto' as const,
    count: items.value.filter((domain) => !domain.autoRenew).length,
  },
]);
const hasFilters = computed(() =>
  Boolean(keyword.value || registrarFilter.value || filter.value !== 'all'),
);
watch(filtered, () => {
  currentPage.value = 1;
});
function clearFilters() {
  setQuery({ q: undefined, filter: undefined, connection: undefined });
}

function exportCsv() {
  const headers = [
    '域名',
    '注册商',
    '接入名称',
    '注册日期',
    '到期日期',
    '剩余天数',
    '自动续费',
    '状态',
    '转移锁',
    '溢价',
  ];
  const rows = filtered.value.map((d) => [
    d.name,
    providerLabel(d.provider),
    d.connectionName,
    d.registrationDate ? dayjs(d.registrationDate).format('YYYY-MM-DD') : '',
    d.expirationDate ? dayjs(d.expirationDate).format('YYYY-MM-DD') : '',
    d.daysLeft ?? '',
    d.autoRenew ? '已开启' : '已关闭',
    d.lifecycleStatus || '',
    d.locked ? '开启' : '关闭',
    d.isPremium ? '是' : '否',
  ]);
  downloadCsv(stamped('domains'), headers, rows);
  message.success(`已导出 ${rows.length} 个域名`);
}

const registrarOptions = computed(() => {
  const map = new Map<string, string>();
  items.value.forEach((d) => map.set(d.connectionId, d.connectionName));
  return [...map.entries()].map(([value, label]) => ({ value, label }));
});

const columns = computed(() => [
  { title: $t('deck.common.domain'), key: 'name', width: 220 },
  { title: $t('deck.common.provider'), key: 'registrar', width: 150 },
  { title: $t('deck.common.status'), key: 'status', width: 100 },
  { title: $t('deck.common.expiry'), key: 'expire', width: 210 },
  { title: $t('deck.common.autorenew'), key: 'auto', width: 130 },
  { title: $t('deck.common.nameservers'), key: 'ns', width: 190 },
  {
    title: $t('deck.common.actions'),
    key: 'action',
    width: 150,
    align: 'right' as const,
    fixed: 'right' as const,
  },
]);

function daysText(days: null | number) {
  if (days === null || days === undefined) return $t('deck.days.unknown');
  if (days < 0) return $t('deck.days.expired', { count: Math.abs(days) });
  if (days === 0) return $t('deck.days.today');
  return $t('deck.days.remaining', { count: days });
}

function daysColor(days: null | number) {
  if (days === null || days === undefined) return 'default';
  if (days <= 14) return 'red';
  if (days <= 45) return 'orange';
  return 'green';
}

function lifecycleText(code: string) {
  const map: Record<string, string> = {
    registered: '正常',
    creating: '注册中',
    grace1: '宽限期一',
    grace2: '宽限期二',
    redemption: '赎回期',
  };
  return map[code]
    ? $t(`deck.lifecycle.${code}`)
    : code || $t('deck.common.unknown');
}

async function toggleAuto(record: any, checked: boolean) {
  const key = `${record.connectionId}:${record.name}`;
  if (pendingAuto.value.has(key) || !canWrite.value) return;
  const previous = record.autoRenew;
  pendingAuto.value.add(key);
  record.autoRenew = checked;
  try {
    await setAutorenew(record.name, checked, record.connectionId);
    message.success(`${record.name} 已${checked ? '开启' : '关闭'}自动续费`);
  } catch {
    record.autoRenew = previous;
  } finally {
    pendingAuto.value.delete(key);
  }
}

async function openDetail(record: any) {
  detailOpen.value = true;
  detailLoading.value = true;
  detail.value = { info: record };
  try {
    detail.value = await getDomain(record.name, record.connectionId);
  } finally {
    detailLoading.value = false;
  }
}

async function openRenew(record: any) {
  if (record?.can && record.can.renew === false) {
    message.warning(
      `${record.connectionName} 不支持手动续费，请开启自动续费或到服务商后台操作`,
    );
    return;
  }
  renewTarget.value = record;
  renewYears.value = 1;
  renewPrice.value = null;
  renewPayment.value = undefined;
  renewOpen.value = true;
  const [payRes, availRes] = await Promise.allSettled([
    hasAccessByCodes(['payment:read'])
      ? getPayments()
      : Promise.resolve({ items: [] }),
    checkAvailability(record.name, record.connectionId),
  ]);
  payments.value =
    payRes.status === 'fulfilled'
      ? ((payRes.value as any).items ?? []).filter(
          (p: any) => p.status === 'active',
        )
      : [];
  const prices = (availRes as any)?.value?.pricing?.prices?.renew;
  if (Array.isArray(prices) && prices.length) {
    const p = prices[0].priceInDefaultCurrency?.finalPrice;
    renewPrice.value = p ? { amount: p.amount, currency: p.currency } : null;
  }
}

async function confirmRenew() {
  if (!renewTarget.value) return;
  renewing.value = true;
  try {
    const res: any = await renewDomain(renewTarget.value.name, {
      years: renewYears.value,
      currentExpirationDate: renewTarget.value.expirationDate,
      paymentMethodId: renewPayment.value,
      connectionId: renewTarget.value.connectionId,
    });
    if (res.cancelled) return;
    message.success(
      `续费请求已提交${res?.operationId ? `，操作号 ${res.operationId}` : ''}`,
    );
    renewOpen.value = false;
    load();
  } finally {
    renewing.value = false;
  }
}

function openNs(info: any) {
  const list = info?.nameservers || [];
  nsProvider.value = list.every((n: string) => n.includes('spaceship'))
    ? 'basic'
    : 'custom';
  nsHosts.value = list.join('\n');
  nsOpen.value = true;
}

async function confirmNs() {
  if (!detail.value?.info?.name) return;
  savingNs.value = true;
  try {
    const hosts = nsHosts.value
      .split(/[\n,]/)
      .map((s) => s.trim())
      .filter(Boolean);
    await setNameservers(detail.value.info.name, {
      provider: nsProvider.value,
      hosts,
      connectionId: detail.value.info.connectionId,
    });
    message.success('DNS 服务器已更新，全球生效通常需要几分钟到 48 小时');
    nsOpen.value = false;
    openDetail({
      name: detail.value.info.name,
      connectionId: detail.value.info.connectionId,
    });
  } finally {
    savingNs.value = false;
  }
}

async function toggleLock(info: any, locked: boolean) {
  try {
    await setTransferLock(info.name, locked, info.connectionId);
    message.success(`转移锁已${locked ? '开启' : '关闭'}`);
    openDetail({ name: info.name, connectionId: info.connectionId });
  } catch {
    /* 错误提示由请求层统一处理 */
  }
}

async function openAuth(info: any) {
  authOpen.value = true;
  authCode.value = '';
  authLoading.value = true;
  try {
    const res: any = await getAuthCode(info.name, info.connectionId);
    authCode.value =
      res?.authCode || res?.code || res?.eppCode || JSON.stringify(res);
  } finally {
    authLoading.value = false;
  }
}

function copy(text: string) {
  navigator.clipboard.writeText(text).then(
    () => message.success('已复制'),
    () => message.warning('复制失败，请手动选择'),
  );
}
</script>

<template>
  <Page
    description="汇总所有已接入注册商的域名，按能力提供续费与授权操作"
    title="域名管理"
  >
    <template #extra>
      <Button v-if="canWrite" @click="assetOpen = true">登记 / 导入资产</Button>
      <Button :loading="loading" @click="load"
        ><template #icon><RotateCw class="size-3.5" /></template
        >{{ $t('deck.common.refresh') }}</Button
      >
      <Button type="primary" :disabled="!filtered.length" @click="exportCsv"
        ><template #icon><Download class="size-3.5" /></template
        >{{ $t('deck.common.export') }}</Button
      >
    </template>

    <div v-if="failed" class="domain-error" role="alert">
      {{ $t('deck.common.loadFailed')
      }}<Button size="small" :loading="loading" @click="load">{{
        $t('deck.common.retry')
      }}</Button>
    </div>
    <div class="domain-filter-tabs" :aria-label="$t('deck.nav.domains')">
      <button
        v-for="option in filterOptions"
        :key="option.value"
        :class="{ active: filter === option.value }"
        :aria-pressed="filter === option.value"
        @click="filter = option.value"
      >
        {{ $t(`deck.domainFilter.${option.value}`)
        }}<span>{{ option.count }}</span>
      </button>
    </div>
    <Card :bordered="true" class="domain-list-card">
      <div class="domain-toolbar">
        <Input
          v-model:value="keyword"
          allow-clear
          :placeholder="$t('deck.common.search')"
          :aria-label="$t('deck.common.search')"
          class="domain-search"
          ><template #prefix><Search class="mr-1 size-4 deck-muted" /></template
        ></Input>
        <Select
          v-model:value="registrarFilter"
          allow-clear
          :placeholder="$t('deck.common.allProviders')"
          :aria-label="$t('deck.common.allProviders')"
          class="domain-select"
          :options="registrarOptions"
        />
        <Select
          v-model:value="sort"
          class="domain-select"
          :aria-label="$t('deck.common.sortExpiry')"
          :options="[
            { value: 'expiry', label: $t('deck.common.sortExpiry') },
            { value: 'name', label: $t('deck.common.sortName') },
          ]"
        />
        <Button v-if="hasFilters" type="link" @click="clearFilters">{{
          $t('deck.common.clearFilters')
        }}</Button>
      </div>
      <div class="domain-results" aria-live="polite">
        <span>{{
          $t('deck.common.results', {
            count: filtered.length,
            total: items.length,
          })
        }}</span>
        <Tag v-if="!canBill" class="mr-0">{{ $t('deck.common.readOnly') }}</Tag>
      </div>

      <div v-if="errors.length" class="mb-3">
        <div
          v-for="(err, i) in errors"
          :key="i"
          class="mb-1 rounded border border-amber-100 bg-amber-50 px-3 py-2 text-xs text-amber-800"
        >
          {{ err.connectionName || err.name }}（{{
            err.provider || '接入'
          }}）读取失败：{{ err.message }}
        </div>
      </div>

      <Table
        :columns="columns"
        :data-source="filtered"
        :loading="loading"
        :pagination="{
          current: currentPage,
          onChange: (page: number) => (currentPage = page),
          pageSize: 10,
          showSizeChanger: false,
        }"
        :row-key="(record: any) => `${record.connectionId}:${record.name}`"
        :scroll="{ x: 1150 }"
        size="middle"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'name'">
            <button class="domain-name-button" @click="openDetail(record)">
              {{ record.unicodeName || record.name }}
            </button>
            <div class="text-xs text-slate-400">
              {{
                $t('deck.common.registeredAt', {
                  date: record.registrationDate?.slice(0, 10) || '—',
                })
              }}
              <span v-if="record.isPremium" class="ml-1 text-amber-600">{{
                $t('deck.common.premium')
              }}</span>
            </div>
          </template>

          <template v-else-if="column.key === 'registrar'">
            <div class="text-xs text-slate-600">
              {{ record.connectionName }}
            </div>
            <div class="text-xs text-slate-400">
              {{ providerLabel(record.provider) }}
            </div>
          </template>

          <template v-else-if="column.key === 'status'">
            <Tag
              :color="
                record.lifecycleStatus === 'registered' ? 'green' : 'orange'
              "
              class="mr-0"
            >
              {{ lifecycleText(record.lifecycleStatus) }}
            </Tag>
          </template>

          <template v-else-if="column.key === 'expire'">
            <div class="flex items-center gap-2">
              <span class="font-mono text-[13px]">{{
                record.expirationDate?.slice(0, 10)
              }}</span>
              <Tag :color="daysColor(record.daysLeft)" class="mr-0">{{
                daysText(record.daysLeft)
              }}</Tag>
            </div>
          </template>

          <template v-else-if="column.key === 'auto'">
            <div class="flex items-center gap-2">
              <Switch
                :checked="record.autoRenew"
                :disabled="!canWrite || record.can?.autorenew === false"
                :loading="
                  pendingAuto.has(`${record.connectionId}:${record.name}`)
                "
                :aria-label="`${record.name} ${$t('deck.common.autorenew')}`"
                size="small"
                @change="(v: any) => toggleAuto(record, Boolean(v))"
              />
              <span
                class="text-xs"
                :class="record.autoRenew ? 'text-slate-600' : 'text-slate-400'"
              >
                {{
                  record.autoRenew
                    ? $t('deck.common.enabled')
                    : $t('deck.common.disabled')
                }}
              </span>
            </div>
          </template>

          <template v-else-if="column.key === 'ns'">
            <div
              class="truncate text-xs text-slate-500"
              style="max-width: 200px"
            >
              {{ record.nameservers?.[0] || '—' }}
            </div>
            <div class="text-xs text-slate-400">
              {{ record.nameservers?.[1] || '' }}
            </div>
          </template>

          <template v-else-if="column.key === 'action'">
            <Space :size="4">
              <Button
                v-if="canBill && record.can?.renew !== false"
                size="small"
                type="primary"
                ghost
                @click="openRenew(record)"
              >
                {{ $t('deck.common.renew') }}
              </Button>
              <Button size="small" @click="openDetail(record)">{{
                $t('deck.common.details')
              }}</Button>
            </Space>
          </template>
        </template>
        <template #emptyText>
          <Empty
            :image="Empty.PRESENTED_IMAGE_SIMPLE"
            :description="
              $t(
                hasFilters
                  ? 'deck.common.noResults'
                  : 'deck.overview.emptyTitle',
              )
            "
          >
            <p class="deck-muted mb-3 text-xs">
              {{
                $t(
                  hasFilters
                    ? 'deck.common.noResultsHint'
                    : 'deck.overview.emptyHint',
                )
              }}
            </p>
            <Button v-if="hasFilters" @click="clearFilters"
              ><SearchX class="mr-1 size-3.5" />{{
                $t('deck.common.clearFilters')
              }}</Button
            >
          </Empty>
        </template>
      </Table>
    </Card>

    <!-- 详情抽屉 -->
    <Drawer
      v-model:open="detailOpen"
      :title="detail?.info?.name || '域名详情'"
      width="560"
    >
      <div v-if="detail?.info">
        <div class="mb-4 flex flex-wrap gap-2">
          <Tag :color="daysColor(detail.info.daysLeft)"
            >{{ daysText(detail.info.daysLeft) }}到期</Tag
          >
          <Tag :color="detail.info.autoRenew ? 'green' : 'orange'">
            {{ detail.info.autoRenew ? '自动续费开启' : '自动续费关闭' }}
          </Tag>
          <Tag v-if="detail.info.locked" color="blue">转移锁开启</Tag>
          <Tag v-if="detail.zone" color="cyan"
            >Cloudflare {{ detail.zone.status }}</Tag
          >
        </div>
        <div v-if="canWrite" class="mb-4 space-y-2">
          <Textarea v-model:value="detail.info.notes" placeholder="资产备注" :maxlength="2000" />
          <Button @click="saveNotes">保存备注</Button>
        </div>

        <Descriptions :column="1" bordered size="small">
          <DescriptionsItem label="域名（ASCII）">
            <span class="font-mono text-xs">{{ detail.info.name }}</span>
          </DescriptionsItem>
          <DescriptionsItem label="注册时间">{{
            detail.info.registrationDate?.slice(0, 10)
          }}</DescriptionsItem>
          <DescriptionsItem label="到期时间">
            {{ detail.info.expirationDate?.slice(0, 10) }}
          </DescriptionsItem>
          <DescriptionsItem label="WHOIS 隐私">
            {{
              detail.info.privacyProtection?.level === 'public'
                ? '公开'
                : '已隐藏'
            }}
          </DescriptionsItem>
          <DescriptionsItem label="EPP 状态">
            <Tag
              v-for="s in detail.info.eppStatuses"
              :key="s"
              class="mb-1 mr-1"
              >{{ s }}</Tag
            >
          </DescriptionsItem>
          <DescriptionsItem label="注册商 NS">
            <div class="font-mono text-xs">
              {{ (detail.info.nameservers || []).join(', ') || '—' }}
            </div>
          </DescriptionsItem>
          <DescriptionsItem label="实际解析 NS">
            <div
              class="font-mono text-xs"
              :class="
                detail.ns?.nameservers?.length
                  ? 'text-emerald-600'
                  : 'text-slate-400'
              "
            >
              {{
                (detail.ns?.nameservers || []).join(', ') ||
                '查询失败或尚未生效'
              }}
            </div>
          </DescriptionsItem>
          <DescriptionsItem label="联系人 ID">
            <div class="font-mono text-xs">
              {{ detail.info.contacts?.registrant || '—' }}
            </div>
          </DescriptionsItem>
        </Descriptions>

        <div class="mt-5 space-y-2">
          <div class="text-xs font-medium text-slate-400">操作</div>
          <Space wrap>
            <Button
              v-if="canBill && detail.info.can?.renew !== false"
              type="primary"
              @click="openRenew(detail.info)"
              >续费</Button
            >
            <Button
              v-if="canWrite && detail.info.can?.nameservers !== false"
              @click="openNs(detail.info)"
              >修改 DNS 服务器</Button
            >
            <Button
              v-if="canTransfer && detail.info.can?.authCode !== false"
              @click="openAuth(detail.info)"
              >获取授权码</Button
            >
            <Button
              v-if="canWrite && detail.info.can?.transferLock !== false"
              :danger="!detail.info.locked"
              @click="toggleLock(detail.info, !detail.info.locked)"
            >
              {{ detail.info.locked ? '关闭转移锁' : '开启转移锁' }}
            </Button>
            <Button v-if="detail.zone" @click="$router.push('/dns')"
              >管理解析</Button
            >
          </Space>
        </div>
      </div>
      <div v-else class="py-10 text-center text-sm text-slate-400">加载中…</div>
    </Drawer>

    <!-- 续费 -->
    <Modal v-model:open="assetOpen" title="登记 / 导入资产" ok-text="保存资产" :confirm-loading="assetSaving" @ok="saveAsset">
      <div class="space-y-3">
        <Input v-model:value="assetName" placeholder="域名，例如 example.com" />
        <Input v-model:value="assetExpiry" placeholder="到期日期（可选），例如 2030-01-01" />
        <Textarea v-model:value="assetNotes" placeholder="资产备注（可选）" :maxlength="2000" />
        <p>批量导入时，在下面粘贴 JSON 数组；已有域名不会覆盖。</p>
        <Textarea v-model:value="assetJson" placeholder='[{"name":"example.com","expiresAt":"2030-01-01","notes":""}]' :rows="5" />
      </div>
    </Modal>

    <Modal
      v-model:open="renewOpen"
      :confirm-loading="renewing"
      :title="`续费 ${renewTarget?.name || ''}`"
      ok-text="确认续费"
      @ok="confirmRenew"
    >
      <div class="space-y-4 pt-2">
        <div
          class="rounded border border-red-100 bg-red-50 px-3 py-2 text-xs leading-relaxed text-red-700"
        >
          续费会使用 Spaceship 账户的支付方式立即扣款，属于真实扣费操作。
        </div>
        <div class="flex items-center gap-3">
          <span class="w-20 text-sm text-slate-500">续费年限</span>
          <InputNumber
            v-model:value="renewYears"
            :min="1"
            :max="10"
            style="width: 120px"
          />
          <span v-if="renewPrice" class="text-sm text-slate-600">
            约 {{ renewPrice.currency }}
            {{ (Number(renewPrice.amount) * renewYears).toFixed(2) }}
          </span>
        </div>
        <div class="flex items-center gap-3">
          <span class="w-20 text-sm text-slate-500">支付方式</span>
          <Select
            v-model:value="renewPayment"
            allow-clear
            placeholder="默认支付方式"
            style="flex: 1"
            :options="
              payments.map((p) => ({
                label: `${p.name}${p.isDefault ? '（默认）' : ''}`,
                value: p.id,
              }))
            "
          />
        </div>
        <div class="text-xs text-slate-400">
          当前到期时间：{{
            renewTarget?.expirationDate?.slice(0, 10)
          }}。此处的支付方式仅用于本地记账，实际扣款以 Spaceship 账户设置为准。
        </div>
      </div>
    </Modal>

    <!-- NS -->
    <Modal
      v-model:open="nsOpen"
      :confirm-loading="savingNs"
      title="修改 DNS 服务器"
      @ok="confirmNs"
    >
      <div class="space-y-4 pt-2">
        <div
          class="rounded border border-amber-100 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-800"
        >
          修改 NS 会改变解析归属。切换到 Cloudflare 前请确认填入的服务器地址是
          Cloudflare 分配的。
        </div>
        <div>
          <div class="mb-1 text-sm text-slate-600">解析方式</div>
          <Select
            v-model:value="nsProvider"
            style="width: 100%"
            :options="[
              { label: '自定义 DNS（推荐：Cloudflare）', value: 'custom' },
              { label: '使用 Spaceship 基础解析', value: 'basic' },
            ]"
          />
        </div>
        <div v-if="nsProvider === 'custom'">
          <div class="mb-1 text-sm text-slate-600">
            DNS 服务器地址（每行一个）
          </div>
          <Textarea
            v-model:value="nsHosts"
            :rows="4"
            placeholder="ada.ns.cloudflare.com"
          />
        </div>
      </div>
    </Modal>

    <!-- 授权码 -->
    <Modal
      v-model:open="authOpen"
      :footer="null"
      title="转移授权码（EPP Code）"
    >
      <div class="space-y-3 pt-2">
        <div
          class="rounded border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600"
        >
          授权码等同域名所有权凭证，请勿泄露。转出通常还需要关闭转移锁。
        </div>
        <div
          class="flex items-center gap-2 rounded border border-dashed border-slate-300 bg-slate-50 px-3 py-2"
        >
          <span class="flex-1 break-all font-mono text-sm">{{
            authLoading ? '获取中…' : authCode
          }}</span>
          <Button size="small" :disabled="!authCode" @click="copy(authCode)"
            >复制</Button
          >
        </div>
      </div>
    </Modal>
  </Page>
</template>

<style scoped>
.domain-filter-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 18px;
}
.domain-filter-tabs button {
  display: flex;
  gap: 10px;
  align-items: center;
  padding: 10px 16px;
  font-size: var(--dd-font-body);
  font-weight: 600;
  color: var(--dd-text-secondary);
  background: var(--dd-surface);
  border: 1px solid var(--dd-border);
  border-radius: 10px;
  cursor: pointer;
}
.domain-filter-tabs button.active {
  color: var(--dd-brand);
  background: var(--dd-brand-soft);
  border-color: var(--dd-brand);
}
.domain-filter-tabs button span {
  min-width: 20px;
  padding: 1px 5px;
  font-size: var(--dd-font-small);
  text-align: center;
  background: var(--dd-surface-raised);
  border-radius: 5px;
}
.domain-filter-tabs button.active span {
  color: #fff;
  background: #2563eb;
}
.domain-toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
}
.domain-search {
  width: 280px;
  max-width: 100%;
}
.domain-select {
  width: 210px;
}
.domain-results {
  display: flex;
  gap: 10px;
  align-items: center;
  justify-content: space-between;
  margin-block: 18px;
  font-size: var(--dd-font-small);
  color: var(--dd-text-muted);
}
.domain-name-button {
  padding: 0;
  margin-bottom: 5px;
  font-family: var(--dd-font-mono);
  font-size: var(--dd-font-body);
  font-weight: 700;
  text-align: left;
  color: var(--dd-brand);
  background: none;
  border: 0;
  cursor: pointer;
}
.domain-error {
  display: flex;
  gap: 12px;
  align-items: center;
  justify-content: space-between;
  padding: 14px 18px;
  margin-bottom: 16px;
  color: var(--dd-danger);
  background: var(--dd-danger-soft);
  border: 1px solid var(--dd-border);
  border-radius: 12px;
}
@media (width <= 640px) {
  .domain-search {
    width: 100%;
  }
  .domain-select {
    flex: 1;
    min-width: 130px;
  }
  .domain-filter-tabs {
    gap: 6px;
  }
  .domain-filter-tabs button {
    gap: 6px;
    padding: 8px 10px;
    font-size: var(--dd-font-small);
  }
}
</style>
