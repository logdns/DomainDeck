<script lang="ts" setup>
import { computed, onMounted, reactive, ref } from 'vue';

import Page from '#/components/deck-page.vue';
import { usePermissions } from '#/composables/use-permissions';

import {
  Button,
  Card,
  Empty,
  Input,
  message,
  Modal,
  Popconfirm,
  Select,
  Switch,
  Tag,
  Textarea,
  Tooltip,
} from 'ant-design-vue';
import dayjs from 'dayjs';

import type { ConnectionItem, ProviderMeta } from '#/api/domaindeck';
import {
  createConnection,
  deleteConnection,
  deleteCustomProvider,
  getConnections,
  getCustomProvider,
  getProviderPresets,
  getProviders,
  saveCustomProvider,
  validateCustomProvider,
  setDefaultConnection,
  testConnection,
  syncConnection,
  syncRegistrarDomains,
  updateConnection,
} from '#/api/domaindeck';

const { can } = usePermissions();
const loading = ref(false);
const providers = ref<ProviderMeta[]>([]);
const connections = ref<ConnectionItem[]>([]);
const testing = ref<Record<string, boolean>>({});

const modalOpen = ref(false);
const saving = ref(false);
const editingId = ref<null | string>(null);
const form = reactive<any>({
  provider: 'spaceship',
  name: '',
  enabled: true,
  roles: ['registrar'],
  isDefault: false,
  credentials: {} as Record<string, string>,
});

const activeProvider = computed<ProviderMeta | undefined>(() =>
  providers.value.find((p) => p.id === form.provider),
);

const ROLE_LABEL: Record<string, string> = {
  registrar: '域名注册商',
  dns: 'DNS 解析',
};

/* ---------------- 自定义注册商（运行时添加，不改代码） ---------------- */
const presets = ref<any[]>([]);
const manifestOpen = ref(false);
const manifestText = ref('');
const manifestSaving = ref(false);
const manifestValidated = ref<null | { name: string; ops: string[] }>(null);

// 来自内置模板的注册商已经在上面的「支持的服务商」里列出，这里只留用户自己写的
const customProviders = computed(() =>
  providers.value.filter((p) => !p.builtin && !p.preset),
);

async function loadPresets() {
  const res: any = await getProviderPresets().catch(() => ({ items: [] }));
  presets.value = res.items || [];
}

function openManifest(preset?: any) {
  manifestValidated.value = null;
  if (preset) {
    manifestText.value = JSON.stringify(preset, null, 2);
  } else {
    manifestText.value = JSON.stringify(
      {
        id: 'my-registrar',
        name: '我的注册商',
        vendor: '',
        docs: '',
        hint: '在服务商后台生成 API Key 后填入。',
        roles: ['registrar'],
        capabilities: {
          registrar: true,
          dns: false,
          register: false,
          renew: true,
        },
        fields: [{ key: 'apiKey', label: 'API Key', required: true }],
        request: {
          baseUrl: 'https://api.example.com/v1',
          format: 'json',
          auth: { type: 'header', map: { Authorization: 'Bearer {apiKey}' } },
        },
        ops: {
          test: { method: 'GET', path: '/account' },
          listDomains: {
            method: 'GET',
            path: '/domains',
            itemsPath: 'data',
            map: { name: 'domain', expirationDate: 'expires_at' },
          },
        },
      },
      null,
      2,
    );
  }
  manifestOpen.value = true;
}

function parseManifest() {
  try {
    return JSON.parse(manifestText.value);
  } catch (err: any) {
    message.error(`JSON 语法错误：${err.message}`);
    return null;
  }
}

async function validateManifest() {
  const body = parseManifest();
  if (!body) return;
  try {
    const res: any = await validateCustomProvider(body);
    manifestValidated.value = { name: res.provider?.name, ops: res.ops || [] };
    message.success(
      `校验通过：${res.provider?.name}，${(res.ops || []).length} 个操作`,
    );
  } catch (err: any) {
    manifestValidated.value = null;
    message.error(err?.message || '校验失败');
  }
}

