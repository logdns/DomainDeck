<script lang="ts" setup>
import { computed, onMounted, reactive, ref } from 'vue';

import { useAccess } from '@vben/access';
import Page from '#/components/deck-page.vue';
import { useRouter } from 'vue-router';

import {
  Alert,
  Button,
  Card,
  Empty,
  Input,
  message,
  Modal,
  Popconfirm,
  Select,
  Space,
  Switch,
  Table,
  Tag,
  Tooltip,
} from 'ant-design-vue';
import dayjs from 'dayjs';

import { downloadCsv, stamped } from '#/utils/csv';

import {
  createPayment,
  deletePayment,
  getInvoices,
  getBalances,
  getOrders,
  getPaymentCapabilities,
  getPaymentTypes,
  getPayments,
  probePaymentEndpoints,
  setDefaultPayment,
  syncOrder,
  syncOrders,
  syncPayments,
  updateOrder,
  updatePayment,
  verifyPayment,
} from '#/api/domaindeck';

const router = useRouter();
const { hasAccessByCodes } = useAccess();
const canWrite = computed(() => hasAccessByCodes(['payment:write']));

const tab = ref<'methods' | 'orders' | 'invoices'>('methods');
const loading = ref(false);
const syncing = ref(false);
const payments = ref<any[]>([]);
const notes = ref<any[]>([]);
const types = ref<any[]>([]);
const orders = ref<any[]>([]);
const invoices = ref<any[]>([]);
const orderLoading = ref(false);
const syncedAt = ref('');
const balances = ref<any[]>([]);
const caps = ref<any>({ providers: [], connections: [], report: null });
const probing = ref(false);
const orderSyncing = ref(false);
const orderDetail = ref<any>(null);
const detailOpen = ref(false);

const OFFICIAL_STATUS: Record<string, { color: string; text: string }> = {
  pending: { color: 'blue', text: '官方处理中' },
  success: { color: 'green', text: '官方已完成' },
  failed: { color: 'red', text: '官方失败' },
};
const probeReport = computed(() => caps.value.report || null);
const probeTargets = computed(() =>
  (caps.value.connections || []).filter((c: any) => {
    const p = (caps.value.providers || []).find(
      (x: any) => x.id === c.provider,
    );
    return p?.paymentProbe && c.enabled !== false;
  }),
);
const defaultName = ref<null | string>(null);

const modalOpen = ref(false);
const saving = ref(false);
const editingId = ref<null | string>(null);
const form = reactive<any>({
  name: '',
  type: 'alipay',
  account: '',
  holder: '',
  expiry: '',
  note: '',
  status: 'active',
});

const TYPE_LABEL: Record<string, string> = {
  alipay: '支付宝',
  wechat: '微信支付',
  card: '银行卡',
  paypal: 'PayPal',
  bank: '银行转账',
  other: '其他',
};

const ORDER_STATUS: Record<string, { color: string; text: string }> = {
  'needs-review': { color: 'orange', text: '结果不明，待核对' },
  submitted: { color: 'blue', text: '已提交' },
  succeeded: { color: 'green', text: '已完成' },
  failed: { color: 'red', text: '失败' },
  cancelled: { color: 'default', text: '已取消' },
};

const KIND_LABEL: Record<string, string> = {
  register: '注册',
  renew: '续费',
  transfer: '转入',
};

const synced = computed(() =>
  payments.value.filter((p) => p.source !== 'manual'),
);
const manual = computed(() =>
  payments.value.filter((p) => p.source === 'manual'),
);

async function load() {
  loading.value = true;
  try {
    const [payRes, typeRes, capRes, balRes] = await Promise.allSettled([
      getPayments(),
      getPaymentTypes(),
      getPaymentCapabilities(),
      getBalances(),
    ]);
    if (capRes.status === 'fulfilled') caps.value = capRes.value as any;
    if (balRes.status === 'fulfilled')
      balances.value = (balRes.value as any).items || [];
    if (payRes.status === 'fulfilled') {
      const data: any = payRes.value;
      payments.value = data.items || [];
      notes.value = data.notes || [];
      syncedAt.value = data.syncedAt || '';
      defaultName.value = data.defaultName || null;
    }
    if (typeRes.status === 'fulfilled')
      types.value = (typeRes.value as any) || [];
  } finally {
    loading.value = false;
  }
}

async function loadOrders() {
  orderLoading.value = true;
  try {
    const [orderRes, invoiceRes] = await Promise.allSettled([
      getOrders(),
      getInvoices(50),
    ]);
    if (orderRes.status === 'fulfilled')
      orders.value = (orderRes.value as any).items || [];
    if (invoiceRes.status === 'fulfilled')
      invoices.value = (invoiceRes.value as any).items || [];
  } finally {
    orderLoading.value = false;
  }
}

onMounted(async () => {
  await load();
  await loadOrders();
});

