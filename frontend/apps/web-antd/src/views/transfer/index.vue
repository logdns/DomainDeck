<script lang="ts" setup>
import { computed, onMounted, reactive, ref } from 'vue';

import { useAccess } from '@vben/access';
import Page from '#/components/deck-page.vue';

import {
  Button,
  Card,
  Descriptions,
  DescriptionsItem,
  Input,
  message,
  Select,
  Space,
  Switch,
  Tag,
} from 'ant-design-vue';

import {
  getPayments,
  getSettings,
  getTransferInfo,
  getTransferQuotes,
  submitTransfer,
} from '#/api/domaindeck';
import { usePermissions } from '#/composables/use-permissions';

const { hasAccessByCodes } = useAccess();
const { can } = usePermissions();
const canTransfer = hasAccessByCodes(['transfer:write']);

const form = reactive<any>({
  domain: '',
  authCode: '',
  contactExtensions: '',
  registrant: '',
  privacyLevel: 'high',
  autoRenew: true,
  paymentMethodId: undefined,
});

const payments = ref<any[]>([]);
const submitting = ref(false);

// 逐家询价：转入价与能力都按注册商分别展示
const quotes = ref<any[]>([]);
const quoting = ref(false);
const selectedQuoteId = ref<string | undefined>();
const selectedQuote = computed<any>(
  () =>
    quotes.value.find((q) => q.connectionId === selectedQuoteId.value) || null,
);
const needsContact = computed(
  () => selectedQuote.value?.requiresContact === true,
);
const isCloudflare = computed(() => selectedQuote.value?.provider === 'cloudflare');
const isUkDomain = computed(() => isCloudflare.value && /\.uk$/i.test(form.domain.trim()));

const query = ref('');
const querying = ref(false);
const queryResult = ref<any>(null);
const queryError = ref('');

onMounted(async () => {
  const [payRes, setRes] = await Promise.allSettled([
    can('payment:read') ? getPayments() : Promise.resolve({ items: [] }),
    can('settings:read') ? getSettings() : Promise.resolve({ contacts: {} }),
  ]);
  if (payRes.status === 'fulfilled')
    payments.value = (payRes.value as any).items || [];
  if (setRes.status === 'fulfilled')
    form.registrant = (setRes.value as any)?.contacts?.registrant || '';
});

async function loadQuotes() {
  const domain = form.domain.trim().toLowerCase();
  if (!domain) {
    message.warning('先输入要转入的域名');
    return;
  }
  quoting.value = true;
  try {
    const res: any = await getTransferQuotes(domain);
    form.domain = res.domain;
    quotes.value = res.quotes || [];
    if (!quotes.value.some((q) => q.connectionId === selectedQuoteId.value)) {
      selectedQuoteId.value = (
        quotes.value.find((q) => q.isDefault) || quotes.value[0]
      )?.connectionId;
    }
  } catch (error: any) {
    quotes.value = [];
    message.error(error?.message || '查询报价失败');
  } finally {
    quoting.value = false;
  }
}

function pick(q: any) {
  selectedQuoteId.value = q.connectionId;
}

async function submit() {
  if (
    !form.domain ||
    (!isUkDomain.value && !form.authCode) ||
    (needsContact.value && !form.registrant)
  ) {
    message.warning(
      needsContact.value
        ? '域名、授权码、注册人联系人 ID 均为必填'
        : isUkDomain.value
          ? '请输入域名'
          : '域名与授权码为必填',
    );
    return;
  }
  let contactExtensions: Record<string, unknown> | undefined;
  if (form.contactExtensions.trim()) {
    try {
      const parsed = JSON.parse(form.contactExtensions);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error();
      contactExtensions = parsed;
    } catch {
      message.warning('Cloudflare 联系人扩展必须是 JSON 对象');
      return;
    }
  }
  submitting.value = true;
  try {
    const res: any = await submitTransfer({
      domain: form.domain,
      authCode: form.authCode,
      ...(contactExtensions ? { contactExtensions } : {}),
      privacyLevel: form.privacyLevel,
      autoRenew: form.autoRenew,
      paymentMethodId: form.paymentMethodId,
      connectionId: selectedQuoteId.value,
      contacts: { registrant: form.registrant },
    });
    if (res.cancelled) return;
    message.success(
      `转入申请已提交${res?.operationId ? `，操作号 ${res.operationId}` : ''}`,
    );
    query.value = form.domain;
    await checkStatus();
  } finally {
    submitting.value = false;
  }
}