async function saveManifest() {
  const body = parseManifest();
  if (!body) return;
  manifestSaving.value = true;
  try {
    await saveCustomProvider(body);
    message.success(`已保存「${body.name}」，现在可以在添加接入里选择它`);
    manifestOpen.value = false;
    await load();
  } catch (err: any) {
    message.error(err?.message || '保存失败');
  } finally {
    manifestSaving.value = false;
  }
}

async function editCustom(p: any) {
  try {
    const res: any = await getCustomProvider(p.id);
    openManifest(res);
  } catch (err: any) {
    message.error(err?.message || '读取配置失败');
  }
}

async function removeCustom(p: any) {
  try {
    await deleteCustomProvider(p.id);
    message.success(`已删除「${p.name}」`);
    await load();
  } catch (err: any) {
    message.error(err?.message || '删除失败');
  }
}

async function load() {
  loading.value = true;
  try {
    loadPresets();
    const [pRes, cRes] = await Promise.allSettled([
      getProviders(),
      getConnections(),
    ]);
    if (pRes.status === 'fulfilled')
      providers.value = (pRes.value as any).items || [];
    if (cRes.status === 'fulfilled')
      connections.value = (cRes.value as any).items || [];
  } finally {
    loading.value = false;
  }
}

onMounted(load);

function providerOf(id: string) {
  return providers.value.find((p) => p.id === id);
}

function openCreate(providerId?: string) {
  editingId.value = null;
  const p = providerOf(providerId || providers.value[0]?.id || 'spaceship');
  form.provider = p?.id || 'spaceship';
  form.name = p?.name || '';
  form.enabled = true;
  form.roles = [...(p?.roles || ['registrar'])];
  form.isDefault = connections.value.length === 0;
  form.credentials = {};
  (p?.fields || []).forEach((f) => {
    form.credentials[f.key] = f.default ?? '';
  });
  modalOpen.value = true;
}

function openEdit(conn: ConnectionItem) {
  editingId.value = conn.id;
  form.provider = conn.provider;
  form.name = conn.name;
  form.enabled = conn.enabled;
  form.roles = [...conn.roles];
  form.isDefault = conn.isDefault;
  form.credentials = { ...conn.credentials };
  modalOpen.value = true;
}

function switchProvider(value: string) {
  const p = providerOf(value);
  if (!p) return;
  form.roles = [...p.roles];
  form.credentials = {};
  p.fields.forEach((f) => {
    form.credentials[f.key] = f.default ?? '';
  });
  if (!form.name || providers.value.some((x) => x.name === form.name))
    form.name = p.name;
}

async function save() {
  if (!form.name) {
    message.warning('请填写接入名称');
    return;
  }
  saving.value = true;
  try {
    const payload = {
      provider: form.provider,
      name: form.name,
      enabled: form.enabled,
      roles: form.roles,
      isDefault: form.isDefault,
      credentials: form.credentials,
    };
    if (editingId.value) await updateConnection(editingId.value, payload);
    else await createConnection(payload);
    message.success(editingId.value ? '接入已更新' : '接入已添加');
    modalOpen.value = false;
    await load();
  } finally {
    saving.value = false;
  }
}

async function runTest(conn: ConnectionItem) {
  testing.value = { ...testing.value, [conn.id]: true };
  try {
    const res: any = await testConnection(conn.id);
    if (res?.ok) message.success(`${conn.name}：${res.message}`);
    else message.warning(`${conn.name}：${res.message || '连接失败'}`);
    await load();
  } finally {
    const next = { ...testing.value };
    delete next[conn.id];
    testing.value = next;
  }
}

async function makeDefault(conn: ConnectionItem) {
  await setDefaultConnection(conn.id);
  message.success(`已将「${conn.name}」设为默认注册商`);
  load();
}

