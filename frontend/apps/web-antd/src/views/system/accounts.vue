<script lang="ts" setup>
import { computed, onMounted, reactive, ref } from 'vue';

import Page from '#/components/deck-page.vue';
import { usePermissions } from '#/composables/use-permissions';
import { useUserStore } from '@vben/stores';
import { useAuthStore } from '#/store';

import {
  Button,
  Card,
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

import {
  createAccount,
  deleteAccount,
  getAccounts,
  getRoles,
  resetAccountPassword,
  updateAccount,
} from '#/api/domaindeck';

const userStore = useUserStore();
const authStore = useAuthStore();
const { can } = usePermissions();
const currentUserId = computed(() => userStore.userInfo?.userId);

const loading = ref(false);
const items = ref<any[]>([]);
const roles = ref<any[]>([]);
const keyword = ref('');

const modalOpen = ref(false);
const saving = ref(false);
const editingId = ref<null | string>(null);
const form = reactive<any>({
  username: '',
  realName: '',
  email: '',
  password: '',
  roleCodes: ['viewer'],
  status: 'active',
  note: '',
  currentPassword: '',
});

const pwdOpen = ref(false);
const pwdTarget = ref<any>(null);
const newPwd = ref('');
const pwdSaving = ref(false);

async function load() {
  loading.value = true;
  try {
    const [accRes, roleRes] = await Promise.allSettled([
      getAccounts(keyword.value),
      can('role:read') ? getRoles() : Promise.resolve({ items: [] }),
    ]);
    if (accRes.status === 'fulfilled')
      items.value = (accRes.value as any).items || [];
    if (roleRes.status === 'fulfilled')
      roles.value = (roleRes.value as any).items || [];
  } finally {
    loading.value = false;
  }
}

onMounted(load);

const columns = [
  { title: '账户', key: 'account', width: 240 },
  { title: '邮箱', key: 'email', width: 200 },
  { title: '角色', key: 'roles', width: 200 },
  { title: '状态', key: 'status', width: 100 },
  { title: '最后登录', key: 'lastLoginAt', width: 160 },
  { title: '操作', key: 'action', width: 210, align: 'right' as const },
];

function openCreate() {
  editingId.value = null;
  Object.assign(form, {
    username: '',
    realName: '',
    email: '',
    password: '',
    roleCodes: ['viewer'],
    status: 'active',
    note: '',
  });
  modalOpen.value = true;
}

function openEdit(record: any) {
  editingId.value = record.id;
  Object.assign(form, {
    username: record.username,
    realName: record.realName,
    email: record.email,
    password: '',
    roleCodes: [...record.roleCodes],
    status: record.status,
    note: record.note || '',
    currentPassword: '',
  });
  modalOpen.value = true;
}

async function save() {
  if (!form.username) {
    message.warning('请填写用户名');
    return;
  }
  if (!editingId.value && (form.password || '').length < 8) {
    message.warning('初始密码至少 8 位');
    return;
  }
  saving.value = true;
  try {
    if (editingId.value) {
      const updated = (await updateAccount(editingId.value, {
        username: form.username,
        realName: form.realName,
        email: form.email,
        roleCodes: form.roleCodes,
        status: form.status,
        note: form.note,
        currentPassword: form.currentPassword,
      })) as { email: string; realName: string; username: string; loginRequired?: boolean };
      if (updated.loginRequired) { modalOpen.value = false; await authStore.logout(false); return; }
      if (editingId.value === currentUserId.value && userStore.userInfo) {
        userStore.setUserInfo({
          ...userStore.userInfo,
          email: updated.email,
          realName: updated.realName,
          username: updated.username,
        });
      }
      message.success('账户已更新');
    } else {
      await createAccount({ ...form });
      message.success('账户已创建');
    }
    modalOpen.value = false;
    await load();
  } finally {
    saving.value = false;
  }
}

async function toggleStatus(record: any, active: boolean) {
  try {
    await updateAccount(record.id, { status: active ? 'active' : 'disabled' });
    record.status = active ? 'active' : 'disabled';
    message.success(`${record.username} 已${active ? '启用' : '禁用'}`);
  } catch {
    record.status = active ? 'disabled' : 'active';
  }
}

function openPwd(record: any) {
  pwdTarget.value = record;
  newPwd.value = '';
  pwdOpen.value = true;
}

async function savePwd() {
  if ((newPwd.value || '').length < 8) {
    message.warning('密码至少 8 位');
    return;
  }
  pwdSaving.value = true;
  try {
    await resetAccountPassword(pwdTarget.value.id, newPwd.value);
    message.success('密码已重置');
    pwdOpen.value = false;
  } finally {
    pwdSaving.value = false;
  }
}

async function remove(record: any) {
  await deleteAccount(record.id);
  message.success('账户已删除');
  load();
}
</script>

<template>
  <Page description="后台登录账户与角色分配" title="账户管理">
    <template #extra>
      <Space>
        <Input
          v-model:value="keyword"
          allow-clear
          placeholder="搜索用户名 / 姓名 / 邮箱"
          style="width: 240px"
          @press-enter="load"
        />
        <Button :loading="loading" @click="load">查询</Button>
        <Button
          v-if="can('account:write', 'role:read')"
          type="primary"
          @click="openCreate"
          >新建账户</Button
        >
      </Space>
    </template>

    <Card :bordered="true">
      <Table
        :columns="columns"
        :data-source="items"
        :loading="loading"
        :pagination="{ pageSize: 10 }"
        row-key="id"
        size="middle"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'account'">
            <div class="flex items-center gap-2">
              <span class="user-avatar">{{
                (record.realName || record.username).slice(0, 1)
              }}</span>
              <div class="min-w-0">
                <div class="truncate text-[13px] font-medium text-slate-800">
                  {{ record.realName || record.username }}
                  <Tag
                    v-if="record.id === currentUserId"
                    color="blue"
                    class="ml-1 mr-0"
                    >当前</Tag
                  >
                </div>
                <div class="font-mono text-xs text-slate-400">
                  {{ record.username }}
                </div>
              </div>
            </div>
          </template>
          <template v-else-if="column.key === 'email'">
            <span class="text-xs text-slate-500">{{
              record.email || '—'
            }}</span>
          </template>
          <template v-else-if="column.key === 'roles'">
            <Tag
              v-for="(r, i) in record.roleNames || record.roleCodes"
              :key="i"
              class="mb-1 mr-1"
              :color="record.roleCodes?.includes('super') ? 'blue' : 'default'"
            >
              {{ r }}
            </Tag>
          </template>
          <template v-else-if="column.key === 'status'">
            <div class="flex items-center gap-2">
              <Switch
                :checked="record.status === 'active'"
                size="small"
                :disabled="!can('account:write')"
                @change="
                  (v: any) =>
                    can('account:write') && toggleStatus(record, Boolean(v))
                "
              />
              <span
                class="text-xs"
                :class="
                  record.status === 'active'
                    ? 'text-slate-600'
                    : 'text-slate-400'
                "
              >
                {{ record.status === 'active' ? '启用' : '禁用' }}
              </span>
            </div>
          </template>
          <template v-else-if="column.key === 'lastLoginAt'">
            <span class="text-xs text-slate-500">
              {{
                record.lastLoginAt
                  ? dayjs(record.lastLoginAt).format('MM-DD HH:mm')
                  : '从未登录'
              }}
            </span>
          </template>
          <template v-else-if="column.key === 'action'">
            <Space :size="0">
              <Button
                v-if="can('account:write', 'role:read')"
                size="small"
                type="link"
                @click="openEdit(record)"
                >编辑</Button
              >
              <Button
                v-if="can('account:write') && record.id !== currentUserId"
                size="small"
                type="link"
                @click="openPwd(record)"
                >重置密码</Button
              >
              <Tooltip
                :title="
                  record.id === currentUserId
                    ? '不能删除当前登录账户'
                    : ''
                "
              >
                <Popconfirm
                  v-if="can('account:write')"
                  title="删除后该账户将无法登录，确认？"
                  ok-text="删除"
                  cancel-text="取消"
                  :disabled="record.id === currentUserId"
                  @confirm="remove(record)"
                >
                  <Button
                    size="small"
                    type="link"
                    danger
                    :disabled="record.id === currentUserId"
                    >删除</Button
                  >
                </Popconfirm>
              </Tooltip>
            </Space>
          </template>
        </template>
      </Table>
    </Card>

    <Modal
      v-model:open="modalOpen"
      :confirm-loading="saving"
      :title="editingId ? '编辑账户' : '新建账户'"
      ok-text="保存"
      width="560px"
      @ok="save"
    >
      <div class="grid grid-cols-2 gap-3 pt-2">
        <div>
          <div class="mb-1 text-xs text-slate-500">用户名</div>
          <Input
            v-model:value="form.username"
            class="font-mono"
            placeholder="字母开头，3-32 位"
          />
        </div>
        <div>
          <div class="mb-1 text-xs text-slate-500">姓名 / 显示名</div>
          <Input
            v-model:value="form.realName"
            placeholder="例如：运维 · 小林"
          />
        </div>
        <div class="col-span-2">
          <div class="mb-1 text-xs text-slate-500">邮箱</div>
          <Input v-model:value="form.email" placeholder="name@example.com" />
        </div>
        <div v-if="!editingId" class="col-span-2">
          <div class="mb-1 text-xs text-slate-500">初始密码（至少 8 位）</div>
          <Input.Password
            v-model:value="form.password"
            placeholder="建议包含大小写与符号"
          />
        </div>
        <div class="col-span-2">
          <div class="mb-1 text-xs text-slate-500">角色</div>
          <Select
            v-model:value="form.roleCodes"
            mode="multiple"
            style="width: 100%"
            placeholder="选择角色"
            :options="
              roles.map((r) => ({
                label: `${r.name}（${r.code}）`,
                value: r.code,
              }))
            "
          />
        </div>
        <div v-if="editingId === currentUserId" class="col-span-2">
          <div class="mb-1 text-xs text-slate-500">当前密码（修改本人资料后需重新登录）</div>
          <Input.Password v-model:value="form.currentPassword" autocomplete="current-password" />
        </div>
        <div>
          <div class="mb-1 text-xs text-slate-500">状态</div>
          <div class="flex h-8 items-center">
            <div class="flex items-center gap-2">
              <Switch
                v-model:checked="form.status"
                checked-value="active"
                un-checked-value="disabled"
              />
              <span class="text-xs text-slate-500">{{
                form.status === 'active' ? '启用' : '禁用'
              }}</span>
            </div>
          </div>
        </div>
        <div>
          <div class="mb-1 text-xs text-slate-500">备注</div>
          <Input v-model:value="form.note" placeholder="选填" />
        </div>
      </div>
    </Modal>

    <Modal
      v-model:open="pwdOpen"
      :confirm-loading="pwdSaving"
      :title="`重置 ${pwdTarget?.username || ''} 的密码`"
      ok-text="重置"
      @ok="savePwd"
    >
      <div class="space-y-2 pt-2">
        <div class="text-xs text-slate-500">
          新密码至少 8 位。重置后请通过安全渠道告知对方。
        </div>
        <Input.Password v-model:value="newPwd" placeholder="输入新密码" />
      </div>
    </Modal>
  </Page>
</template>

<style scoped>
.user-avatar {
  display: grid;
  flex-shrink: 0;
  place-items: center;
  width: 30px;
  height: 30px;
  font-size: 13px;
  font-weight: 600;
  color: #1d4ed8;
  background: #eff6ff;
  border-radius: 50%;
}
</style>