async function pullOfficialOrders() {
  orderSyncing.value = true;
  try {
    const res: any = await syncOrders();
    if (res.checked === 0) {
      message.info('没有待同步的订单：只有已提交且带官方操作号的订单需要同步');
    } else {
      const done = (res.updated || []).filter(
        (o: any) => o.status !== 'submitted',
      ).length;
      message.success(`已核对 ${res.checked} 笔，${done} 笔有了最终结果`);
    }
    (res.notes || []).forEach((n: any) =>
      message.warning(`${n.domain}：${n.message}`),
    );
    await loadOrders();
  } finally {
    orderSyncing.value = false;
  }
}

async function pullOneOrder(record: any) {
  try {
    await syncOrder(record.id);
    await loadOrders();
    message.success('已拉取官方状态');
  } catch (err: any) {
    message.error(err?.message || '同步失败');
  }
}

function exportOrders() {
  const headers = [
    '时间',
    '域名',
    '类型',
    '年限',
    '金额',
    '币种',
    '支付方式',
    '注册商',
    '本地状态',
    '官方状态',
    '官方单号',
    '操作号',
    '操作人',
  ];
  const rows = orders.value.map((o) => [
    dayjs(o.createdAt).format('YYYY-MM-DD HH:mm'),
    o.domain,
    KIND_LABEL[o.kind] || o.kind,
    o.years,
    o.amount ?? '',
    o.currency || '',
    o.paymentName || '',
    o.registrar || '',
    ORDER_STATUS[o.status]?.text || o.status,
    o.official
      ? OFFICIAL_STATUS[o.official.status]?.text || o.official.status
      : '未核对',
    o.official?.extracted?.orderId || '',
    o.operationId || '',
    o.operator || '',
  ]);
  downloadCsv(stamped('orders'), headers, rows);
  message.success(`已导出 ${rows.length} 笔订单`);
}

function openOrderDetail(record: any) {
  orderDetail.value = record;
  detailOpen.value = true;
}

async function probePayments() {
  probing.value = true;
  try {
    const res: any = await probePaymentEndpoints();
    caps.value = { ...caps.value, report: res };
    if (res.note) message.info(res.note);
    else if (res.results?.some((r: any) => r.supported))
      message.success('探测到可用的账单端点');
    else message.warning('未发现账单端点，支付方式仍需手工登记');
  } finally {
    probing.value = false;
  }
}

const VERDICT: Record<string, { color: string; text: string }> = {
  found: { color: 'green', text: '可读取' },
  forbidden: { color: 'orange', text: '无权限' },
  limited: { color: 'gold', text: '限流' },
  other: { color: 'default', text: '异常' },
};

async function sync() {
  syncing.value = true;
  try {
    const res: any = await syncPayments();
    const count = (res.items || []).length;
    message.success(
      count
        ? `已从服务商同步 ${count} 条支付方式`
        : '已同步，服务商没有返回支付方式',
    );
    await load();
  } finally {
    syncing.value = false;
  }
}

function masked(p: any) {
  const acc = p.account || '';
  if (!acc) return '未提供卡号信息';
  if (p.type === 'card') return `•••• •••• •••• ${acc.slice(-4)}`;
  if (p.type === 'bank') return `账户尾号 ${acc.slice(-4)}`;
  if (acc.includes('@')) {
    const [name, domain] = acc.split('@');
    return `${name.slice(0, 2)}***@${domain}`;
  }
  return acc.length > 8 ? `${acc.slice(0, 3)}***${acc.slice(-3)}` : acc;
}

function openCreate() {
  editingId.value = null;
  Object.assign(form, {
    name: '',
    type: 'alipay',
    account: '',
    holder: '',
    expiry: '',
    note: '',
    status: 'active',
  });
  modalOpen.value = true;
}

function openEdit(p: any) {
  editingId.value = p.id;
  Object.assign(form, {
    name: p.name,
    type: p.type,
    account: p.account,
    holder: p.holder,
    expiry: p.expiry,
    note: p.note,
    status: p.status,
  });
  modalOpen.value = true;
}

async function save() {
  if (!form.name) {
    message.warning('请填写支付方式名称');
    return;
  }
  saving.value = true;
  try {
    if (editingId.value) {
      await updatePayment(editingId.value, { ...form });
      message.success('支付方式已更新');
    } else {
      await createPayment({ ...form });
      message.success('支付方式已添加');
    }
    modalOpen.value = false;
    await load();
  } finally {
    saving.value = false;
  }
}

async function makeDefault(p: any) {
  await setDefaultPayment(p.id);
  message.success(`已将「${p.name}」设为默认记账方式`);
  load();
}

async function verify(p: any) {
  if (!p.editable) {
    message.info('该记录来自服务商账单，只读');
    return;
  }
  const res: any = await verifyPayment(p.id);
  if (res.ok) message.success(`${res.name}：${res.message}`);
  else message.warning(`${res.name}：${res.issues?.join('；') || res.message}`);
}

async function remove(p: any) {
  await deletePayment(p.id);
  message.success('已删除');
  load();
}