async function synchronize(conn: ConnectionItem) {
  testing.value[conn.id] = true;
  try {
    const result: any = await syncConnection(conn.id);
    message.success(`已同步 ${result.domains} 个域名`);
  } finally { testing.value[conn.id] = false; }
}

async function synchronizeRegistrations(conn: ConnectionItem) {
  testing.value[conn.id] = true;
  try {
    const result: any = await syncRegistrarDomains(conn.id);
    message.success(`已同步 ${result.length} 个注册域名`);
  } finally { testing.value[conn.id] = false; }
}

async function toggleEnabled(conn: ConnectionItem, enabled: boolean) {
  try {
    await updateConnection(conn.id, { enabled });
    conn.enabled = enabled;
    message.success(`${conn.name} 已${enabled ? '启用' : '停用'}`);
    load();
  } catch {
    conn.enabled = !enabled;
  }
}

async function remove(conn: ConnectionItem) {
  await deleteConnection(conn.id);
  message.success('接入已删除');
  load();
}

const CAP_LABEL: Array<{ key: string; label: string }> = [
  { key: 'register', label: '注册' },
  { key: 'renew', label: '续费' },
  { key: 'transfer', label: '转入' },
  { key: 'authCode', label: '授权码' },
  { key: 'nameservers', label: '改 NS' },
  { key: 'dns', label: '解析' },
  { key: 'payments', label: '支付方式' },
  { key: 'invoices', label: '账单' },
];
</script>

