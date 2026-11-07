<script lang="ts" setup>
import { computed, onMounted, reactive, ref } from 'vue';

import Page from '#/components/deck-page.vue';
import { usePermissions } from '#/composables/use-permissions';

import {
  Alert,
  Button,
  Card,
  Input,
  InputNumber,
  message,
  Modal,
  Popconfirm,
  Select,
  Switch,
  Table,
  Tag,
  Tooltip,
} from 'ant-design-vue';
import dayjs from 'dayjs';

import {
  getNotificationLog,
  getNotifications,
  runExpiryCheck,
  saveNotifications,
  testNotification,
} from '#/api/domaindeck';

const { can } = usePermissions();
const loading = ref(false);
const saving = ref(false);
const running = ref(false);
const testing = ref<Record<string, boolean>>({});

const enabled = ref(true);
const expiryDays = ref<number[]>([30, 14, 7, 3, 1]);
const channelTypes = ref<any[]>([]);
const channels = ref<any[]>([]);
const log = ref<any[]>([]);
const lastCheckAt = ref<null | string>(null);
const lastResult = ref<any>(null);

const modalOpen = ref(false);
const editingId = ref<null | string>(null);
const form = reactive<any>({
  type: 'email',
  name: '',
  enabled: true,
  config: {},
});

const activeType = computed(() =>
  channelTypes.value.find((t) => t.type === form.type),
);

async function load() {
  loading.value = true;
  try {
    const res: any = await getNotifications();
    enabled.value = res.enabled;
    expiryDays.value = res.rules?.expiryDays || [30, 14, 7, 3, 1];
    channelTypes.value = res.channelTypes || [];
    channels.value = (res.channels || []).map((c: any) => ({ ...c }));
    lastCheckAt.value = res.lastCheckAt;
    lastResult.value = res.lastResult;
    const logRes: any = await getNotificationLog(30).catch(() => ({
      items: [],
    }));
    log.value = logRes.items || [];
  } finally {
    loading.value = false;
  }
}

onMounted(load);

async function persist(next?: {
  enabled?: boolean;
  expiryDays?: number[];
  channels?: any[];
}) {
  saving.value = true;
  try {
    const payload = {
      enabled: next?.enabled ?? enabled.value,
      rules: { expiryDays: next?.expiryDays ?? expiryDays.value },
      channels: next?.channels ?? channels.value,
    };
    await saveNotifications(payload);
    await load();
  } finally {
    saving.value = false;
  }
}

async function toggleEnabled(value: boolean) {
  enabled.value = value;
  try {
    await persist({ enabled: value });
    message.success(value ? '到期提醒已开启' : '到期提醒已关闭');
  } catch {
    enabled.value = !value;
  }
}

async function updateDays(value: number[]) {
  const days = [
    ...new Set(value.map((v) => Number(v)).filter((v) => v > 0 && v <= 365)),
  ].sort((a, b) => b - a);
  expiryDays.value = days;
  await persist({ expiryDays: days });
  message.success('提醒节点已保存');
}

function openCreate(type?: string) {
  editingId.value = null;
  const meta = channelTypes.value.find((t) => t.type === (type || 'email'));
  form.type = meta?.type || 'email';
  form.name = meta?.label || '';
  form.enabled = true;
  form.config = {};
  (meta?.fields || []).forEach((f: any) => {
    form.config[f.key] =
      f.kind === 'switch' ? Boolean(f.default) : (f.default ?? '');
  });
  modalOpen.value = true;
}

function openEdit(channel: any) {
  editingId.value = channel.id;
  form.type = channel.type;
  form.name = channel.name;
  form.enabled = channel.enabled;
  form.config = { ...channel.config };
  modalOpen.value = true;
}

function switchType(value: string) {
  const meta = channelTypes.value.find((t) => t.type === value);
  form.config = {};
  (meta?.fields || []).forEach((f: any) => {
    form.config[f.key] =
      f.kind === 'switch' ? Boolean(f.default) : (f.default ?? '');
  });
  if (!form.name || channelTypes.value.some((t) => t.label === form.name))
    form.name = meta?.label || value;
}