async function markOrder(order: any, status: string) {
  await updateOrder(order.id, status);
  message.success('订单状态已更新');
  loadOrders();
}

const orderColumns = [
  { title: '时间', key: 'createdAt', width: 138 },
  { title: '域名', key: 'domain', width: 168 },
  { title: '类型', key: 'kind', width: 96 },
  { title: '金额', key: 'amount', width: 104 },
  { title: '来源', key: 'source', width: 172 },
  { title: '状态', key: 'status', width: 86 },
  { title: '官方', key: 'official', width: 116 },
  { title: '', key: 'action', width: 96, align: 'right' as const },
];

const invoiceColumns = [
  { title: '时间', key: 'occurredAt', width: 150 },
  { title: '账单号', key: 'invoiceId', width: 170 },
  { title: '说明', key: 'description' },
  { title: '金额', key: 'amount', width: 130 },
  { title: '状态', key: 'status', width: 110 },
  { title: '来源', key: 'source', width: 140 },
  { title: '', key: 'action', width: 90, align: 'right' as const },
];
</script>

<template>
  <Page
    description="支付方式自动从服务商读取，也可手工登记用于记账"
    title="支付与账单"
  >
    <template #extra>
      <Button :loading="syncing" @click="sync">从服务商同步</Button>
      <Button v-if="canWrite" type="primary" @click="openCreate"
        >手工登记支付方式</Button
      >
    </template>

    <div
      class="mb-3 inline-flex rounded border border-slate-200 bg-white p-0.5"
    >
      <button
        class="seg-btn"
        :class="{ active: tab === 'methods' }"
        @click="tab = 'methods'"
      >
        支付方式
        <span class="seg-count">{{ payments.length }}</span>
      </button>
      <button
        class="seg-btn"
        :class="{ active: tab === 'orders' }"
        @click="tab = 'orders'"
      >
        本地订单
        <span class="seg-count">{{ orders.length }}</span>
      </button>
      <button
        class="seg-btn"
        :class="{ active: tab === 'invoices' }"
        @click="tab = 'invoices'"
      >
        云端账单
        <span class="seg-count">{{ invoices.length }}</span>
      </button>
    </div>

    <div v-if="tab === 'methods'" class="space-y-4">
      <Alert
        v-for="(note, i) in notes"
        :key="i"
        :message="`${note.providerName || note.connectionName}：${note.message}`"
        show-icon
        type="info"
      />

      <div v-if="balances.length" class="cap-card mb-3">
        <div class="cap-head">
          <div>
            <div class="text-sm font-medium text-slate-800">
              各注册商账单来源
            </div>
            <div class="text-xs text-slate-400">
              余额能读到就显示；读不到的会说明是接口缺失还是权限不足
            </div>
          </div>
        </div>
        <div class="overflow-x-auto">
          <table class="bill-table">
            <thead>
              <tr>
                <th>接入</th>
                <th>账户余额</th>
                <th>支付方式</th>
                <th>发票</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="b in balances" :key="b.connectionId">
                <td>
                  <div class="text-[13px] text-slate-800">
                    {{ b.connectionName }}
                  </div>
                  <div class="text-xs text-slate-400">{{ b.providerName }}</div>
                </td>
                <td class="font-mono">
                  <template v-if="b.balance">
                    {{
                      b.balance.display ||
                      (b.balance.amount != null
                        ? `${b.balance.currency || ''} ${Number(b.balance.amount).toFixed(2)}`
                        : '—')
                    }}
                  </template>
                  <span v-else class="font-sans text-xs text-slate-400">{{
                    b.balanceError || '该注册商没有余额接口'
                  }}</span>
                </td>
                <td>
                  <Tag :color="b.payments ? 'green' : 'default'" class="mr-0">{{
                    b.payments ? '可自动读取' : '无接口'
                  }}</Tag>
                </td>
                <td>
                  <Tag :color="b.invoices ? 'green' : 'default'" class="mr-0">{{
                    b.invoices ? '可读取' : '无接口'
                  }}</Tag>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div class="cap-card">
        <div class="cap-head">
          <div>
            <div class="text-sm font-medium text-slate-800">支付方式从哪来</div>
            <div class="text-xs text-slate-400">
              服务商提供账单接口就自动读取，没有的只能手工登记
            </div>
          </div>
          <div class="flex items-center gap-3">
            <span v-if="probeReport?.at" class="text-xs text-slate-400">
              上次探测 {{ dayjs(probeReport.at).format('MM-DD HH:mm') }}
            </span>
            <Tooltip
              :title="
                probeTargets.length
                  ? '用当前接入的凭据逐个试探账单端点，约 5 秒'
                  : '先到「注册商与接入」添加 Spaceship 凭据'
              "
            >
              <Button
                size="small"
                :loading="probing"
                :disabled="!probeTargets.length"
                @click="probePayments"
              >
                探测支付接口
              </Button>
            </Tooltip>
          </div>
        </div>

        <div v-for="p in caps.providers" :key="p.id" class="cap-row">
          <div class="cap-name">
            <div class="text-sm text-slate-800">{{ p.name }}</div>
            <div class="text-xs text-slate-400">{{ p.vendor }}</div>
          </div>
          <div class="cap-body">
            <div class="flex flex-wrap items-center gap-2">
              <Tag :color="p.payments ? 'green' : 'default'" class="mr-0">
                {{ p.payments ? '可自动读取' : '未开放账单接口' }}
              </Tag>
              <span
                v-if="p.notes && p.notes.rails"
                class="text-xs text-slate-400"
              >
                支持渠道：{{
                  p.notes.rails
                    .map((rail: { label: string }) => rail.label)
                    .join(' / ')
                }}
              </span>
            </div>
            <ul v-if="p.notes && p.notes.evidence" class="cap-evidence">
              <li v-for="(e, i) in p.notes.evidence" :key="i">{{ e }}</li>
            </ul>
          </div>
          <a class="cap-link" :href="p.docs" target="_blank" rel="noreferrer"
            >文档 ↗</a
          >
        </div>

        <div v-if="probeReport" class="cap-result">
          <div v-if="probeReport.note" class="text-xs text-slate-500">
            {{ probeReport.note }}
          </div>
          <div
            v-for="r in probeReport.results"
            :key="r.connectionId"
            class="cap-result-item"
          >
            <div class="flex flex-wrap items-center gap-2 text-xs">
              <span class="font-medium text-slate-700">{{
                r.connectionName
              }}</span>
              <Tag :color="r.supported ? 'green' : 'default'" class="mr-0">
                {{ r.supported ? '有可用端点' : '无可用端点' }}
              </Tag>
              <span class="text-slate-500">{{ r.summary }}</span>
            </div>
            <div v-if="r.hits && r.hits.length" class="mt-1 space-y-1">
              <div
                v-for="h in r.hits"
                :key="h.path"
                class="flex items-center gap-2 text-xs"
              >
                <Tag
                  :color="VERDICT[h.verdict]?.color || 'default'"
                  class="mr-0"
                >
                  {{ VERDICT[h.verdict]?.text || h.verdict }}
                </Tag>
                <code class="cap-path">{{ h.path }}</code>
                <span class="text-slate-400">{{ h.detail }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        <div v-for="p in synced" :key="p.id" class="pay-card synced">
          <div class="flex items-start justify-between">
            <div class="flex items-center gap-2">
              <span class="pay-logo" :class="p.type">
                <svg v-if="p.type === 'card'" viewBox="0 0 24 24">
                  <rect x="3" y="5.5" width="18" height="13" rx="2" />
                  <path d="M3 10h18M6.5 14.5h3" />
                </svg>
                <svg v-else viewBox="0 0 24 24">
                  <circle cx="12" cy="12" r="8" />
                  <path d="M12 8v8M9.5 10.5h5M9.5 13.5h5" />
                </svg>
              </span>
              <div class="min-w-0">
                <div class="truncate text-sm font-medium text-slate-800">
                  {{ p.name }}
                </div>
                <div class="text-xs text-slate-400">
                  {{ p.connectionName }} · 自动同步
                </div>
              </div>
            </div>
            <Tag class="mr-0" color="cyan">只读</Tag>
          </div>

          <div class="mt-3 font-mono text-[13px] tracking-wide text-slate-700">
            {{ masked(p) }}
          </div>
          <div
            class="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-400"
          >
            <span v-if="p.holder">{{ p.holder }}</span>
            <span v-if="p.expiry">有效期 {{ p.expiry }}</span>
            <span v-if="p.meta?.gateway">通道 {{ p.meta.gateway }}</span>
          </div>
          <div class="mt-1 text-xs text-slate-400">
            <template v-if="p.meta?.nextBillDate"
              >下次扣款 {{ String(p.meta.nextBillDate).slice(0, 10) }}</template
            >
            <template v-if="p.meta?.balance">
              · 余额 {{ p.meta.balance }}</template
            >
          </div>

          <div
            class="mt-3 flex items-center gap-1 border-t border-slate-100 pt-2"
          >
            <Button size="small" type="link" @click="router.push('/providers')"
              >查看接入</Button
            >
            <div class="flex-1"></div>
            <a
              class="text-xs text-blue-600"
              href="https://dash.cloudflare.com/?to=/:account/billing"
              target="_blank"
              rel="noreferrer"
            >
              在 Cloudflare 修改 ↗
            </a>
          </div>
        </div>

        <div v-for="p in manual" :key="p.id" class="pay-card">
          <div class="flex items-start justify-between">
            <div class="flex items-center gap-2">
              <span class="pay-logo" :class="p.type">
                <svg v-if="p.type === 'alipay'" viewBox="0 0 24 24">
                  <path
                    d="M6 9.5h5.5M8.7 7v5.5M5 15.5c2.4 1.6 5.2 2.2 8.4 1.6 2.3-.4 4.1-1.6 5.6-3.1"
                  />
                </svg>
                <svg v-else-if="p.type === 'wechat'" viewBox="0 0 24 24">
                  <ellipse cx="9.5" cy="9.5" rx="5.5" ry="4.5" />
                  <path d="M7 13.5 5.5 16l3-1.2" />
                  <ellipse cx="15.5" cy="14.5" rx="4.5" ry="3.8" />
                </svg>
                <svg v-else-if="p.type === 'card'" viewBox="0 0 24 24">
                  <rect x="3" y="5.5" width="18" height="13" rx="2" />
                  <path d="M3 10h18M6.5 14.5h3" />
                </svg>
                <svg v-else-if="p.type === 'paypal'" viewBox="0 0 24 24">
                  <path
                    d="M7 19 9.5 5h5.2c2.3 0 3.8 1.3 3.5 3.6-.3 2.6-2.2 4-4.9 4h-2.6"
                  />
                  <path d="M11.5 19 13 12.6" />
                </svg>
                <svg v-else-if="p.type === 'bank'" viewBox="0 0 24 24">
                  <path
                    d="M4 9.5 12 5l8 4.5M5.5 10v8M9.5 10v8M14.5 10v8M18.5 10v8M4 19.5h16"
                  />
                </svg>
                <svg v-else viewBox="0 0 24 24">
                  <circle cx="12" cy="12" r="8" />
                  <path d="M12 8v8M9.5 10.5h5M9.5 13.5h5" />
                </svg>
              </span>
              <div class="min-w-0">
                <div class="truncate text-sm font-medium text-slate-800">
                  {{ p.name }}
                </div>
                <div class="text-xs text-slate-400">
                  {{ TYPE_LABEL[p.type] || p.type }} · 手工登记
                </div>
              </div>
            </div>
            <Tag v-if="p.isDefault" color="blue" class="mr-0">默认</Tag>
          </div>

          <div class="mt-3 font-mono text-[13px] tracking-wide text-slate-700">
            {{ masked(p) }}
          </div>
          <div class="mt-1 flex items-center gap-3 text-xs text-slate-400">
            <span v-if="p.holder">{{ p.holder }}</span>
            <span v-if="p.expiry">有效期 {{ p.expiry }}</span>
            <Tag
              v-if="p.status === 'disabled'"
              color="default"
              class="ml-1 mr-0"
              >已停用</Tag
            >
          </div>
          <div v-if="p.note" class="mt-1 truncate text-xs text-slate-400">
            {{ p.note }}
          </div>

          <div
            class="mt-3 flex items-center gap-1 border-t border-slate-100 pt-2"
          >
            <Button
              v-if="canWrite && !p.isDefault"
              size="small"
              type="link"
              :disabled="p.status !== 'active'"
              @click="makeDefault(p)"
              >设为默认</Button
            >
            <Button size="small" type="link" @click="verify(p)">校验</Button>
            <Button
              v-if="canWrite"
              size="small"
              type="link"
              @click="openEdit(p)"
              >编辑</Button
            >
            <div class="flex-1"></div>
            <Popconfirm
              v-if="canWrite"
              title="删除这个支付方式？"
              ok-text="删除"
              cancel-text="取消"
              @confirm="remove(p)"
            >
              <Button size="small" type="link" danger>删除</Button>
            </Popconfirm>
          </div>
        </div>

        <button v-if="canWrite" class="pay-add" @click="openCreate">
          <span class="text-2xl leading-none text-slate-300">＋</span>
          <span class="text-sm text-slate-500">手工登记支付方式</span>
          <span class="text-xs text-slate-400"
            >用于 Spaceship 等无账单接口的注册商</span
          >
        </button>
      </div>

      <div
        class="rounded border border-slate-200 bg-slate-50 px-4 py-3 text-xs leading-relaxed text-slate-500"
      >
        当前默认记账方式：<strong>{{ defaultName || '未设置' }}</strong>
        <template v-if="syncedAt">
          · 上次同步 {{ dayjs(syncedAt).format('MM-DD HH:mm') }}</template
        >
        <br />
        云端的支付方式由服务商账单接口读取（目前 Cloudflare
        支持），只读展示；实际扣款以服务商账户为准，修改请到对应后台。
      </div>
    </div>

    <Card v-else-if="tab === 'orders'" :bordered="true">
      <div class="mb-3 flex items-center justify-between gap-3">
        <div class="text-xs leading-relaxed text-slate-500">
          注册 / 续费 /
          转入在注册商那里是<strong>真实下单</strong>，提交后返回官方操作号；这里记录本地账目，并可回查官方处理结果。
        </div>
        <div class="flex flex-none items-center gap-2">
          <Button size="small" :disabled="!orders.length" @click="exportOrders"
            >导出 CSV</Button
          >
          <Button
            size="small"
            :loading="orderSyncing"
            @click="pullOfficialOrders"
            >同步官方状态</Button
          >
        </div>
      </div>
      <Table
        :columns="orderColumns"
        :data-source="orders"
        :loading="orderLoading"
        :pagination="{ pageSize: 10 }"
        row-key="id"
        size="middle"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'createdAt'">
            <span class="text-xs text-slate-500">{{
              dayjs(record.createdAt).format('YYYY-MM-DD HH:mm')
            }}</span>
          </template>
          <template v-else-if="column.key === 'domain'">
            <span class="font-mono text-[13px]">{{ record.domain }}</span>
          </template>
          <template v-else-if="column.key === 'kind'">
            <Tag class="mr-0">{{ KIND_LABEL[record.kind] || record.kind }}</Tag>
            <span class="ml-1 text-xs text-slate-400"
              >{{ record.years }} 年</span
            >
          </template>
          <template v-else-if="column.key === 'amount'">
            <span class="font-mono text-[13px]">
              {{
                record.amount === null
                  ? '—'
                  : `${record.currency} ${Number(record.amount).toFixed(2)}`
              }}
            </span>
          </template>
          <template v-else-if="column.key === 'status'">
            <Tag
              :color="ORDER_STATUS[record.status]?.color || 'default'"
              class="mr-0"
            >
              {{ ORDER_STATUS[record.status]?.text || record.status }}
            </Tag>
          </template>
          <template v-else-if="column.key === 'source'">
            <div class="truncate text-xs text-slate-600">
              {{ record.paymentName || '未指定' }}
            </div>
            <div class="truncate text-xs text-slate-400">
              {{ record.registrar || '—' }}
            </div>
          </template>
          <template v-else-if="column.key === 'official'">
            <div v-if="record.official">
              <Tag
                :color="
                  OFFICIAL_STATUS[record.official.status]?.color || 'default'
                "
                class="mr-0"
              >
                {{
                  OFFICIAL_STATUS[record.official.status]?.text ||
                  record.official.status
                }}
              </Tag>
              <div
                v-if="record.official.extracted?.orderId"
                class="mt-1 truncate font-mono text-[11px] text-slate-400"
              >
                #{{ record.official.extracted.orderId }}
              </div>
            </div>
            <Tooltip
              v-else
              :title="
                record.operationId
                  ? '还没核对过，点右侧「同步」'
                  : '这笔没有官方操作号'
              "
            >
              <span class="text-xs text-slate-300">未核对</span>
            </Tooltip>
          </template>
          <template v-else-if="column.key === 'action'">
            <Space :size="0">
              <Button size="small" type="link" @click="openOrderDetail(record)"
                >详情</Button
              >
              <Button
                v-if="
                  canWrite &&
                  record.operationId &&
                  record.status === 'submitted'
                "
                size="small"
                type="link"
                @click="pullOneOrder(record)"
              >
                同步
              </Button>
            </Space>
          </template>
        </template>
      </Table>
      <Empty
        v-if="!orders.length"
        :image="Empty.PRESENTED_IMAGE_SIMPLE"
        description="还没有订单记录"
      />
    </Card>

    <Card v-else :bordered="true">
      <Table
        :columns="invoiceColumns"
        :data-source="invoices"
        :loading="orderLoading"
        :pagination="{ pageSize: 10 }"
        row-key="id"
        size="middle"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'occurredAt'">
            <span class="text-xs text-slate-500">{{
              record.occurredAt
                ? dayjs(record.occurredAt).format('YYYY-MM-DD')
                : '—'
            }}</span>
          </template>
          <template v-else-if="column.key === 'invoiceId'">
            <span class="font-mono text-xs">{{ record.invoiceId }}</span>
          </template>
          <template v-else-if="column.key === 'amount'">
            <span class="font-mono text-[13px]">
              {{
                record.amount === null
                  ? '—'
                  : `${record.currency} ${Number(record.amount).toFixed(2)}`
              }}
            </span>
          </template>
          <template v-else-if="column.key === 'status'">
            <Tag
              class="mr-0"
              :color="record.status === 'paid' ? 'green' : 'default'"
              >{{ record.status }}</Tag
            >
          </template>
          <template v-else-if="column.key === 'source'">
            <span class="text-xs text-slate-500">{{
              record.connectionName || record.providerName
            }}</span>
          </template>
          <template v-else-if="column.key === 'action'">
            <a
              v-if="record.hostedInvoiceUrl"
              class="text-xs text-blue-600"
              :href="record.hostedInvoiceUrl"
              target="_blank"
              rel="noreferrer"
              >账单 ↗</a
            >
            <span v-else class="text-xs text-slate-300">—</span>
          </template>
        </template>
      </Table>
      <Empty
        v-if="!invoices.length"
        :image="Empty.PRESENTED_IMAGE_SIMPLE"
        description="服务商没有返回账单记录（需要 Billing:Read 权限与 Account ID）"
      />
    </Card>

    <Modal
      v-model:open="detailOpen"
      :footer="null"
      title="订单详情"
      width="640px"
    >
      <template v-if="orderDetail">
        <div class="grid grid-cols-2 gap-x-6 gap-y-2 text-[13px]">
          <div class="flex justify-between">
            <span class="text-slate-400">域名</span
            ><span class="font-mono">{{ orderDetail.domain }}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-slate-400">类型</span
            ><span
              >{{ KIND_LABEL[orderDetail.kind] || orderDetail.kind }} ·
              {{ orderDetail.years }} 年</span
            >
          </div>
          <div class="flex justify-between">
            <span class="text-slate-400">本地金额</span
            ><span class="font-mono">{{
              orderDetail.amount === null
                ? '—'
                : `${orderDetail.currency} ${Number(orderDetail.amount).toFixed(2)}`
            }}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-slate-400">支付方式</span
            ><span>{{ orderDetail.paymentName || '—' }}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-slate-400">注册商</span
            ><span>{{ orderDetail.registrar || '—' }}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-slate-400">操作人</span
            ><span>{{ orderDetail.operator || '—' }}</span>
          </div>
        </div>

        <div class="mt-4 rounded border border-slate-200 bg-slate-50 px-3 py-2">
          <div class="mb-1 flex items-center justify-between text-xs">
            <span class="font-medium text-slate-600">注册商返回</span>
            <Tag
              v-if="orderDetail.official"
              :color="
                OFFICIAL_STATUS[orderDetail.official.status]?.color || 'default'
              "
              class="mr-0"
            >
              {{
                OFFICIAL_STATUS[orderDetail.official.status]?.text ||
                orderDetail.official.status
              }}
            </Tag>
          </div>
          <div class="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-slate-500">
            <div>
              操作号：<span class="font-mono text-slate-700">{{
                orderDetail.operationId || '—'
              }}</span>
            </div>
            <div>
              操作类型：<span class="font-mono text-slate-700">{{
                orderDetail.official?.type || '—'
              }}</span>
            </div>
            <div>
              官方订单号：<span class="font-mono text-slate-700">{{
                orderDetail.official?.extracted?.orderId || '未返回'
              }}</span>
            </div>
            <div>
              核对时间：{{
                orderDetail.official?.fetchedAt
                  ? dayjs(orderDetail.official.fetchedAt).format(
                      'MM-DD HH:mm:ss',
                    )
                  : '未核对'
              }}
            </div>
          </div>
          <pre
            v-if="orderDetail.official?.details"
            class="mt-2 max-h-56 overflow-auto rounded bg-white p-2 font-mono text-[11px] leading-relaxed text-slate-600"
            >{{ JSON.stringify(orderDetail.official.details, null, 2) }}</pre>
          <div v-else class="mt-2 text-xs text-slate-400">
            还没有拉取官方返回。点订单行的「同步」即可取回；Spaceship
            的异步返回里 details 是未公开结构的对象，这里原样保留。
          </div>
        </div>

        <div
          v-if="canWrite && ['submitted', 'needs-review'].includes(orderDetail.status)"
          class="mt-3 flex items-center justify-between"
        >
          <span class="text-xs text-slate-400"
            >核对不到官方结果时，可人工修正本地状态</span
          >
          <Space :size="4">
            <Button
              size="small"
              @click="
                markOrder(orderDetail, 'succeeded');
                detailOpen = false;
              "
              >标记完成</Button
            >
            <Button
              size="small"
              danger
              @click="
                markOrder(orderDetail, 'failed');
                detailOpen = false;
              "
              >标记失败</Button
            >
          </Space>
        </div>
      </template>
    </Modal>

    <Modal
      v-model:open="modalOpen"
      :confirm-loading="saving"
      :title="editingId ? '编辑支付方式' : '手工登记支付方式'"
      ok-text="保存"
      width="560px"
      @ok="save"
    >
      <div class="grid grid-cols-2 gap-3 pt-2">
        <div class="col-span-2">
          <div class="mb-1 text-xs text-slate-500">名称</div>
          <Input
            v-model:value="form.name"
            placeholder="例如：支付宝 · 主账号"
          />
        </div>
        <div>
          <div class="mb-1 text-xs text-slate-500">类型</div>
          <Select
            v-model:value="form.type"
            style="width: 100%"
            :options="
              (types.length
                ? types
                : Object.keys(TYPE_LABEL).map((k) => ({
                    value: k,
                    label: TYPE_LABEL[k],
                  }))
              ).map((t: any) => ({ label: t.label, value: t.value }))
            "
          />
        </div>
        <div>
          <div class="mb-1 text-xs text-slate-500">状态</div>
          <div class="flex h-8 items-center gap-2">
            <Switch
              v-model:checked="form.status"
              checked-value="active"
              un-checked-value="disabled"
            />
            <span class="text-xs text-slate-500">{{
              form.status === 'active' ? '启用' : '停用'
            }}</span>
          </div>
        </div>
        <div class="col-span-2">
          <div class="mb-1 text-xs text-slate-500">
            {{
              form.type === 'card'
                ? '卡号（只保存后四位）'
                : form.type === 'bank'
                  ? '账户尾号'
                  : '账号 / 邮箱'
            }}
          </div>
          <Input
            v-model:value="form.account"
            class="font-mono"
            :placeholder="form.type === 'card' ? '4242' : 'chck@example.com'"
          />
        </div>
        <div>
          <div class="mb-1 text-xs text-slate-500">持卡人 / 户名</div>
          <Input v-model:value="form.holder" placeholder="选填" />
        </div>
        <div>
          <div class="mb-1 text-xs text-slate-500">有效期（YYYY-MM）</div>
          <Input v-model:value="form.expiry" placeholder="2028-09" />
        </div>
        <div class="col-span-2">
          <div class="mb-1 text-xs text-slate-500">备注</div>
          <Input v-model:value="form.note" placeholder="例如：外币结算，备用" />
        </div>
      </div>
    </Modal>
  </Page>
</template>

<style scoped>
.bill-table {
  width: 100%;
  font-size: 13px;
  border-collapse: collapse;
}
.bill-table th {
  padding: 8px 12px;
  font-size: 12px;
  font-weight: 500;
  color: #64748b;
  text-align: left;
  white-space: nowrap;
  background: #f8fafc;
  border-bottom: 1px solid #e7e9ef;
}
.bill-table td {
  padding: 9px 12px;
  color: #334155;
  border-bottom: 1px solid #f1f5f9;
  vertical-align: top;
}
.bill-table tbody tr:last-child td {
  border-bottom: 0;
}

.cap-card {
  padding: 12px 14px;
  background: #fff;
  border: 1px solid #e7e9ef;
  border-radius: 8px;
}

.cap-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding-bottom: 10px;
  margin-bottom: 2px;
  border-bottom: 1px solid #f1f3f7;
}