async function checkStatus() {
  const domain = query.value.trim().toLowerCase();
  if (!domain) return;
  querying.value = true;
  queryError.value = '';
  queryResult.value = null;
  try {
    queryResult.value = await getTransferInfo(domain, selectedQuoteId.value);
  } catch (error: any) {
    queryError.value = error?.message || '查询失败';
  } finally {
    querying.value = false;
  }
}

const STATUS: Record<string, { color: string; text: string }> = {
  pendingOwnerAction: { color: 'orange', text: '等待原注册商确认' },
  pending: { color: 'orange', text: '转移处理中' },
  in_progress: { color: 'blue', text: '转移进行中' },
  action_required: { color: 'orange', text: '需要你完成操作' },
  blocked: { color: 'gold', text: '等待原注册商或注册局响应' },
  succeeded: { color: 'green', text: '转移完成' },
  failed: { color: 'red', text: '转移失败，请核对原因后再操作' },
  inProgress: { color: 'blue', text: '转移进行中' },
  completed: { color: 'green', text: '转移完成' },
  success: { color: 'green', text: '转移完成' },
  cancelled: { color: 'default', text: '已取消' },
};

function statusOf(data: any) {
  const code = data?.state || data?.status || data?.transferStatus || '';
  return STATUS[code] || { color: 'default', text: code || '未知状态' };
}
</script>