async function saveChannel() {
  if (!form.name) {
    message.warning('请填写渠道名称');
    return;
  }
  const next = [...channels.value];
  const item = {
    id: editingId.value || undefined,
    type: form.type,
    name: form.name,
    enabled: form.enabled,
    config: { ...form.config },
  };
  if (editingId.value) {
    const idx = next.findIndex((c) => c.id === editingId.value);
    if (idx >= 0) next[idx] = { ...next[idx], ...item };
  } else {
    next.push(item);
  }
  try {
    await persist({ channels: next });
    message.success(editingId.value ? '渠道已更新' : '渠道已添加');
    modalOpen.value = false;
  } catch {
    /* 错误提示由请求层统一处理 */
  }
}

async function toggleChannel(channel: any, value: boolean) {
  const next = channels.value.map((c) =>
    c.id === channel.id ? { ...c, enabled: value } : c,
  );
  channel.enabled = value;
  try {
    await persist({ channels: next });
  } catch {
    channel.enabled = !value;
  }
}

async function removeChannel(channel: any) {
  await persist({
    channels: channels.value.filter((c) => c.id !== channel.id),
  });
  message.success('渠道已删除');
}

async function runTest(channel: any) {
  testing.value = { ...testing.value, [channel.id]: true };
  try {
    const res: any = await testNotification(channel.id);
    if (res?.ok) message.success(res.message || '发送成功');
    else
      message.warning(res?.results?.[0]?.message || res?.message || '发送失败');
    await load();
  } finally {
    const next = { ...testing.value };
    delete next[channel.id];
    testing.value = next;
  }
}

async function runNow() {
  running.value = true;
  try {
    const res: any = await runExpiryCheck(true);
    if (res?.skipped) message.warning(res.reason || '已跳过');
    else message.success(`检查 ${res.checked} 个域名，发送 ${res.sent} 条提醒`);
    await load();
  } finally {
    running.value = false;
  }
}

const TYPE_META: Record<string, { label: string; color: string }> = {
  email: { label: '邮件', color: 'blue' },
  telegram: { label: 'Telegram', color: 'cyan' },
  wecom: { label: '企业微信', color: 'green' },
  bark: { label: 'Bark', color: 'purple' },
  feishu: { label: '飞书', color: 'geekblue' },
  dingtalk: { label: '钉钉', color: 'orange' },
  webhook: { label: 'Webhook', color: 'default' },
};

const logColumns = [
  { title: '时间', key: 'ts', width: 150 },
  { title: '渠道', key: 'channel', width: 160 },
  { title: '类型', key: 'type', width: 110 },
  { title: '结果', key: 'ok', width: 90 },
  { title: '域名', key: 'domain', width: 180 },
  { title: '说明', key: 'message' },
];

const nextRun = computed(() => {
  if (!lastCheckAt.value) return '尚未运行';
  return `${dayjs(lastCheckAt.value).format('MM-DD HH:mm')} 检查过`;
});
</script>