<template>
  <Page
    description="注册商与 DNS 服务商接入；每家都给出凭据获取路径与开通步骤"
    title="注册商与接入"
  >
    <template #extra>
      <Button :loading="loading" @click="load">刷新</Button>
      <Button v-if="can('settings:write')" type="primary" @click="openCreate()"
        >添加接入</Button
      >
    </template>

    <div class="space-y-4">
      <div
        v-if="connections.length"
        class="grid grid-cols-1 gap-3 xl:grid-cols-2"
      >
        <Card
          v-for="conn in connections"
          :key="conn.id"
          :bordered="true"
          class="conn-card"
        >
          <div class="flex items-start gap-3">
            <div class="prov-logo" :class="conn.provider">
              {{
                (providerOf(conn.provider)?.name || conn.provider).slice(0, 1)
              }}
            </div>
            <div class="min-w-0 flex-1">
              <div class="flex flex-wrap items-center gap-1.5">
                <span class="text-[14px] font-medium text-slate-800">{{
                  conn.name
                }}</span>
                <Tag class="mr-0" color="default">{{
                  providerOf(conn.provider)?.name || conn.provider
                }}</Tag>
                <Tag
                  v-if="conn.isDefault && conn.roles.includes('registrar')"
                  class="mr-0"
                  color="blue"
                  >默认注册商</Tag
                >
                <Tag v-if="!conn.enabled" class="mr-0">已停用</Tag>
              </div>
              <div class="mt-1 flex flex-wrap items-center gap-1">
                <span
                  v-for="role in conn.roles"
                  :key="role"
                  class="role-chip"
                  >{{ ROLE_LABEL[role] || role }}</span
                >
                <span class="text-xs text-slate-400">
                  {{
                    conn.credentials?.accountId
                      ? `账户 ${conn.credentials.accountId}`
                      : ''
                  }}
                </span>
              </div>
              <div class="mt-2 text-xs">
                <span v-if="!conn.lastTestAt" class="text-slate-400"
                  >尚未测试连接</span
                >
                <span
                  v-else
                  :class="conn.lastTestOk ? 'text-emerald-600' : 'text-red-600'"
                >
                  {{ conn.lastTestOk ? '连接正常' : '连接失败' }} ·
                  {{ dayjs(conn.lastTestAt).format('MM-DD HH:mm') }}
                  <Tooltip
                    v-if="!conn.lastTestOk"
                    :title="conn.lastTestMessage"
                  >
                    <span class="cursor-help text-slate-400">原因</span>
                  </Tooltip>
                </span>
              </div>
            </div>
            <Switch
              :disabled="!can('settings:write')"
              :checked="conn.enabled"
              size="small"
              @change="(v: any) => toggleEnabled(conn, Boolean(v))"
            />
          </div>

          <div
            class="mt-3 flex flex-wrap items-center gap-1 border-t border-slate-100 pt-2"
          >
            <Button
              size="small"
              type="link"
              :loading="testing[conn.id]"
              @click="runTest(conn)"
              >测试连接</Button
            >
            <Button v-if="can('settings:write')" size="small" type="link" :loading="testing[conn.id]" @click="synchronize(conn)">同步域名</Button>
            <Button v-if="can('settings:write') && conn.provider === 'cloudflare' && conn.roles.includes('registrar')" size="small" type="link" :loading="testing[conn.id]" @click="synchronizeRegistrations(conn)">同步注册域名</Button>
            <Button
              v-if="can('settings:write')"
              size="small"
              type="link"
              @click="openEdit(conn)"
              >编辑</Button
            >
            <Button
              v-if="conn.roles.includes('registrar') && !conn.isDefault"
              size="small"
              type="link"
              :disabled="!conn.enabled || !can('settings:write')"
              @click="makeDefault(conn)"
            >
              设为默认
            </Button>
            <div class="flex-1"></div>
            <Popconfirm
              v-if="can('settings:write')"
              title="删除该接入？已接入的域名不会失去注册，只是不再显示在这里。"
              ok-text="删除"
              cancel-text="取消"
              @confirm="remove(conn)"
            >
              <Button size="small" type="link" danger>删除</Button>
            </Popconfirm>
          </div>
        </Card>
      </div>

      <Card v-else :bordered="true">
        <Empty
          :image="Empty.PRESENTED_IMAGE_SIMPLE"
          description="还没有接入任何服务商"
        >
          <Button
            v-if="can('settings:write')"
            type="primary"
            @click="openCreate()"
            >添加第一个接入</Button
          >
        </Empty>
      </Card>

      <Card :bordered="true" title="支持的服务商">
        <div class="grid grid-cols-1 gap-3 lg:grid-cols-2">
          <div v-for="p in providers" :key="p.id" class="provider-box">
            <div class="flex items-start justify-between gap-2">
              <div>
                <div class="flex items-center gap-1.5">
                  <span class="text-[13px] font-medium text-slate-800">{{
                    p.name
                  }}</span>
                  <Tag v-if="!p.builtin" class="mr-0" color="blue">{{
                    p.preset ? '模板' : '自定义'
                  }}</Tag>
                </div>
                <div class="text-xs text-slate-400">{{ p.vendor }}</div>
              </div>
              <a
                v-if="p.docs"
                class="text-xs text-blue-600"
                :href="p.docs"
                target="_blank"
                rel="noreferrer"
                >API 文档 ↗</a
              >
            </div>
            <div class="mt-2 flex flex-wrap gap-1">
              <span
                v-for="cap in CAP_LABEL"
                :key="cap.key"
                class="cap-chip"
                :class="{ on: (p.capabilities as any)[cap.key] }"
              >
                {{ cap.label }}
              </span>
            </div>
            <div class="mt-2 text-xs leading-relaxed text-slate-400">
              {{ p.hint }}
            </div>
            <div class="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
              <Button
                v-if="can('settings:write')"
                size="small"
                @click="openCreate(p.id)"
                >添加该服务商</Button
              >
              <Button
                v-if="!p.builtin && can('settings:write')"
                size="small"
                type="link"
                @click="editCustom(p)"
                >编辑配置</Button
              >
              <a
                v-if="p.credentialsUrl"
                class="text-xs text-blue-600"
                :href="p.credentialsUrl"
                target="_blank"
                rel="noreferrer"
              >
                获取凭据 ↗
              </a>
            </div>
          </div>
        </div>
      </Card>

      <Card :bordered="true">
        <template #title>
          <div class="flex items-center gap-2">
            自定义注册商
            <Tag class="mr-0" color="blue">运行时添加</Tag>
          </div>
        </template>
        <template #extra>
          <div class="flex items-center gap-2">
            <Select
              :value="undefined"
              size="small"
              placeholder="从模板开始"
              style="width: 150px"
              :options="presets.map((p) => ({ label: p.name, value: p.id }))"
              :disabled="!can('settings:write')"
              @change="
                (id: any) => openManifest(presets.find((x) => x.id === id))
              "
            />
            <Button
              v-if="can('settings:write')"
              size="small"
              type="primary"
              @click="openManifest()"
              >自己写配置</Button
            >
          </div>
        </template>

        <div class="text-xs leading-relaxed text-slate-500">
          用一份 JSON
          描述「怎么发请求、怎么取字段」，保存后立即出现在上面的服务商列表和「添加接入」下拉框里，<strong>不需要改代码、不需要重启</strong>。
        </div>

        <div v-if="customProviders.length" class="mt-3 space-y-2">
          <div
            v-for="p in customProviders"
            :key="p.id"
            class="flex items-center justify-between gap-3 rounded border border-slate-200 px-3 py-2"
          >
            <div class="min-w-0">
              <div class="flex items-center gap-2">
                <span class="text-[13px] font-medium text-slate-800">{{
                  p.name
                }}</span>
                <span class="font-mono text-[11px] text-slate-400">{{
                  p.id
                }}</span>
                <span v-if="p.preset" class="text-[11px] text-slate-400"
                  >来自 {{ p.preset }} 模板</span
                >
              </div>
              <div class="mt-0.5 flex flex-wrap gap-1">
                <span
                  v-for="cap in CAP_LABEL"
                  :key="cap.key"
                  class="cap-chip"
                  :class="{ on: (p.capabilities as any)[cap.key] }"
                >
                  {{ cap.label }}
                </span>
              </div>
            </div>
            <div class="flex flex-none items-center gap-1">
              <Button
                v-if="can('settings:write')"
                size="small"
                @click="openCreate(p.id)"
                >添加接入</Button
              >
              <Button
                v-if="can('settings:write')"
                size="small"
                @click="editCustom(p)"
                >编辑</Button
              >
              <Popconfirm
                v-if="can('settings:write')"
                title="删除这个自定义注册商？"
                ok-text="删除"
                cancel-text="取消"
                @confirm="removeCustom(p)"
              >
                <Button size="small" type="link" danger>删除</Button>
              </Popconfirm>
            </div>
          </div>
        </div>

        <div
          v-else
          class="mt-3 rounded border border-dashed border-slate-200 px-4 py-6 text-center text-xs text-slate-400"
        >
          还没有自定义注册商。选一个模板（Porkbun / GoDaddy /
          Namecheap）改改就能用；
          已启用的模板会出现在上面的「支持的服务商」里，可点「编辑配置」调整。
        </div>

        <div
          class="mt-3 rounded border border-slate-200 bg-slate-50 px-4 py-3 text-[11.5px] leading-relaxed text-slate-500"
        >
          配置写在
          <code class="rounded bg-white px-1 font-mono"
            >data/providers/*.json</code
          >，也可以直接放进该目录，重启即生效。 内置的 Spaceship / Cloudflare
          因为要处理异步任务与特殊签名，仍然走代码实现；其余标准 REST
          注册商都可以用配置描述。
        </div>
      </Card>
    </div>

    <Modal
      v-model:open="manifestOpen"
      :confirm-loading="manifestSaving"
      :title="'自定义注册商配置'"
      ok-text="保存"
      cancel-text="取消"
      width="820px"
      @ok="saveManifest"
    >
      <div class="pt-1">
        <div class="mb-2 flex items-center justify-between">
          <div class="text-xs text-slate-500">
            保存后立即生效。字段含义见
            <a
              class="text-blue-600"
              href="https://docs.spaceship.dev/"
              target="_blank"
              rel="noreferrer"
              >README 的「声明式接入」</a
            >。
          </div>
          <div class="flex items-center gap-2">
            <Tag v-if="manifestValidated" color="green" class="mr-0">
              {{ manifestValidated.name }} ·
              {{ manifestValidated.ops.length }} 个操作
            </Tag>
            <Button size="small" @click="validateManifest">校验</Button>
          </div>
        </div>
        <Textarea
          v-model:value="manifestText"
          :rows="20"
          class="manifest-editor"
          spellcheck="false"
        />
      </div>
    </Modal>

    <Modal
      v-model:open="modalOpen"
      :confirm-loading="saving"
      :title="editingId ? '编辑接入' : '添加接入'"
      ok-text="保存"
      width="620px"
      @ok="save"
    >
      <div class="grid grid-cols-2 gap-3 pt-2">
        <div class="col-span-2">
          <div class="mb-1 text-xs text-slate-500">服务商</div>
          <Select
            v-model:value="form.provider"
            :disabled="Boolean(editingId)"
            style="width: 100%"
            :options="providers.map((p) => ({ label: p.name, value: p.id }))"
            @change="
              (value) => typeof value === 'string' && switchProvider(value)
            "
          />
        </div>
        <div class="col-span-2">
          <div class="mb-1 text-xs text-slate-500">接入名称</div>
          <Input
            v-model:value="form.name"
            placeholder="例如：Spaceship 主账户"
          />
        </div>

        <div class="col-span-2">
          <div class="mb-1 text-xs text-slate-500">用途</div>
          <div class="flex gap-2">
            <label
              v-for="role in activeProvider?.roles || []"
              :key="role"
              class="role-option"
              :class="{ active: form.roles.includes(role) }"
            >
              <input
                v-model="form.roles"
                type="checkbox"
                :value="role"
                class="hidden"
              />
              <span>{{ ROLE_LABEL[role] || role }}</span>
            </label>
          </div>
          <div class="mt-1 text-xs text-slate-400">
            注册商负责注册/续费/转移，DNS 负责解析；同一账户可同时承担两种用途。
          </div>
        </div>

        <details
          v-if="activeProvider?.setup?.length"
          :key="activeProvider.id"
          open
          class="col-span-2 rounded border border-slate-200 bg-slate-50 px-3 py-2"
        >
          <summary
            class="flex cursor-pointer flex-wrap items-center justify-between gap-2 text-xs text-slate-600"
          >
            <span>
              <span class="font-medium text-slate-700"
                >凭据获取与权限设置（请先阅读）</span
              >
              <span class="ml-1 text-slate-400"
                >{{ activeProvider.setup.length }} 步</span
              >
            </span>
            <a
              v-if="activeProvider.credentialsUrl"
              class="text-blue-600"
              :href="activeProvider.credentialsUrl"
              target="_blank"
              rel="noreferrer"
              @click.stop
            >
              打开 {{ activeProvider.name }} 密钥页 ↗
            </a>
          </summary>
          <div class="my-3 flex flex-wrap gap-3 text-sm">
            <a
              v-if="activeProvider.docs"
              :href="activeProvider.docs"
              target="_blank"
              rel="noopener noreferrer"
              >{{ activeProvider.name }} 官方 API 文档 ↗</a
            >
            <span class="text-amber-700">{{ activeProvider.hint }}</span>
          </div>
          <ol class="setup-list">
            <li v-for="(step, i) in activeProvider.setup" :key="i">
              <span class="setup-idx">{{
                String(i + 1).padStart(2, '0')
              }}</span>
              <div>
                <div class="setup-title">
                  {{ step.title }}
                  <a
                    v-if="step.url"
                    :href="step.url"
                    class="ml-1 text-blue-600"
                    target="_blank"
                    rel="noreferrer"
                    >↗</a
                  >
                </div>
                <div v-if="step.detail" class="setup-detail">
                  {{ step.detail }}
                </div>
              </div>
            </li>
          </ol>
        </details>

        <div
          v-for="field in activeProvider?.fields || []"
          :key="field.key"
          class="col-span-2"
        >
          <div class="mb-1 flex items-center justify-between">
            <span class="text-xs text-slate-500">{{ field.label }}</span>
            <a
              v-if="field.url"
              class="text-xs text-blue-600"
              :href="field.url"
              target="_blank"
              rel="noreferrer"
            >
              去哪拿 ↗
            </a>
          </div>
          <Input
            v-if="field.kind !== 'textarea'"
            v-model:value="form.credentials[field.key]"
            :type="field.secret ? 'password' : 'text'"
            :placeholder="field.placeholder || ''"
            class="font-mono"
          />
          <Input.TextArea
            v-else
            v-model:value="form.credentials[field.key]"
            :rows="3"
            class="font-mono"
          />
          <div
            v-if="field.help"
            class="mt-1 text-xs leading-relaxed text-slate-400"
          >
            {{ field.help }}
          </div>
        </div>

        <div
          class="col-span-2 flex items-center gap-6 border-t border-slate-100 pt-2"
        >
          <label class="flex items-center gap-2 text-sm text-slate-600">
            <Switch v-model:checked="form.enabled" size="small" /> 启用
          </label>
          <label class="flex items-center gap-2 text-sm text-slate-600">
            <Switch v-model:checked="form.isDefault" size="small" />
            设为默认注册商
          </label>
        </div>
        <div
          v-if="activeProvider"
          class="col-span-2 text-xs leading-relaxed text-slate-400"
        >
          {{ activeProvider.hint }}
        </div>
      </div>
    </Modal>
  </Page>
</template>

<style scoped>
.setup-list {
  padding: 0;
  margin: 8px 0 0;
  list-style: none;
}

.setup-list li {
  display: flex;
  gap: 8px;
  align-items: flex-start;
  padding: 3px 0;
}

.setup-idx {
  flex-shrink: 0;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 11px;
  line-height: 1.7;
  color: #94a3b8;
}

.setup-title {
  font-size: 12.5px;
  line-height: 1.7;
  color: #334155;
}

.setup-detail {
  font-size: 12px;
  line-height: 1.7;
  color: #64748b;
}

.manifest-editor :deep(textarea) {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px;
  line-height: 1.7;
}

.conn-card :deep(.ant-card-body) {
  padding: 14px 16px 8px;
}

.prov-logo {
  display: grid;
  flex-shrink: 0;
  place-items: center;
  width: 36px;
  height: 36px;
  font-size: 15px;
  font-weight: 600;
  color: #1d4ed8;
  background: #eff6ff;
  border-radius: 9px;
}

.prov-logo.cloudflare {
  color: #b45309;
  background: #fff7ed;
}

.role-chip {
  padding: 1px 6px;
  font-size: 11px;
  color: #475569;
  background: #f1f5f9;
  border-radius: 4px;
}

.provider-box {
  padding: 12px 14px;
  border: 1px solid #e6e8ee;
  border-radius: 8px;
}

.cap-chip {
  padding: 1px 6px;
  font-size: 11px;
  color: #cbd5e1;
  background: #f8fafc;
  border: 1px solid #eef1f6;
  border-radius: 4px;
}

.cap-chip.on {
  color: #1d4ed8;
  background: #eff6ff;
  border-color: #dbeafe;
}

.role-option {
  display: inline-flex;
  align-items: center;
  padding: 5px 12px;
  font-size: 13px;
  color: #64748b;
  cursor: pointer;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
}

.role-option.active {
  color: #1d4ed8;
  background: #eff6ff;
  border-color: #bfdbfe;
}

.hidden {
  display: none;
}
</style>
