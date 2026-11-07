<script lang="ts" setup>
import { computed, onMounted, reactive, ref } from 'vue';

import { useAccess } from '@vben/access';
import Page from '#/components/deck-page.vue';

import {
  Button,
  Card,
  Descriptions,
  DescriptionsItem,
  Empty,
  Input,
  InputNumber,
  message,
  Modal,
  Select,
  Spin,
  Switch,
  Tag,
} from 'ant-design-vue';

import {
  checkAvailability,
  getPayments,
  getSettings,
  registerDomain,
} from '#/api/domaindeck';
import { usePermissions } from '#/composables/use-permissions';

const { hasAccessByCodes } = useAccess();
const { can } = usePermissions();
const canBill = computed(() => hasAccessByCodes(['domain:billing']));

const keyword = ref('');
const loading = ref(false);
const result = ref<any>(null);
const registrarId = ref<string | undefined>();
// 每家接入各给一份报价，前端逐行展示、可按行选择下单对象
const quotes = computed<any[]>(() => result.value?.quotes || []);
const selectedQuote = computed<any>(
  () =>
    quotes.value.find((q) => q.connectionId === registrarId.value) ||
    quotes.value.find((q) => q.isDefault && !q.error) ||
    quotes.value[0] ||
    null,
);
const selectedRegistrar = computed(() =>
  selectedQuote.value
    ? {
        id: selectedQuote.value.connectionId,
        name: selectedQuote.value.connectionName,
        provider: selectedQuote.value.provider,
        canRegister: selectedQuote.value.capabilities?.register,
        requiresContact: selectedQuote.value.capabilities?.requiresContact,
      }
    : null,
);
// Porkbun 这类用账户自带联系人，不需要填联系人 ID
const needsContact = computed(
  () => selectedQuote.value?.capabilities?.requiresContact !== false,
);

const modalOpen = ref(false);
const saving = ref(false);
const payments = ref<any[]>([]);
const settings = ref<any>({ contacts: {} });

const form = reactive<any>({
  years: 1,
  privacyLevel: 'high',
  autoRenew: true,
  registrant: '',
  admin: '',
  tech: '',
  paymentMethodId: undefined,
});

function priceOf(key: string, quote?: any) {
  const p = (quote || selectedQuote.value)?.prices?.[key];
  return p ? { amount: p.amount, currency: p.currency } : null;
}

const prices = computed(() => ({
  register: priceOf('register'),
  renew: priceOf('renew'),
  transfer: priceOf('transfer'),
}));

const availabilityMap: Record<string, { color: string; text: string }> = {
  available: { color: 'green', text: '可以注册' },
  taken: { color: 'orange', text: '已被注册' },
  invalidDomainName: { color: 'red', text: '域名格式无效' },
  tldNotSupported: { color: 'default', text: '暂不支持该后缀' },
  unexpectedError: { color: 'red', text: '查询失败' },
};

const status = computed(
  () =>
    availabilityMap[selectedQuote.value?.availability?.result] || {
      color: 'default',
      text: '未知',
    },
);

function badgeOf(result?: string) {
  return (
    availabilityMap[result || ''] || { color: 'default', text: result || '—' }
  );
}

function priceText(q: any, key: string) {
  const p = priceOf(key, q);
  return p && p.amount !== undefined
    ? `${p.currency === 'USD' ? '$' : ''}${Number(p.amount).toFixed(2)}`
    : '—';
}

function choose(q: any) {
  registrarId.value = q.connectionId;
}

function chooseAndRegister(q: any) {
  registrarId.value = q.connectionId;
  openRegister();
}

async function search() {
  const domain = keyword.value
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '');
  if (!domain) {
    message.warning('请输入要查询的域名');
    return;
  }
  loading.value = true;
  result.value = null;
  try {
    result.value = await checkAvailability(domain);
    const list = (result.value as any)?.quotes || [];
    const usable = list.filter((q: any) => !q.error);
    registrarId.value = (
      usable.find((q: any) => q.isDefault && q.capabilities?.register) ||
      usable.find((q: any) => q.capabilities?.register) ||
      usable[0] ||
      list[0]
    )?.connectionId;
  } catch (error: any) {
    message.error(error?.message || '查询失败');
  } finally {
    loading.value = false;
  }
}

