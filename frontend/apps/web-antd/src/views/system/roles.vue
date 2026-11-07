<script lang="ts" setup>
import { computed, onMounted, reactive, ref, watch } from 'vue';

import Page from '#/components/deck-page.vue';
import { usePermissions } from '#/composables/use-permissions';

import {
  Alert,
  Button,
  Card,
  Checkbox,
  Input,
  message,
  Modal,
  Popconfirm,
  Tag,
} from 'ant-design-vue';

import {
  createRole,
  deleteRole,
  getPermissionCatalog,
  getRoles,
  updateRole,
} from '#/api/domaindeck';

const { can } = usePermissions();
const loading = ref(false);
const roles = ref<any[]>([]);
const groups = ref<any[]>([]);
const activeId = ref('');
const selected = ref<string[]>([]);
const saving = ref(false);

const modalOpen = ref(false);
const newRole = reactive({ name: '', code: '', description: '' });
const creating = ref(false);

const activeRole = computed(() =>
  roles.value.find((r) => r.id === activeId.value),
);
const isSuper = computed(() => activeRole.value?.builtin === true);

async function load() {
  loading.value = true;
  try {
    const [roleRes, permRes] = await Promise.allSettled([
      getRoles(),
      getPermissionCatalog(),
    ]);
    if (roleRes.status === 'fulfilled')
      roles.value = (roleRes.value as any).items || [];
    if (permRes.status === 'fulfilled')
      groups.value = (permRes.value as any).groups || [];
    if (!activeId.value && roles.value.length)
      activeId.value = roles.value[0].id;
  } finally {
    loading.value = false;
  }
}

onMounted(load);

watch(activeId, () => {
  selected.value = [...(activeRole.value?.permissions || [])];
});

watch(roles, () => {
  if (!roles.value.some((r) => r.id === activeId.value) && roles.value.length) {
    activeId.value = roles.value[0].id;
  }
  selected.value = [...(activeRole.value?.permissions || [])];
});

function toggle(code: string, checked: boolean) {
  if (checked) {
    if (!selected.value.includes(code))
      selected.value = [...selected.value, code];
  } else {
    selected.value = selected.value.filter((c) => c !== code);
  }
}

function groupHas(group: any) {
  const codes = group.items.map((i: any) => i.code);
  return codes.every((c: string) => selected.value.includes(c));
}

function groupPartial(group: any) {
  const codes = group.items.map((i: any) => i.code);
  const has = codes.filter((c: string) => selected.value.includes(c));
  return has.length > 0 && has.length < codes.length;
}

function toggleGroup(group: any, checked: boolean) {
  const codes = group.items.map((i: any) => i.code);
  if (checked) {
    selected.value = [...new Set([...selected.value, ...codes])];
  } else {
    selected.value = selected.value.filter((c) => !codes.includes(c));
  }
}

async function save() {
  if (!activeRole.value || isSuper.value) return;
  saving.value = true;
  try {
    await updateRole(activeRole.value.id, { name: activeRole.value.name, permissions: selected.value });
    message.success(`「${activeRole.value.name}」的权限已保存`);
    await load();
  } finally {
    saving.value = false;
  }
}

async function createNew() {
  if (!newRole.name || !newRole.code) {
    message.warning('请填写角色名称与标识');
    return;
  }
  creating.value = true;
  try {
    await createRole({ ...newRole, permissions: [] });
    message.success('角色已创建');
    modalOpen.value = false;
    Object.assign(newRole, { name: '', code: '', description: '' });
    await load();
  } finally {
    creating.value = false;
  }
}

async function remove(role: any) {
  await deleteRole(role.id);
  message.success('角色已删除');
  load();
}

const permCount = computed(() =>
  activeRole.value?.permissions?.includes('*') ? '全部' : selected.value.length,
);
</script>