<template>
  <Page
    description="域名到期前自动推送，渠道可叠加，提醒节点可自定义"
    title="通知与提醒"
  >
    <template #extra>
      <Button v-if="can('settings:write')" :loading="running" @click="runNow"
        >立即检查</Button
      >
      <Button v-if="can('settings:write')" type="primary" @click="openCreate()"
        >添加渠道</Button
      >
    </template>

    <div class="space-y-4">
      <Card :bordered="true">
        <div class="flex flex-wrap items-center gap-6">
          <div class="flex items-center gap-3">
            <Switch
              :disabled="!can('settings:write')"
              :checked="enabled"
              :loading="saving"
              @change="(v: any) => toggleEnabled(Boolean(v))"
            />
            <div>
              <div class="text-[13px] font-medium text-slate-800">
                {{ enabled ? '到期提醒已开启' : '到期提醒已关闭' }}
              </div>
              <div class="text-xs text-slate-400">
                后台每 30
                分钟检查一次，命中节点才会发送，同一域名同一节点只发一次
              </div>
            </div>
          </div>
          <div class="flex items-center gap-2">
            <span class="text-xs text-slate-500">提醒节点</span>
            <Select
              :value="expiryDays"
              :disabled="!can('settings:write')"
              mode="tags"
              style="min-width: 240px"
              :options="
                [30, 14, 7, 3, 1].map((d) => ({
                  label: `提前 ${d} 天`,
                  value: d,
                }))
              "
              @change="
                (value) =>
                  updateDays(
                    Array.isArray(value)
                      ? value.map(Number).filter(Number.isFinite)
                      : [],
                  )
              "
            >
              <template #tagRender="{ value, closable, onClose }">
                <Tag
                  :closable="closable"
                  class="mr-1"
                  color="blue"
                  @close="onClose"
                  >{{ value }} 天</Tag
                >
              </template>
            </Select>
          </div>
          <div class="text-xs text-slate-400">
            {{ nextRun }}
            <template v-if="lastResult?.sent">
              · 上次发送 {{ lastResult.sent }} 条</template
            >
          </div>
        </div>
        <Alert
          v-if="!channels.length"
          class="mt-3"
          message="还没有配置通知渠道，到期提醒不会送达。点右上角「添加渠道」先配一个。"
          show-icon
          type="warning"
        />
      </Card>

      <div class="grid grid-cols-1 gap-3 xl:grid-cols-2">
        <Card
          v-for="channel in channels"
          :key="channel.id"
          :bordered="true"
          class="channel-card"
        >
          <div class="flex items-start gap-3">
            <div class="ch-icon">
              {{ (TYPE_META[channel.type]?.label || channel.type).slice(0, 1) }}
            </div>
            <div class="min-w-0 flex-1">
              <div class="flex flex-wrap items-center gap-1.5">
                <span class="text-[13.5px] font-medium text-slate-800">{{
                  channel.name
                }}</span>
                <Tag
                  class="mr-0"
                  :color="TYPE_META[channel.type]?.color || 'default'"
                >
                  {{ TYPE_META[channel.type]?.label || channel.type }}
                </Tag>
              </div>
              <div class="mt-1 truncate text-xs text-slate-400">
                <template v-if="channel.type === 'email'"
                  >{{ channel.config.host }} → {{ channel.config.to }}</template
                >
                <template v-else-if="channel.type === 'telegram'"
                  >chat {{ channel.config.chatId }}</template
                >
                <template v-else-if="channel.type === 'bark'"
                  >{{ channel.config.server }} ·
                  {{ channel.config.group }}</template
                >
                <template v-else>{{
                  channel.config.webhook || channel.config.url
                }}</template>
              </div>
            </div>
            <Switch
              :disabled="!can('settings:write')"
              :checked="channel.enabled"
              size="small"
              @change="(v: any) => toggleChannel(channel, Boolean(v))"
            />
          </div>
          <div
            class="mt-3 flex items-center gap-1 border-t border-slate-100 pt-2"
          >
            <Button
              v-if="can('settings:write')"
              size="small"
              type="link"
              :loading="testing[channel.id]"
              @click="runTest(channel)"
              >发送测试</Button
            >
            <Button
              v-if="can('settings:write')"
              size="small"
              type="link"
              @click="openEdit(channel)"
              >编辑</Button
            >
            <div class="flex-1"></div>
            <Popconfirm
              v-if="can('settings:write')"
              title="删除该渠道？"
              ok-text="删除"
              cancel-text="取消"
              @confirm="removeChannel(channel)"
            >
              <Button size="small" type="link" danger>删除</Button>
            </Popconfirm>
          </div>
        </Card>

        <button
          v-if="can('settings:write')"
          class="channel-add"
          :class="{ 'xl:col-span-2': !channels.length }"
          @click="openCreate()"
        >
          <span class="text-2xl leading-none text-slate-300">＋</span>
          <span class="text-sm text-slate-500">添加通知渠道</span>
          <span class="text-xs text-slate-400"
            >邮件 · Telegram · 企业微信 · Bark · 飞书 · 钉钉 · Webhook</span
          >
        </button>
      </div>

      <Card :bordered="true" title="发送记录">
        <Table
          :columns="logColumns"
          :data-source="log"
          :pagination="{ pageSize: 10 }"
          row-key="ts"
          size="small"
        >
          <template #bodyCell="{ column, record }">
            <template v-if="column.key === 'ts'">
              <span class="text-xs text-slate-500">{{
                dayjs(record.ts).format('MM-DD HH:mm:ss')
              }}</span>
            </template>
            <template v-else-if="column.key === 'channel'">
              <span class="text-xs text-slate-600">{{ record.channel }}</span>
            </template>
            <template v-else-if="column.key === 'type'">
              <Tag
                class="mr-0"
                :color="TYPE_META[record.type]?.color || 'default'"
              >
                {{ TYPE_META[record.type]?.label || record.type }}
              </Tag>
            </template>
            <template v-else-if="column.key === 'ok'">
              <Tag class="mr-0" :color="record.ok ? 'green' : 'red'">{{
                record.ok ? '成功' : '失败'
              }}</Tag>
            </template>
            <template v-else-if="column.key === 'domain'">
              <span class="font-mono text-xs">{{ record.domain || '—' }}</span>
            </template>
            <template v-else-if="column.key === 'message'">
              <Tooltip :title="record.message">
                <span
                  class="block truncate text-xs text-slate-500"
                  style="max-width: 380px"
                  >{{ record.message }}</span
                >
              </Tooltip>
            </template>
          </template>
        </Table>
      </Card>
    </div>

    <Modal
      v-model:open="modalOpen"
      :confirm-loading="saving"
      :title="editingId ? '编辑通知渠道' : '添加通知渠道'"
      ok-text="保存"
      width="600px"
      @ok="saveChannel"
    >
      <div class="grid grid-cols-2 gap-3 pt-2">
        <div class="col-span-2">
          <div class="mb-1 text-xs text-slate-500">渠道类型</div>
          <Select
            v-model:value="form.type"
            :disabled="Boolean(editingId)"
            style="width: 100%"
            :options="
              channelTypes.map((t) => ({ label: t.label, value: t.type }))
            "
            @change="(value) => typeof value === 'string' && switchType(value)"
          />
          <div class="mt-1 text-xs text-slate-400">{{ activeType?.desc }}</div>
        </div>
        <div class="col-span-2">
          <div class="mb-1 text-xs text-slate-500">名称</div>
          <Input
            v-model:value="form.name"
            placeholder="例如：到期提醒-运维群"
          />
        </div>

        <div
          v-for="field in activeType?.fields || []"
          :key="field.key"
          class="col-span-2"
        >
          <div class="mb-1 text-xs text-slate-500">{{ field.label }}</div>
          <div v-if="field.kind === 'switch'" class="flex h-8 items-center">
            <Switch v-model:checked="form.config[field.key]" />
            <span class="ml-2 text-xs text-slate-500">{{
              form.config[field.key] ? '开启' : '关闭'
            }}</span>
          </div>
          <InputNumber
            v-else-if="field.key === 'port'"
            v-model:value="form.config[field.key]"
            :min="1"
            :max="65_535"
            style="width: 100%"
          />
          <Input.TextArea
            v-else-if="field.kind === 'textarea'"
            v-model:value="form.config[field.key]"
            :rows="3"
            class="font-mono"
            :placeholder="field.placeholder || ''"
          />
          <Input
            v-else
            v-model:value="form.config[field.key]"
            :type="field.secret ? 'password' : 'text'"
            :placeholder="field.placeholder || ''"
            class="font-mono"
          />
        </div>

        <div
          v-if="activeType?.help"
          class="col-span-2 rounded bg-slate-50 px-3 py-2 text-xs text-slate-500"
        >
          {{ activeType.help }}
        </div>
        <div
          class="col-span-2 flex items-center gap-2 border-t border-slate-100 pt-2"
        >
          <Switch v-model:checked="form.enabled" size="small" />
          <span class="text-sm text-slate-600">启用该渠道</span>
        </div>
      </div>
    </Modal>
  </Page>
</template>

<style scoped>
.channel-card :deep(.ant-card-body) {
  padding: 14px 16px 8px;
}

.ch-icon {
  display: grid;
  flex-shrink: 0;
  place-items: center;
  width: 34px;
  height: 34px;
  font-size: 14px;
  font-weight: 600;
  color: #1d4ed8;
  background: #eff6ff;
  border-radius: 9px;
}

.channel-add {
  display: flex;
  flex-direction: column;
  gap: 4px;
  align-items: center;
  justify-content: center;
  min-height: 132px;
  cursor: pointer;
  background: #fcfcfd;
  border: 1px dashed #d7dbe3;
  border-radius: 8px;
}

.channel-add:hover {
  background: #f8fafc;
  border-color: #94a3b8;
}
</style>