onMounted(async () => {
  const [payRes, setRes] = await Promise.allSettled([
    can('payment:read') ? getPayments() : Promise.resolve({ items: [] }),
    can('settings:read') ? getSettings() : Promise.resolve({ contacts: {} }),
  ]);
  if (payRes.status === 'fulfilled') {
    payments.value = ((payRes.value as any).items || []).filter(
      (p: any) => p.status === 'active',
    );
  }
  if (setRes.status === 'fulfilled') {
    settings.value = setRes.value;
    form.registrant = settings.value?.contacts?.registrant || '';
    form.admin = settings.value?.contacts?.admin || '';
    form.tech = settings.value?.contacts?.tech || '';
  }
});

async function openRegister() {
  form.years = 1;
  form.privacyLevel = 'high';
  form.autoRenew = true;
  form.paymentMethodId = payments.value.find((p) => p.isDefault)?.id;
  modalOpen.value = true;
}

async function submit() {
  if (needsContact.value && !form.registrant) {
    message.warning('请填写注册人联系人 ID');
    return;
  }
  saving.value = true;
  try {
    const res: any = await registerDomain({
      domain: result.value.domain,
      years: form.years,
      privacyLevel: form.privacyLevel,
      autoRenew: form.autoRenew,
      paymentMethodId: form.paymentMethodId,
      connectionId: selectedRegistrar.value?.id,
      contacts: {
        registrant: form.registrant,
        admin: form.admin,
        tech: form.tech,
      },
    });
    if (res.cancelled) return;
    message.success(
      `注册请求已提交${res?.operationId ? `，操作号 ${res.operationId}` : ''}`,
    );
    modalOpen.value = false;
  } finally {
    saving.value = false;
  }
}

function money(v: null | { amount: string; currency: string }) {
  return v ? `${v.currency} ${v.amount}` : '—';
}
</script>