<template>
  <Page description="角色决定可见菜单，权限码控制按钮级操作" title="角色权限">
    <template #extra>
      <Button v-if="can('role:write')" type="primary" @click="modalOpen = true"
        >新建角色</Button
      >
    </template>

    <div class="flex flex-col gap-4 xl:flex-row">
      <!-- 角色列表 -->
      <Card
        :bordered="true"
        class="w-full shrink-0 xl:w-[300px]"
        :body-style="{ padding: '10px' }"
        :loading="loading"
      >
        <button
          v-for="role in roles"
          :key="role.id"
          class="role-item"
          :class="{ active: role.id === activeId }"
          @click="activeId = role.id"
        >
          <div class="flex items-center gap-2">
            <span class="text-[13px] font-medium text-slate-800">{{
              role.name
            }}</span>
            <Tag v-if="role.builtin" class="mr-0" color="default">内置</Tag>
            <Tag v-if="role.code === 'super'" class="mr-0" color="blue"
              >全部权限</Tag
            >
          </div>
          <div class="mt-0.5 flex items-center gap-2 text-xs text-slate-400">
            <span class="font-mono">{{ role.code }}</span>
            <span>·</span>
            <span>{{ role.userCount }} 个账户</span>
          </div>
          <div class="mt-1 truncate text-xs text-slate-400">
            {{ role.description || '暂无描述' }}
          </div>
        </button>
      </Card>

      <!-- 权限矩阵 -->
      <Card :bordered="true" class="min-w-0 flex-1">
        <template #title>
          <div class="flex items-center gap-2">
            <span>{{ activeRole?.name || '权限配置' }}</span>
            <Tag class="mr-0">已选 {{ permCount }} 项</Tag>
          </div>
        </template>
        <template #extra>
          <div class="flex items-center gap-2">
            <Popconfirm
              v-if="activeRole && !activeRole.builtin"
              title="删除该角色？"
              ok-text="删除"
              cancel-text="取消"
              :disabled="!can('role:write')"
              @confirm="remove(activeRole)"
            >
              <Button :disabled="!can('role:write')" size="small" danger
                >删除角色</Button
              >
            </Popconfirm>
            <Button
              :disabled="isSuper || !can('role:write')"
              :loading="saving"
              size="small"
              type="primary"
              @click="save"
              >保存权限</Button
            >
          </div>
        </template>

        <Alert
          v-if="isSuper"
          class="mb-3"
          message="超级管理员默认拥有全部权限，包括以后新增的权限码，因此不可修改。"
          show-icon
          type="info"
        />

        <div class="space-y-4">
          <div v-for="group in groups" :key="group.key" class="perm-group">
            <div
              class="mb-2 flex items-center gap-2 border-b border-slate-100 pb-1.5"
            >
              <Checkbox
                :checked="groupHas(group)"
                :disabled="isSuper || !can('role:write')"
                :indeterminate="groupPartial(group)"
                @change="(e: any) => toggleGroup(group, e.target.checked)"
              />
              <span class="text-[13px] font-medium text-slate-700">{{
                group.label
              }}</span>
              <span class="text-xs text-slate-400"
                >{{ group.items.length }} 项</span
              >
            </div>
            <div class="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
              <label
                v-for="item in group.items"
                :key="item.code"
                class="perm-item"
                :class="{
                  checked: selected.includes(item.code) || isSuper,
                  readonly: isSuper,
                }"
              >
                <Checkbox
                  :checked="isSuper || selected.includes(item.code)"
                  :disabled="isSuper || !can('role:write')"
                  @change="(e: any) => toggle(item.code, e.target.checked)"
                />
                <div class="min-w-0">
                  <div class="text-[13px] text-slate-700">{{ item.label }}</div>
                  <div class="truncate font-mono text-[11px] text-slate-400">
                    {{ item.code }}
                  </div>
                </div>
              </label>
            </div>
          </div>
        </div>
      </Card>
    </div>

    <Modal
      v-model:open="modalOpen"
      :confirm-loading="creating"
      ok-text="创建"
      title="新建角色"
      @ok="createNew"
    >
      <div class="space-y-3 pt-2">
        <div>
          <div class="mb-1 text-xs text-slate-500">角色名称</div>
          <Input v-model:value="newRole.name" placeholder="例如：财务审核" />
        </div>
        <div>
          <div class="mb-1 text-xs text-slate-500">
            角色标识（小写字母、数字、下划线）
          </div>
          <Input
            v-model:value="newRole.code"
            class="font-mono"
            placeholder="finance"
          />
        </div>
        <div>
          <div class="mb-1 text-xs text-slate-500">描述</div>
          <Input v-model:value="newRole.description" placeholder="选填" />
        </div>
      </div>
    </Modal>
  </Page>
</template>

<style scoped>
.role-item {
  display: block;
  width: 100%;
  padding: 10px 12px;
  margin-bottom: 2px;
  text-align: left;
  cursor: pointer;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 6px;
}

.role-item:hover {
  background: #f8fafc;
}

.role-item.active {
  background: #eff6ff;
  border-color: #bfdbfe;
}

.perm-group :deep(.ant-checkbox-wrapper) {
  align-items: flex-start;
}

.perm-item {
  display: flex;
  gap: 8px;
  align-items: flex-start;
  padding: 8px 10px;
  cursor: pointer;
  border: 1px solid #eceef3;
  border-radius: 6px;
}

.perm-item.checked {
  background: #f8fbff;
  border-color: #d6e4ff;
}

.perm-item.readonly {
  cursor: default;
}

.perm-item.readonly
  :deep(.ant-checkbox-disabled.ant-checkbox-checked .ant-checkbox-inner),
.perm-group
  :deep(.ant-checkbox-disabled.ant-checkbox-checked .ant-checkbox-inner) {
  background-color: #2563eb;
  border-color: #2563eb;
  opacity: 0.55;
}

.perm-item.readonly
  :deep(.ant-checkbox-disabled.ant-checkbox-checked .ant-checkbox-inner::after),
.perm-group
  :deep(
    .ant-checkbox-disabled.ant-checkbox-checked .ant-checkbox-inner::after
  ) {
  border-color: #fff;
}
</style>