<template>
  <Page
    description="把域名转入任一家已接入的注册商，或按清单转出"
    title="转入与转出"
  >
    <template #extra>
      <Tag v-if="!canTransfer" color="default" class="mr-0"
        >当前账号无转移权限</Tag
      >
    </template>

    <div class="grid grid-cols-1 gap-4 xl:grid-cols-5">
      <Card class="xl:col-span-3" :bordered="true" title="转入域名">
        <div
          class="mb-4 rounded border border-blue-100 bg-blue-50 px-3 py-2 text-xs leading-relaxed text-blue-800"
        >
          转入前请在原注册商解锁域名并取得授权码，确认联系人和支付方式有效。
          转入一般需 1–10 天；提交前会再次询价并确认扣款，结果不明时请先核对订单。
          <div v-if="isCloudflare" class="mt-2 font-semibold">
            Cloudflare 要求域名已添加为激活的 Zone 并关闭 DNSSEC；.uk 系列使用 Cloudflare IPS Tag，无需 EPP 码。
            API 不提供转入报价，请先核实实际费用；提交会从默认支付方式扣款，费用不可退款。
          </div>
        </div>

        <div class="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div class="md:col-span-2">
            <div class="mb-1 text-xs text-slate-500">域名</div>
            <div class="flex gap-2">
              <Input
                v-model:value="form.domain"
                class="font-mono"
                placeholder="example.com"
                @press-enter="loadQuotes"
              />
              <Button
                :disabled="!can('domain:read')"
                :loading="quoting"
                @click="loadQuotes"
                >查转入报价</Button
              >
            </div>
          </div>
          <div v-if="isCloudflare" class="md:col-span-2">
            <div class="mb-1 text-xs text-slate-500">注册局专用联系人扩展（可选）</div>
            <Input.TextArea
              v-model:value="form.contactExtensions"
              :rows="2"
              placeholder="{}"
            />
            <div class="mt-1 text-xs text-slate-400">
              仅当 Cloudflare 对应后缀的 transfer_schema 要求 contact_extensions 时填写 JSON 对象。
            </div>
          </div>

          <div class="md:col-span-2">
            <div class="mb-1 flex items-center justify-between">
              <span class="text-xs text-slate-500">转入到哪家注册商</span>
              <span v-if="selectedQuote" class="text-xs text-slate-400">
                已选 {{ selectedQuote.connectionName }}
                <template v-if="selectedQuote.price"
                  >· {{ selectedQuote.price.currency }}
                  {{ Number(selectedQuote.price.amount).toFixed(2) }}</template
                >
              </span>
            </div>
            <div
              v-if="quotes.length"
              class="overflow-x-auto rounded border border-slate-200"
            >
              <table class="quote-table">
                <thead>
                  <tr>
                    <th>注册商</th>
                    <th>转入价</th>
                    <th>域名状态</th>
                    <th class="text-right">选择</th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="q in quotes"
                    :key="q.connectionId"
                    :class="{
                      'is-selected': q.connectionId === selectedQuoteId,
                    }"
                    @click="pick(q)"
                  >
                    <td>
                      <div class="flex items-center gap-1.5">
                        <span
                          class="whitespace-nowrap text-[13px] text-slate-800"
                          >{{ q.connectionName }}</span
                        >
                        <Tag v-if="q.isDefault" class="mr-0" color="blue"
                          >默认</Tag
                        >
                      </div>
                      <div class="text-xs text-slate-400">
                        {{ q.providerName }}
                      </div>
                      <div
                        v-if="q.error"
                        class="mt-1 max-w-[280px] text-xs text-red-600"
                      >
                        {{ q.error }}
                      </div>
                    </td>
                    <td class="font-mono">
                      {{
                        q.price
                          ? `${q.price.currency} ${Number(q.price.amount).toFixed(2)}`
                          : q.provider === 'cloudflare' && q.transferPriceUnknown
                            ? 'Cloudflare 实际价，API 不提供报价'
                            : '—'
                      }}
                    </td>
                    <td class="text-xs text-slate-500">
                      {{
                        q.transferReady === false
                          ? q.transferBlockReason || 'Cloudflare 转入条件未满足'
                          : q.available === 'taken'
                          ? '已被注册（可转入）'
                          : q.transferReady === true
                            ? 'Cloudflare Zone 已激活，DNSSEC 已关闭'
                            : q.available || '—'
                      }}
                    </td>
                    <td class="text-right">
                      <Tag
                        v-if="q.connectionId === selectedQuoteId"
                        color="blue"
                        class="mr-0"
                        >已选</Tag
                      >
                      <Button
                        v-else
                        size="small"
                        type="link"
                        @click.stop="pick(q)"
                        >选它</Button
                      >
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div
              v-else
              class="rounded border border-dashed border-slate-200 px-3 py-4 text-center text-xs text-slate-400"
            >
              输入域名后点「查转入报价」，会列出每家注册商的价格与是否支持转入。
            </div>
          </div>
          <div class="md:col-span-2">
            <div class="mb-1 text-xs text-slate-500">
              {{ isUkDomain ? 'UK 域名：不使用 EPP 码' : '授权码（EPP Code）' }}
            </div>
            <Input
              v-model:value="form.authCode"
              class="font-mono"
              :disabled="isUkDomain"
              :placeholder="isUkDomain ? '请在原注册商设置 Cloudflare IPS Tag' : '从原注册商获取'"
            />
          </div>
          <div v-if="!isCloudflare">
            <div class="mb-1 text-xs text-slate-500">WHOIS 隐私</div>
            <Select
              v-model:value="form.privacyLevel"
              style="width: 100%"
              :options="[
                { label: '隐藏（推荐）', value: 'high' },
                { label: '公开', value: 'public' },
              ]"
            />
          </div>
          <div>
            <div class="mb-1 text-xs text-slate-500">转入后自动续费</div>
            <div class="flex items-center gap-2">
              <Switch v-model:checked="form.autoRenew" />
              <span class="text-xs text-slate-500">{{
                form.autoRenew ? '开启' : '关闭'
              }}</span>
            </div>
          </div>
          <div v-if="needsContact" class="md:col-span-2">
            <div class="mb-1 text-xs text-slate-500">注册人联系人 ID</div>
            <Input
              v-model:value="form.registrant"
              class="font-mono"
              placeholder="1ZdMXpapqp9sle5dl8BlppTJXAzf5"
            />
          </div>
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

        <div class="mt-4 flex justify-end">
          <Button
            :disabled="!canTransfer"
            :loading="submitting"
            type="primary"
            @click="submit"
            >提交转入申请</Button
          >
        </div>
      </Card>

      <div class="space-y-4 xl:col-span-2">
        <Card :bordered="true" title="查询转移状态">
          <Space.Compact style="width: 100%">
            <Input
              v-model:value="query"
              class="font-mono"
              placeholder="输入已提交转入的域名"
              @press-enter="checkStatus"
            />
            <Button :loading="querying" @click="checkStatus">查询</Button>
          </Space.Compact>

          <div class="mt-3">
            <div
              v-if="queryError"
              class="rounded border border-red-100 bg-red-50 px-3 py-2 text-xs text-red-700"
            >
              {{ queryError }}
            </div>
            <div v-else-if="queryResult">
              <Tag :color="statusOf(queryResult).color" class="mb-2">{{
                statusOf(queryResult).text
              }}</Tag>
              <Descriptions :column="1" size="small" bordered>
                <DescriptionsItem label="域名">{{
                  queryResult.domain_name || queryResult.domain || query
                }}</DescriptionsItem>
                <DescriptionsItem v-if="queryResult.state" label="Cloudflare 状态">
                  {{ queryResult.state }}
                </DescriptionsItem>
                <DescriptionsItem v-if="queryResult.context?.action" label="待处理操作">
                  {{ queryResult.context.action }}
                </DescriptionsItem>
                <DescriptionsItem v-if="queryResult.error?.message" label="失败原因">
                  {{ queryResult.error.message }}
                </DescriptionsItem>
                <DescriptionsItem v-if="queryResult.state === 'action_required'" label="需要处理">
                  请查看 Cloudflare 返回的 context，并完成邮件或注册局要求后再次查询。
                </DescriptionsItem>
                <DescriptionsItem v-if="queryResult.state === 'blocked'" label="转入说明">
                  等待原注册商或注册局响应属正常状态，可稍后再次查询。
                </DescriptionsItem>
                <DescriptionsItem
                  v-if="queryResult.requestedAt"
                  label="提交时间"
                  >{{ queryResult.requestedAt }}</DescriptionsItem
                >
                <DescriptionsItem
                  v-if="queryResult.estimatedCompletion"
                  label="预计完成"
                  >{{ queryResult.estimatedCompletion }}</DescriptionsItem
                >
                <DescriptionsItem
                  v-if="queryResult.completedAt"
                  label="完成时间"
                  >{{ queryResult.completedAt }}</DescriptionsItem
                >
              </Descriptions>
              <details class="mt-2">
                <summary class="cursor-pointer text-xs text-slate-400">
                  查看原始返回
                </summary>
                <pre
                  class="mt-1 max-h-40 overflow-auto whitespace-pre-wrap rounded bg-slate-50 p-2 font-mono text-[11px] text-slate-500"
                  >{{ JSON.stringify(queryResult, null, 2) }}</pre>
              </details>
            </div>
            <div v-else class="text-xs text-slate-400">
              输入域名后查询转移进度。
            </div>
          </div>
        </Card>

        <Card :bordered="true" title="转出准备">
          <ol class="space-y-2 text-[13px] leading-relaxed text-slate-600">
            <li>
              <span class="mr-1 text-slate-400">1.</span>在「域名管理 →
              详情」关闭转移锁（clientTransferProhibited）。
            </li>
            <li>
              <span class="mr-1 text-slate-400">2.</span
              >获取转移授权码，有效期一般 30 天，请勿外泄。
            </li>
            <li>
              <span class="mr-1 text-slate-400">3.</span>确认域名注册满 60
              天且不在赎回期。
            </li>
            <li>
              <span class="mr-1 text-slate-400">4.</span>在目标注册商提交转入，5
              天内确认邮件。
            </li>
          </ol>
          <div
            class="mt-3 rounded border border-amber-100 bg-amber-50 px-3 py-2 text-xs text-amber-800"
          >
            转入申请提交后不能随意撤回，且可能产生费用。请确认域名与授权码无误。
          </div>
        </Card>
      </div>
    </div>
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
  padding: 9px 12px;
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
.quote-table tbody tr:last-child td {
  border-bottom: 0;
}
</style>