<template>
  <Page
    description="一次查询全部注册商的库存与价格，按行选择下单对象"
    title="查询与注册"
  >
    <template #extra>
      <Tag v-if="!canBill" color="default" class="mr-0">当前账号无扣费权限</Tag>
    </template>

    <Card :bordered="true">
      <div class="flex flex-wrap items-center gap-2">
        <Input
          v-model:value="keyword"
          class="max-w-[420px] font-mono"
          placeholder="输入要查询的域名，例如 yourname.com"
          size="large"
          @press-enter="search"
        />
        <Button :loading="loading" size="large" type="primary" @click="search"
          >查询</Button
        >
        <span class="text-xs text-slate-400"
          >一次查一个域名，逐家注册商实时报价</span
        >
      </div>
    </Card>

    <Spin :spinning="loading">
      <Card v-if="result" class="mt-4" :bordered="true">
        <template #title>
          <div class="flex flex-wrap items-center gap-2">
            <span class="font-mono text-base">{{ result.domain }}</span>
            <Tag :color="status.color" class="mr-0">{{ status.text }}</Tag>
            <Tag v-if="result.zone" color="cyan" class="mr-0"
              >已在 Cloudflare</Tag
            >
            <Tag v-if="quotes.length > 1" class="mr-0"
              >{{ quotes.length }} 家注册商报价</Tag
            >
          </div>
        </template>
        <template #extra>
          <span class="text-xs text-slate-400"
            >价格来自各注册商实时接口，点行选择下单对象</span
          >
        </template>

        <div class="grid grid-cols-1 gap-3 md:grid-cols-3">
          <div class="price-box">
            <div class="text-xs text-slate-500">
              注册 · {{ selectedQuote?.connectionName }}
            </div>
            <div class="price-value">{{ money(prices.register) }}</div>
            <div class="text-xs text-slate-400">首年价格</div>
          </div>
          <div class="price-box">
            <div class="text-xs text-slate-500">续费</div>
            <div class="price-value">{{ money(prices.renew) }}</div>
            <div class="text-xs text-slate-400">每年</div>
          </div>
          <div class="price-box">
            <div class="text-xs text-slate-500">转入</div>
            <div class="price-value">{{ money(prices.transfer) }}</div>
            <div class="text-xs text-slate-400">含一年续期</div>
          </div>
        </div>

        <div class="mt-4 overflow-x-auto rounded border border-slate-200">
          <table class="quote-table">
            <thead>
              <tr>
                <th>注册商</th>
                <th>状态</th>
                <th>注册</th>
                <th>续费</th>
                <th>转入</th>
                <th class="text-right">操作</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="q in quotes"
                :key="q.connectionId"
                :class="{
                  'is-selected': q.connectionId === selectedQuote?.connectionId,
                  'is-error': Boolean(q.error),
                }"
                @click="choose(q)"
              >
                <td>
                  <div class="flex items-center gap-1.5">
                    <span
                      class="text-[13px] whitespace-nowrap text-slate-800"
                      >{{ q.connectionName }}</span
                    >
                    <Tag v-if="q.isDefault" class="mr-0" color="blue">默认</Tag>
                  </div>
                  <div class="text-xs text-slate-400">{{ q.providerName }}</div>
                  <div
                    v-if="q.error"
                    class="mt-1 max-w-[300px] text-xs leading-relaxed text-red-600"
                  >
                    {{ q.error }}
                  </div>
                </td>
                <td>
                  <Tag v-if="q.error" color="red" class="mr-0">查询失败</Tag>
                  <Tag
                    v-else
                    :color="badgeOf(q.availability?.result).color"
                    class="mr-0"
                  >
                    {{ badgeOf(q.availability?.result).text }}
                  </Tag>
                </td>
                <td class="font-mono">{{ priceText(q, 'register') }}</td>
                <td class="font-mono">{{ priceText(q, 'renew') }}</td>
                <td class="font-mono">{{ priceText(q, 'transfer') }}</td>
                <td class="text-right">
                  <Button v-if="q.error" size="small" disabled>不可用</Button>
                  <Button
                    v-else-if="!q.capabilities?.register"
                    size="small"
                    disabled
                    >不支持注册</Button
                  >
                  <Button
                    v-else-if="q.availability?.result !== 'available'"
                    size="small"
                    disabled
                    >已被注册</Button
                  >
                  <Button
                    v-else-if="!canBill"
                    size="small"
                    disabled
                    title="当前账号没有扣费权限"
                    >注册</Button
                  >
                  <Button
                    v-else
                    size="small"
                    type="primary"
                    @click.stop="chooseAndRegister(q)"
                    >注册</Button
                  >
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div
          v-if="quotes.some((q) => !q.capabilities?.register)"
          class="mt-3 text-xs text-slate-400"
        >
          部分注册商（如
          Cloudflare）的注册接口仍在灰度，只能查询价格，不能直接下单。
        </div>
      </Card>

      <Card v-else-if="!loading" class="mt-4" :bordered="true">
        <Empty
          :image="Empty.PRESENTED_IMAGE_SIMPLE"
          description="输入域名开始查询"
        />
      </Card>
    </Spin>

    <Card class="mt-4" :bordered="true" title="注册前需要准备什么">
      <div class="space-y-2 text-[13px] leading-relaxed text-slate-600">
        <div>
          <span class="mr-1 text-slate-400">01</span
          ><strong>联系人</strong>：Spaceship 注册需要引用已有联系人
          ID（在域名详情里取
          <code class="rounded bg-slate-100 px-1 font-mono text-xs"
            >contacts.registrant</code
          >）；Porkbun、GoDaddy 使用账户自带联系人，无需填写。
        </div>
        <div>
          <span class="mr-1 text-slate-400">02</span
          ><strong>支付方式</strong
          >：实际扣款由注册商账户完成，选择的支付方式用于本地记账与核对。
        </div>
        <div>
          <span class="mr-1 text-slate-400">03</span
          ><strong>扣费开关</strong
          >：若「系统设置」中关闭了允许扣费，注册请求会被服务端直接拒绝。
        </div>
        <div>
          <span class="mr-1 text-slate-400">04</span
          ><strong>解析规划</strong>：注册后把 NS 指向 Cloudflare，即可在「DNS
          解析」页维护记录。
        </div>
      </div>
    </Card>

    <Modal
      v-model:open="modalOpen"
      :confirm-loading="saving"
      ok-text="确认注册"
      title="注册域名"
      width="620px"
      @ok="submit"
    >
      <div class="space-y-4 pt-2">
        <div
          class="rounded border border-blue-100 bg-blue-50 px-3 py-2 text-xs text-blue-800"
        >
          即将注册 <span class="font-mono">{{ result?.domain }}</span>
          <template v-if="prices.register"
            >，首年费用约 {{ money(prices.register) }}</template
          >
          。注册成功后一般不支持退款。
        </div>

        <Descriptions :column="2" bordered size="small">
          <DescriptionsItem label="注册年限">
            <InputNumber
              v-model:value="form.years"
              :min="1"
              :max="10"
              size="small"
            />
            年
          </DescriptionsItem>
          <DescriptionsItem label="WHOIS 隐私">
            <Select
              v-model:value="form.privacyLevel"
              size="small"
              style="width: 100%"
              :options="[
                { label: '隐藏（推荐）', value: 'high' },
                { label: '公开', value: 'public' },
              ]"
            />
          </DescriptionsItem>
          <DescriptionsItem label="自动续费" :span="2">
            <Switch
              v-model:checked="form.autoRenew"
              checked-children="开启"
              un-checked-children="关闭"
              size="small"
            />
          </DescriptionsItem>
        </Descriptions>

        <div class="grid grid-cols-1 gap-3 md:grid-cols-2">
          <template v-if="needsContact">
            <div class="md:col-span-2">
              <div class="mb-1 text-xs text-slate-500">
                注册人联系人 ID（必填）
              </div>
              <Input
                v-model:value="form.registrant"
                class="font-mono"
                placeholder="1ZdMXpapqp9sle5dl8BlppTJXAzf5"
              />
            </div>
            <div>
              <div class="mb-1 text-xs text-slate-500">Admin（选填）</div>
              <Input
                v-model:value="form.admin"
                class="font-mono"
                placeholder="默认同注册人"
              />
            </div>
            <div>
              <div class="mb-1 text-xs text-slate-500">Tech（选填）</div>
              <Input
                v-model:value="form.tech"
                class="font-mono"
                placeholder="默认同注册人"
              />
            </div>
          </template>
          <div class="md:col-span-2">
            <div class="mb-1 text-xs text-slate-500">支付方式（本地记账）</div>
            <Select
              v-model:value="form.paymentMethodId"
              allow-clear
              style="width: 100%"
              placeholder="默认支付方式"
              :options="
                payments.map((p) => ({
                  label: `${p.name}${p.isDefault ? '（默认）' : ''}`,
                  value: p.id,
                }))
              "
            />
          </div>
        </div>
      </div>
    </Modal>
  </Page>
</template>

<style scoped>
.quote-table {
  width: 100%;
  font-size: 13px;
  border-collapse: collapse;
}

.quote-table th {
  padding: 8px 12px;
  font-size: 12px;
  font-weight: 500;
  color: #64748b;
  text-align: left;
  white-space: nowrap;
  background: #f8fafc;
  border-bottom: 1px solid #e7e9ef;
}

.quote-table td {
  padding: 10px 12px;
  color: #334155;
  border-bottom: 1px solid #f1f5f9;
  vertical-align: top;
}

.quote-table tbody tr {
  cursor: pointer;
}

.quote-table tbody tr:hover {
  background: #f8fafc;
}

.quote-table tbody tr.is-selected {
  background: #eff6ff;
  box-shadow: inset 3px 0 0 #2563eb;
}

.quote-table tbody tr.is-error {
  cursor: default;
}

.quote-table tbody tr:last-child td {
  border-bottom: 0;
}

.price-box {
  padding: 14px 16px;
  background: #f8fafc;
  border: 1px solid #e6e8ee;
  border-radius: 6px;
}

.price-value {
  margin: 4px 0 2px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 22px;
  font-weight: 600;
  color: #0f172a;
  letter-spacing: -0.02em;
}
</style>
