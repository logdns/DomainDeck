<script lang="ts" setup>
import { computed, onMounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';

import Page from '#/components/deck-page.vue';
import { usePermissions } from '#/composables/use-permissions';
import { useAuthStore } from '#/store';

import {
  Alert,
  Button,
  Card,
  Input,
  message,
  Popconfirm,
  Switch,
  Table,
  Tag,
} from 'ant-design-vue';
import dayjs from 'dayjs';

import {
  applyUpdate,
  changePassword,
  checkUpdate,
  getAudit,
  getConnections,
  getSettings,
  getSystemStatus,
  getUpdateInfo,
  saveSettings,
} from '#/api/domaindeck';

const router = useRouter();
const authStore = useAuthStore();
const { can } = usePermissions();
const loading = ref(false);
const saving = ref(false);
const audit = ref<any[]>([]);
const connections = ref<any[]>([]);
const confirmBilling = ref(false);
const status = ref<any>(null);

/* ---------------- 版本与更新 ---------------- */
const updState = ref<any>(null);
const updBusy = ref(false);
const applying = ref(false);

async function loadUpdate() {
  updState.value = await getUpdateInfo().catch(() => null);
}

async function doCheck() {
  updBusy.value = true;
  try {
    const res: any = await checkUpdate();
    updState.value = {
      ...(updState.value || {}),
      latest: res.latest,
      hasUpdate: res.hasUpdate,
      installSupported: res.installSupported,
      checkedAt: res.checkedAt,
      error: null,
    };
    if (res.hasUpdate) message.success(`发现新版本 ${res.latest.version}`);
    else message.info('当前已是最新版本');
  } catch (error: any) {
    message.error(error?.message || '检查更新失败');
    await loadUpdate();
  } finally {
    updBusy.value = false;
  }
}

async function doApply() {
  applying.value = true;
  try {
    const res: any = await applyUpdate({
      version: updState.value?.latest?.version,
    });
    message.success(
      res.restarting
        ? `已更新到 ${res.version}，服务正在重启…`
        : `已更新到 ${res.version}，请手动重启服务`,
    );
    if (res.restarting) setTimeout(() => location.reload(), 4500);
  } catch (error: any) {
    message.error(error?.message || '更新失败');
  } finally {
    applying.value = false;
  }
}

function fmtSize(n?: number) {
  if (!n) return '—';
  return n > 1024 * 1024
    ? `${(n / 1024 / 1024).toFixed(1)} MB`
    : `${Math.round(n / 1024)} KB`;
}

const form = reactive<any>({
  contacts: { registrant: '', admin: '', tech: '', billing: '' },
  safety: { billingEnabled: false, confirmWrites: true },
});

const pwd = reactive({ oldPassword: '', newPassword: '', confirm: '' });
const pwdSaving = ref(false);

async function load() {
  loading.value = true;
  try {
    const [setRes, connRes] = await Promise.allSettled([
      getSettings(),
      getConnections(),
    ]);
    if (setRes.status === 'fulfilled') {
      const res: any = setRes.value;
      form.contacts = { ...res.contacts };
      form.safety = { ...res.safety };
    }
    if (connRes.status === 'fulfilled')
      connections.value = (connRes.value as any).items || [];
    const auditRes: any = can('audit:read')
      ? await getAudit(50).catch(() => ({ items: [] }))
      : { items: [] };
    audit.value = auditRes.items || [];
    status.value = await getSystemStatus().catch(() => null);
    await loadUpdate();
  } finally {
    loading.value = false;
  }
}

onMounted(load);

async function save() {
  if (form.safety.billingEnabled && !confirmBilling.value) {
    message.warning('请先勾选确认，再保存扣费开关');
    return;
  }
  saving.value = true;
  try {
    await saveSettings({
      contacts: { ...form.contacts },
      safety: { ...form.safety },
    });
    message.success('设置已保存');
    confirmBilling.value = false;
    await load();
  } finally {
    saving.value = false;
  }
}

async function submitPwd() {
  if (!pwd.oldPassword || !pwd.newPassword) {
    message.warning('请填写当前密码和新密码');
    return;
  }
  if (pwd.newPassword !== pwd.confirm) {
    message.warning('两次输入的新密码不一致');
    return;
  }
  pwdSaving.value = true;
  try {
    await changePassword({
      oldPassword: pwd.oldPassword,
      newPassword: pwd.newPassword,
    });
    message.success('密码已修改，请使用新密码登录');
    pwd.oldPassword = '';
    pwd.newPassword = '';
    pwd.confirm = '';
    await authStore.logout(false);
  } finally {
    pwdSaving.value = false;
  }
}

const ACTION_LABEL: Record<string, string> = {
  'auth.login': '登录',
  'auth.logout': '退出',
  'auth.password': '改密',
  'settings.update': '修改设置',
  'domain.renew': '续费',
  'domain.register': '注册',
  'domain.autorenew': '自动续费',
  'domain.nameservers': '修改 NS',
  'domain.transferLock': '转移锁',
  'domain.authcode': '授权码',
  'dns.create': '新增解析',
  'dns.update': '更新解析',
  'dns.delete': '删除解析',
  'cache.purge': '清缓存',
  'payment.create': '新增支付',
  'payment.update': '更新支付',
  'payment.default': '设默认支付',
  'payment.sync': '同步支付',
  'account.create': '新建账户',
  'role.update': '角色调整',
  'order.update': '订单状态',
  'connection.create': '新增接入',
  'connection.update': '更新接入',
  'connection.default': '默认注册商',
  'notify.update': '通知配置',
  'notify.test': '通知测试',
  'notify.run': '到期检查',
};

const auditColumns = [
  { title: '时间', key: 'ts', width: 150 },
  { title: '操作人', key: 'actor', width: 110 },
  { title: '动作', key: 'action', width: 120 },
  { title: '对象', key: 'target', width: 200 },
  { title: '说明', key: 'summary' },
];

function fmtUptime(sec: number | undefined) {
  if (sec === undefined || sec === null) return '—';
  if (sec < 60) return `${Math.max(1, Math.round(sec))} 秒`;
  const d = Math.floor(sec / 86_400);
  const h = Math.floor((sec % 86_400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (d) return `${d} 天 ${h} 小时`;
  if (h) return `${h} 小时 ${m} 分`;
  return `${m} 分钟`;
}

function fmtBytes(n: number | undefined) {
  if (!n) return '0 B';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

const registrars = computed(() =>
  connections.value.filter((c) => c.roles.includes('registrar')),
);
const dnsConnections = computed(() =>
  connections.value.filter((c) => c.roles.includes('dns')),
);
const defaultRegistrar = computed(
  () => registrars.value.find((c) => c.isDefault)?.name || '未设置',
);
</script>

<template>
  <Page
    description="账号安全、默认联系人与系统偏好；凭据与通知在各自页面管理"
    title="系统设置"
  >
    <template #extra>
      <Button :loading="loading" @click="load">重新加载</Button>
      <Button
        v-if="can('settings:write')"
        :loading="saving"
        type="primary"
        @click="save"
        >保存设置</Button
      >
    </template>

    <div class="grid grid-cols-1 gap-4 xl:grid-cols-2">
      <Card :bordered="true" title="接入状态">
        <div class="space-y-3">
          <div class="flex items-center justify-between">
            <div>
              <div class="text-[13px] text-slate-700">注册商</div>
              <div class="text-xs text-slate-400">
                {{ registrars.length }} 个接入 · 默认：{{ defaultRegistrar }}
              </div>
            </div>
            <Button size="small" @click="router.push('/providers')"
              >管理接入</Button
            >
          </div>
          <div
            class="flex items-center justify-between border-t border-slate-100 pt-3"
          >
            <div>
              <div class="text-[13px] text-slate-700">DNS 服务商</div>
              <div class="text-xs text-slate-400">
                {{ dnsConnections.length }} 个接入
                <template v-if="dnsConnections.length"
                  >·
                  {{ dnsConnections.map((c) => c.name).join('、') }}</template
                >
              </div>
            </div>
            <Button
              v-if="can('dns:read')"
              size="small"
              @click="router.push('/dns')"
              >管理解析</Button
            >
          </div>
          <div
            class="flex items-center justify-between border-t border-slate-100 pt-3"
          >
            <div>
              <div class="text-[13px] text-slate-700">到期提醒</div>
              <div class="text-xs text-slate-400">
                多渠道推送，提前 30 天起提醒
              </div>
            </div>
            <Button size="small" @click="router.push('/notifications')"
              >通知设置</Button
            >
          </div>
          <Alert
            v-if="!connections.length"
            message="还没有接入任何服务商，先去「注册商与接入」添加。"
            show-icon
            type="warning"
          />
        </div>
      </Card>

      <Card :bordered="true" title="安全开关">
        <div class="space-y-4">
          <div class="flex items-start justify-between gap-4">
            <div>
              <div class="text-[13px] font-medium text-slate-700">
                允许扣费操作
              </div>
              <div class="mt-0.5 text-xs leading-relaxed text-slate-400">
                关闭时，注册、续费、转入、赎回会被服务端直接拒绝，避免误操作产生真实扣款。
              </div>
            </div>
            <Switch
              v-model:checked="form.safety.billingEnabled"
              :disabled="!can('settings:write')"
            />
          </div>

          <Alert
            v-if="form.safety.billingEnabled"
            type="warning"
            show-icon
            message="扣费已开启"
            description="任何确认过的注册 / 续费 / 转入都会真实下单。"
          >
            <template #action>
              <label class="flex items-center gap-1 text-xs">
                <input v-model="confirmBilling" type="checkbox" />
                我已知晓
              </label>
            </template>
          </Alert>

          <div
            class="flex items-start justify-between gap-4 border-t border-slate-100 pt-3"
          >
            <div>
              <div class="text-[13px] font-medium text-slate-700">
                写操作二次确认
              </div>
              <div class="mt-0.5 text-xs text-slate-400">
                删除记录、修改 NS、切换代理前弹出确认。
              </div>
            </div>
            <Switch
              v-model:checked="form.safety.confirmWrites"
              :disabled="!can('settings:write')"
            />
          </div>
        </div>
      </Card>

      <Card :bordered="true" title="默认联系人">
        <div class="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div>
            <div class="mb-1 text-xs text-slate-500">Registrant（必填）</div>
            <Input
              v-model:value="form.contacts.registrant"
              class="font-mono"
              placeholder="联系人 ID"
            />
          </div>
          <div>
            <div class="mb-1 text-xs text-slate-500">Admin</div>
            <Input
              v-model:value="form.contacts.admin"
              class="font-mono"
              placeholder="默认同 Registrant"
            />
          </div>
          <div>
            <div class="mb-1 text-xs text-slate-500">Tech</div>
            <Input
              v-model:value="form.contacts.tech"
              class="font-mono"
              placeholder="默认同 Registrant"
            />
          </div>
          <div>
            <div class="mb-1 text-xs text-slate-500">Billing</div>
            <Input
              v-model:value="form.contacts.billing"
              class="font-mono"
              placeholder="默认同 Registrant"
            />
          </div>
        </div>
        <div class="mt-2 text-xs text-slate-400">
          联系人 ID 形如
          <code class="rounded bg-slate-100 px-1 font-mono"
            >1ZdMXpapqp9sle5dl8BlppTJXAzf5</code
          >，Spaceship 注册时必填；Cloudflare 注册由平台托管联系人。
        </div>
      </Card>

      <Card :bordered="true" title="修改我的密码">
        <div class="space-y-3">
          <div>
            <div class="mb-1 text-xs text-slate-500">当前密码</div>
            <Input.Password v-model:value="pwd.oldPassword" />
          </div>
          <div class="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div>
              <div class="mb-1 text-xs text-slate-500">新密码（至少 8 位）</div>
              <Input.Password v-model:value="pwd.newPassword" />
            </div>
            <div>
              <div class="mb-1 text-xs text-slate-500">确认新密码</div>
              <Input.Password v-model:value="pwd.confirm" />
            </div>
          </div>
          <div class="flex justify-end">
            <Button :loading="pwdSaving" @click="submitPwd">修改密码</Button>
          </div>
        </div>
      </Card>

      <Card :bordered="true" class="xl:col-span-2" title="运行状态">
        <div
          v-if="status"
          class="grid grid-cols-1 gap-x-8 gap-y-3 md:grid-cols-3"
        >
          <div class="space-y-1.5">
            <div class="status-label">服务</div>
            <div class="status-row">
              <span>版本</span><em>v{{ status.app?.version || '—' }}</em>
            </div>
            <div class="status-row">
              <span>运行时</span><em>{{ status.app?.node }}</em>
            </div>
            <div class="status-row">
              <span>平台</span><em>{{ status.app?.platform }}</em>
            </div>
            <div class="status-row">
              <span>已运行</span
              ><em>{{ fmtUptime(status.app?.uptimeSeconds) }}</em>
            </div>
            <div class="status-row">
              <span>数据模式</span>
              <em :class="status.app?.mode === 'demo' ? 'text-amber-600' : ''">
                {{ status.app?.mode === 'demo' ? '演示数据' : '真实数据' }}
              </em>
            </div>
          </div>

          <div class="space-y-1.5">
            <div class="status-label">数据</div>
            <div class="status-row">
              <span>数据目录</span
              ><em
                class="font-mono text-[11px]"
                :title="status.paths?.dataDir"
                >{{ status.paths?.dataDir }}</em
              >
            </div>
            <div class="status-row">
              <span>配置文件</span>
              <em>{{
                status.paths?.config?.exists
                  ? fmtBytes(status.paths.config.size)
                  : '未生成'
              }}</em>
            </div>
            <div class="status-row">
              <span>前端产物</span>
              <em>{{
                status.paths?.frontend?.exists
                  ? dayjs(status.paths.frontend.modifiedAt).format(
                      'MM-DD HH:mm',
                    )
                  : '未构建'
              }}</em>
            </div>
            <div class="status-row">
              <span>账户 / 角色</span
              ><em>{{ status.counts?.users }} / {{ status.counts?.roles }}</em>
            </div>
            <div class="status-row">
              <span>接入 / 支付 / 订单</span>
              <em
                >{{ status.counts?.connections }} /
                {{ status.counts?.payments }} / {{ status.counts?.orders }}</em
              >
            </div>
          </div>

          <div class="space-y-1.5">
            <div class="status-label">运行策略</div>
            <div class="status-row">
              <span>扣费开关</span>
              <em
                :class="
                  status.safety?.billingEnabled
                    ? 'text-amber-600'
                    : 'text-emerald-600'
                "
              >
                {{
                  status.safety?.billingEnabled
                    ? '已开启（可真实下单）'
                    : '已关闭（拒绝扣费）'
                }}
              </em>
            </div>
            <div class="status-row">
              <span>到期提醒</span
              ><em
                >{{ status.notifications?.enabled ? '开启' : '关闭' }} ·
                {{ status.notifications?.channels || 0 }} 个渠道</em
              >
            </div>
            <div class="status-row">
              <span>上次检查</span>
              <em>{{
                status.notifications?.lastCheckAt
                  ? dayjs(status.notifications.lastCheckAt).format(
                      'MM-DD HH:mm',
                    )
                  : '尚未运行'
              }}</em>
            </div>
            <div class="status-row">
              <span>接入健康</span>
              <em>
                <template v-if="status.connections?.length">
                  <Tag
                    v-for="c in status.connections"
                    :key="c.id"
                    class="mr-1"
                    :color="c.enabled ? 'default' : 'red'"
                  >
                    {{ c.name }}
                  </Tag>
                </template>
                <span v-else class="text-slate-400">未接入</span>
              </em>
            </div>
          </div>
        </div>
        <div v-else class="text-xs text-slate-400">状态读取中…</div>
      </Card>

      <Card :bordered="true" class="xl:col-span-2" title="版本与更新">
        <div class="grid grid-cols-1 gap-x-8 gap-y-4 md:grid-cols-2">
          <div class="space-y-1.5">
            <div class="status-label">当前</div>
            <div class="status-row">
              <span>版本</span
              ><em
                >v{{
                  updState?.current?.version || status?.app?.version || '—'
                }}</em
              >
            </div>
            <div class="status-row">
              <span>构建时间</span>
              <em>{{
                updState?.current?.buildTime
                  ? dayjs(updState.current.buildTime).format('YYYY-MM-DD HH:mm')
                  : '—'
              }}</em>
            </div>
            <div class="status-row">
              <span>运行时</span
              ><em
                >{{ updState?.current?.runtime }} ·
                {{ updState?.current?.platform }}</em
              >
            </div>
            <div class="status-row">
              <span>守护方式</span>
              <em>
                {{
                  updState?.current?.managed === 'systemd'
                    ? 'systemd（更新后自动拉起）'
                    : updState?.current?.managed === 'panel'
                      ? '面板守护（更新后自动拉起）'
                      : '手动运行（更新后不会自启）'
                }}
              </em>
            </div>
            <div class="status-row">
              <span>可执行文件</span
              ><em
                class="font-mono text-[11px]"
                :title="updState?.current?.execPath"
                >{{ updState?.current?.execPath }}</em
              >
            </div>
          </div>

          <div class="space-y-2">
            <div class="status-label">版本源</div>
            <Input value="logdns/DomainDeck · Node 3.x" readonly />
            <div class="text-xs text-slate-400">从固定 GitHub 仓库检查更新并验证 SHA-256；不支持旧 Go 程序的任意 Feed。</div>
          </div>
        </div>

        <div
          class="mt-4 flex flex-wrap items-center gap-3 border-t border-slate-100 pt-3"
        >
          <Button :loading="updBusy" :disabled="!can('settings:read')" @click="doCheck">检查更新</Button>
          <span v-if="updState?.checkedAt" class="text-xs text-slate-400">
            上次检查 {{ dayjs(updState.checkedAt).format('MM-DD HH:mm') }}
          </span>
          <span
            v-if="updState && !updState.configured"
            class="text-xs text-amber-600"
            >还没有配置版本源</span
          >
        </div>

        <div
          v-if="updState?.latest"
          class="mt-3 rounded border px-3 py-3"
          :class="
            updState.hasUpdate
              ? 'border-blue-200 bg-blue-50/60'
              : 'border-slate-200 bg-slate-50'
          "
        >
          <div class="flex flex-wrap items-center justify-between gap-2">
            <div class="flex items-center gap-2 text-sm">
              <Tag :color="updState.hasUpdate ? 'blue' : 'green'" class="mr-0">
                {{
                  updState.hasUpdate
                    ? `可更新到 ${updState.latest.version}`
                    : '已是最新'
                }}
              </Tag>
              <span class="text-xs text-slate-500">
                {{
                  updState.latest.publishedAt
                    ? dayjs(updState.latest.publishedAt).format('YYYY-MM-DD')
                    : ''
                }}
                · {{ fmtSize(updState.latest.size) }} ·
                {{
                  updState.latest.source === 'github'
                    ? 'GitHub Releases'
                    : '自定义 feed'
                }}
              </span>
            </div>
            <div v-if="updState.hasUpdate" class="flex items-center gap-3">
              <Popconfirm
                :title="`确认下载并更新到 ${updState.latest.version}？更新会备份数据库并切换程序版本。`"
                ok-text="更新"
                cancel-text="取消"
                @confirm="doApply"
              >
                <Button
                  :disabled="!can('settings:write') || !updState.installSupported"
                  :loading="applying"
                  size="small"
                  type="primary"
                  >立即更新</Button
                >
              </Popconfirm>
            </div>
          </div>
          <div v-if="updState.latest.notes" class="update-notes">
            {{ updState.latest.notes }}
          </div>
        </div>

        <Alert
          v-if="updState && !updState.installSupported"
          class="mt-3"
          type="warning"
          show-icon
          message="当前安装方式不支持后台在线替换"
          description="请下载完整 Linux Release 包并重新运行安装器。只有由官方 systemd 安装器管理的 Node 3.x 实例才开放在线更新。"
        />
        <Alert
          v-else-if="updState?.hasUpdate && !can('settings:write')"
          class="mt-3"
          type="info"
          show-icon
          message="发现新版本，但当前账号没有安装权限"
        />
      </Card>

      <Card :bordered="true" class="xl:col-span-2" title="操作日志">
        <Table
          :columns="auditColumns"
          :data-source="audit"
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
            <template v-else-if="column.key === 'actor'">
              <span class="text-xs text-slate-600">{{
                record.actor || 'system'
              }}</span>
            </template>
            <template v-else-if="column.key === 'action'">
              <Tag
                class="mr-0"
                :color="
                  record.status === 'ok' || record.status === 'accepted'
                    ? 'default'
                    : 'red'
                "
              >
                {{ ACTION_LABEL[record.action] || record.action }}
              </Tag>
            </template>
            <template v-else-if="column.key === 'target'">
              <span class="font-mono text-xs">{{ record.target }}</span>
            </template>
            <template v-else-if="column.key === 'summary'">
              <span class="text-xs text-slate-500">{{ record.summary }}</span>
            </template>
          </template>
        </Table>
      </Card>

      <Card :bordered="true" class="xl:col-span-2">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div class="text-xs leading-relaxed text-slate-400">
            凭据保存在本机
            <code class="rounded bg-slate-100 px-1 font-mono"
              >data/config.json</code
            >（0600），接口返回时脱敏；服务仅监听
            <code class="rounded bg-slate-100 px-1 font-mono">127.0.0.1</code>。
          </div>
          <div class="flex gap-3 text-xs">
            <a
              class="text-blue-600"
              href="https://docs.spaceship.dev/"
              target="_blank"
              rel="noreferrer"
              >Spaceship API ↗</a
            >
            <a
              class="text-blue-600"
              href="https://developers.cloudflare.com/api/"
              target="_blank"
              rel="noreferrer"
              >Cloudflare API ↗</a
            >
            <a
              class="text-blue-600"
              href="https://doc.vben.pro/"
              target="_blank"
              rel="noreferrer"
              >Vben Admin ↗</a
            >
          </div>
        </div>
      </Card>
    </div>
  </Page>
</template>

<style scoped>
.update-notes {
  max-height: 120px;
  padding-top: 8px;
  margin-top: 8px;
  overflow-y: auto;
  font-size: 12px;
  line-height: 1.8;
  color: #475569;
  white-space: pre-wrap;
  border-top: 1px dashed #e2e8f0;
}

.status-label {
  margin-bottom: 2px;
  font-size: 12px;
  font-weight: 600;
  color: #94a3b8;
  letter-spacing: 0.04em;
}

.status-row {
  display: flex;
  gap: 12px;
  align-items: baseline;
  justify-content: space-between;
  font-size: 12.5px;
  line-height: 1.9;
  color: #94a3b8;
}

.status-row em {
  flex-shrink: 0;
  max-width: 68%;
  overflow: hidden;
  font-style: normal;
  color: #334155;
  text-align: right;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.status-row em.ellipsis-path {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 11px;
}
</style>