.cap-row {
  display: grid;
  grid-template-columns: 132px minmax(0, 1fr) 62px;
  gap: 12px;
  align-items: start;
  padding: 10px 0;
  border-bottom: 1px dashed #f1f3f7;
}

.cap-name {
  padding-top: 1px;
}

.cap-evidence {
  padding-left: 14px;
  margin: 6px 0 0;
  list-style: disc;
}

.cap-evidence li {
  font-size: 12px;
  line-height: 1.7;
  color: #94a3b8;
}

.cap-link {
  font-size: 12px;
  color: #2563eb;
  text-align: right;
  white-space: nowrap;
}

.cap-result {
  padding-top: 10px;
  margin-top: 2px;
  border-top: 1px solid #f1f3f7;
}

.cap-result-item {
  padding: 6px 0;
}

.cap-result-item:last-child {
  padding-bottom: 0;
}

.cap-path {
  padding: 1px 6px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 11.5px;
  color: #475569;
  background: #f6f8fb;
  border-radius: 4px;
}

.seg-btn {
  display: inline-flex;
  gap: 6px;
  align-items: center;
  padding: 5px 12px;
  font-size: 12.5px;
  color: #64748b;
  cursor: pointer;
  background: transparent;
  border: none;
  border-radius: 5px;
}

.seg-btn.active {
  color: #0f172a;
  background: #f1f5f9;
}

.seg-count {
  padding: 0 5px;
  font-size: 11px;
  color: #94a3b8;
  background: #fff;
  border-radius: 8px;
}

.seg-btn.active .seg-count {
  color: #2563eb;
  background: #eff6ff;
}

.pay-card {
  padding: 14px 16px;
  background: #fff;
  border: 1px solid #e6e8ee;
  border-radius: 8px;
  transition: border-color 0.15s;
}

.pay-card:hover {
  border-color: #cbd5e1;
}

.pay-card.synced {
  background: linear-gradient(180deg, #fbfdff, #fff);
  border-color: #dbe7f5;
}

.pay-logo {
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  border-radius: 6px;
  background: #f1f5f9;
}

.pay-logo svg {
  width: 19px;
  height: 19px;
  fill: none;
  stroke: #475569;
  stroke-width: 1.5;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.pay-logo.alipay {
  background: #e8f1ff;
}

.pay-logo.alipay svg {
  stroke: #1677ff;
}

.pay-logo.wechat {
  background: #e8f8ee;
}

.pay-logo.wechat svg {
  stroke: #16a34a;
}

.pay-logo.card {
  background: #eef2ff;
}

.pay-logo.card svg {
  stroke: #4338ca;
}

.pay-add {
  display: flex;
  flex-direction: column;
  gap: 4px;
  align-items: center;
  justify-content: center;
  min-height: 176px;
  cursor: pointer;
  background: #fcfcfd;
  border: 1px dashed #d7dbe3;
  border-radius: 8px;
}

.pay-add:hover {
  background: #f8fafc;
  border-color: #94a3b8;
}
</style>
