<script lang="ts" setup>
import { computed, onMounted, reactive, ref, watch } from 'vue';

import { useAccess } from '@vben/access';
import Page from '#/components/deck-page.vue';

import {
  Button,
  Card,
  Empty,
  Input,
  InputNumber,
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

import { downloadCsv, stamped } from '#/utils/csv';

import {
  createRecord,
  deleteRecord,
  getDnsZones,
  getZoneRecords,
  lookupDns,
  purgeZone,
  updateRecord,
} from '#/api/domaindeck';

const { hasAccessByCodes } = useAccess();
const canWrite = computed(() => hasAccessByCodes(['dns:write']));

const loading = ref(false);
const zones = ref<any[]>([]);
const zoneId = ref<string>('');
const records = ref<any[]>([]);
const providerFilter = ref<string | undefined>();
const zoneKeyword = ref('');
const typeFilter = ref<string | undefined>();
const keyword = ref('');
const selectedKeys = ref<string[]>([]);
const batchBusy = ref(false);

const rowSelection = computed(() =>
  canWrite.value
    ? {
        selectedRowKeys: selectedKeys.value,
        onChange: (keys: (number | string)[]) => {
          selectedKeys.value = keys.map(String);
        },
        getCheckboxProps: (record: any) => ({ disabled: !record.id }),
      }
    : undefined,
);

const selectedRecords = computed(() =>
  records.value.filter(
    (r) => r.id && selectedKeys.value.includes(String(r.id)),
  ),
);

const modalOpen = ref(false);
const modalSaving = ref(false);
const editing = ref<any>(null);
const form = reactive<any>({
  type: 'A',
  name: '',
  content: '',
  ttl: 1,
  priority: 10,
  proxied: false,
  comment: '',
  data: {},
});

const lookupOpen = ref(false);
const lookupName = ref('');
const lookupType = ref('A');
const lookupResult = ref<any>(null);

const CF_TYPES = [
  'A',
  'AAAA',
  'CNAME',
  'MX',
  'TXT',
  'NS',
  'SRV',
  'CAA',
  'PTR',
  'TLSA',
  'HTTPS',
];
const SP_TYPES = [
  'A',
  'AAAA',
  'CNAME',
  'MX',
  'TXT',
  'NS',
  'SRV',
  'CAA',
  'ALIAS',
  'PTR',
];

const TTL_OPTIONS = [
  { label: '自动', value: 1 },
  { label: '1 分钟', value: 60 },
  { label: '5 分钟', value: 300 },
  { label: '10 分钟', value: 600 },
  { label: '30 分钟', value: 1800 },
  { label: '1 小时', value: 3600 },
  { label: '2 小时', value: 7200 },
  { label: '12 小时', value: 43_200 },
  { label: '1 天', value: 86_400 },
];

const activeZone = computed(() =>
  zones.value.find((z) => z.id === zoneId.value),
);
const isCloudflare = computed(
  () => activeZone.value?.provider === 'cloudflare',
);
const zoneTypes = computed(() => (isCloudflare.value ? CF_TYPES : SP_TYPES));

const visibleZones = computed(() => {
  let list = zones.value;
  if (providerFilter.value)
    list = list.filter((z) => z.provider === providerFilter.value);
  const kw = zoneKeyword.value.trim().toLowerCase();
  if (kw) list = list.filter((z) => z.name.toLowerCase().includes(kw));
  return list;
});

async function loadZones() {
  loading.value = true;
  try {
    const res: any = await getDnsZones();
    zones.value = res.items || [];
    if (!zones.value.some((z) => z.id === zoneId.value)) {
      zoneId.value = zones.value[0]?.id || '';
    }
  } finally {
    loading.value = false;
  }
}

async function loadRecords() {
  if (!zoneId.value) {
    records.value = [];
    return;
  }
  loading.value = true;
  try {
    const res: any = await getZoneRecords(zoneId.value, {
      type: typeFilter.value || undefined,
      search: keyword.value || undefined,
      connectionId: activeZone.value?.connectionId,
    });
    records.value = res.items || [];
    selectedKeys.value = [];
  } finally {
    loading.value = false;
  }
}

async function reload() {
  await loadZones();
  await loadRecords();
}

onMounted(reload);

watch(zoneId, () => {
  keyword.value = '';
  typeFilter.value = undefined;
  selectedKeys.value = [];
  loadRecords();
});

function shortName(full: string) {
  const zone = activeZone.value?.name;
  if (!full || !zone) return full || '@';
  if (full === zone) return '@';
  return full.endsWith(`.${zone}`) ? full.slice(0, -(zone.length + 1)) : full;
}

function fullName(part: string) {
  const zone = activeZone.value?.name;
  if (!part || part === '@') return zone;
  return part.endsWith(zone) ? part : `${part}.${zone}`;
}

function openCreate() {
  if (!zoneId.value) {
    message.warning('还没有可用的解析区域');
    return;
  }
  editing.value = null;
  Object.assign(form, {
    type: 'A',
    name: '',
    content: '',
    ttl: isCloudflare.value ? 1 : 3600,
    priority: 10,
    proxied: false,
    comment: '',
    data: {
      priority: 0,
      weight: 5,
      port: 443,
      target: '',
      flags: 0,
      tag: 'issue',
      value: '',
      usage: 2,
      selector: 1,
      matching: 1,
      certificate: '',
    },
  });
  modalOpen.value = true;
}

function openEdit(record: any) {
  editing.value = record;
  Object.assign(form, {
    type: record.type,
    name: isCloudflare.value ? shortName(record.name) : record.name,
    content: record.content || '',
    ttl: record.ttl || (isCloudflare.value ? 1 : 3600),
    priority: record.priority ?? 10,
    proxied: Boolean(record.proxied),
    comment: record.comment || '',
    data: { ...(record.data || {}), ...(record.raw || {}) },
  });
  modalOpen.value = true;
}

async function save() {
  if (!form.name) {
    message.warning('请填写记录名称');
    return;
  }
  if (
    !['SRV', 'CAA', 'TLSA', 'HTTPS', 'SVCB'].includes(form.type) &&
    !form.content
  ) {
    message.warning('请填写记录内容');
    return;
  }
  modalSaving.value = true;
  try {
    if (isCloudflare.value) {
      const payload: any = {
        type: form.type,
        name: fullName(form.name),
        ttl: form.ttl,
        comment: form.comment || undefined,
        connectionId: activeZone.value?.connectionId,
      };
      if (['A', 'AAAA', 'CNAME', 'NS', 'PTR', 'TXT'].includes(form.type))
        payload.content = form.content;
      if (form.type === 'MX') {
        payload.content = form.content;
        payload.priority = form.priority;
      }
      if (['A', 'AAAA', 'CNAME'].includes(form.type))
        payload.proxied = form.proxied;
      if (form.type === 'SRV') {
        payload.data = {
          priority: Number(form.data.priority ?? 0),
          weight: Number(form.data.weight ?? 0),
          port: Number(form.data.port ?? 0),
          target: form.data.target,
        };
      }
      if (form.type === 'CAA') {
        payload.data = {
          flags: Number(form.data.flags ?? 0),
          tag: form.data.tag,
          value: form.data.value,
        };
      }
      if (form.type === 'TLSA') {
        payload.data = {
          usage: Number(form.data.usage ?? 0),
          selector: Number(form.data.selector ?? 0),
          matching: Number(form.data.matching ?? 0),
          certificate: form.data.certificate,
        };
      }
      if (form.type === 'HTTPS') {
        payload.data = {
          priority: Number(form.data.priority ?? 1),
          target: form.data.target || '.',
          value: form.data.value || '',
        };
      }
      if (editing.value)
        await updateRecord(zoneId.value, editing.value.id, payload);
      else await createRecord(zoneId.value, payload);
    } else {
      const payload: any = {
        type: form.type,
        name: form.name === '@' ? '@' : form.name,
        content: form.content,
        ttl: form.ttl,
        priority: form.priority,
        connectionId: activeZone.value?.connectionId,
        ...form.data,
      };
      if (editing.value) {
        payload.original = editing.value.raw;
        await updateRecord(zoneId.value, editing.value.id, payload);
      } else {
        await createRecord(zoneId.value, payload);
      }
    }
    message.success('记录已保存');
    modalOpen.value = false;
    await loadRecords();
  } finally {
    modalSaving.value = false;
  }
}

async function remove(record: any) {
  await deleteRecord(zoneId.value, record.id, {
    connectionId: activeZone.value?.connectionId,
    record: record.raw
      ? encodeURIComponent(JSON.stringify(record.raw))
      : undefined,
  });
  message.success('记录已删除');
  loadRecords();
}

async function removeSelected() {
  const targets = selectedRecords.value;
  if (!targets.length) return;
  batchBusy.value = true;
  const key = 'batch-delete';
  let ok = 0;
  const failed: string[] = [];
  try {
    for (const [i, record] of targets.entries()) {
      message.loading({
        content: `正在删除 ${i + 1}/${targets.length}…`,
        key,
        duration: 0,
      });
      try {
        await deleteRecord(zoneId.value, record.id, {
          connectionId: activeZone.value?.connectionId,
          record: record.raw
            ? encodeURIComponent(JSON.stringify(record.raw))
            : undefined,
        });
        ok += 1;
      } catch {
        failed.push(shortName(record.name));
      }
    }
    if (failed.length) {
      message.warning({
        content: `删除 ${ok} 条，${failed.length} 条失败：${failed.slice(0, 3).join('、')}`,
        key,
        duration: 5,
      });
    } else {
      message.success({ content: `已删除 ${ok} 条记录`, key, duration: 2 });
    }
    await loadRecords();
  } finally {
    batchBusy.value = false;
  }
}

function exportRecords() {
  const zone = activeZone.value?.name || 'zone';
  const headers = ['类型', '名称', '内容', 'TTL', '代理', '备注'];
  const rows = records.value.map((r) => [
    r.type,
    shortName(r.name),
    r.content || '',
    r.ttl === 1 ? '自动' : `${r.ttl}s`,
    r.proxiable ? (r.proxied ? '已代理' : '仅 DNS') : '不支持',
    r.comment || '',
  ]);
  downloadCsv(stamped(`dns-${zone}`), headers, rows);
  message.success(`已导出 ${rows.length} 条记录`);
}

async function toggleProxy(record: any, checked: boolean) {
  record.proxied = checked;
  try {
    await updateRecord(zoneId.value, record.id, {
      type: record.type,
      name: record.name,
      content: record.content,
      ttl: record.ttl,
      proxied: checked,
      connectionId: activeZone.value?.connectionId,
    });
    message.success(
      `${shortName(record.name)} 已${checked ? '开启' : '关闭'}代理`,
    );
  } catch {
    record.proxied = !checked;
  }
}

async function doPurge() {
  await purgeZone(zoneId.value, activeZone.value?.connectionId);
  message.success('缓存已清除');
}

async function doLookup() {
  lookupResult.value = null;
  lookupResult.value = await lookupDns(lookupName.value, lookupType.value);
}

function openLookup(record?: any) {
  lookupName.value = record ? record.name : activeZone.value?.name || '';
  lookupType.value = record?.type && record.type !== 'PTR' ? record.type : 'A';
  lookupResult.value = null;
  lookupOpen.value = true;
}

const columns = computed(() => [
  { title: '类型', key: 'type', width: 90 },
  { title: '名称', key: 'name', width: 180 },
  { title: '内容', key: 'content' },
  ...(isCloudflare.value ? [{ title: '代理', key: 'proxy', width: 100 }] : []),
  { title: 'TTL', key: 'ttl', width: 90 },
  { title: '操作', key: 'action', width: 130, align: 'right' as const },
]);

const typeStats = computed(() => {
  const map: Record<string, number> = {};
  records.value.forEach((r) => {
    map[r.type] = (map[r.type] || 0) + 1;
  });
  return map;
});

const providerOptions = computed(() => {
  const map = new Map<string, string>();
  zones.value.forEach((z) =>
    map.set(
      z.provider,
      z.provider === 'cloudflare' ? 'Cloudflare' : 'Spaceship',
    ),
  );
  return [...map.entries()].map(([value, label]) => ({ value, label }));
});
</script>

<template>
  <Page
    description="Cloudflare 与 Spaceship 解析统一管理，按区域自动切换"
    title="DNS 解析"
  >
    <template #extra>
      <Space>
        <Button :loading="loading" @click="reload">刷新</Button>
        <Button :disabled="!zoneId" @click="openLookup()">检查生效</Button>
        <Button v-if="isCloudflare" :disabled="!canWrite" @click="doPurge"
          >清除缓存</Button
        >
        <Button
          type="primary"
          :disabled="!canWrite || !zoneId"
          @click="openCreate"
          >新增记录</Button
        >
      </Space>
    </template>

    <div class="flex gap-4">
      <Card
        :bordered="true"
        class="w-[260px] shrink-0"
        :body-style="{ padding: '10px' }"
      >
        <Input
          v-model:value="zoneKeyword"
          allow-clear
          placeholder="搜索域名"
          size="small"
          class="mb-2"
        />
        <Select
          v-model:value="providerFilter"
          allow-clear
          size="small"
          placeholder="全部服务商"
          class="mb-2 w-full"
          :options="providerOptions"
        />
        <div class="max-h-[calc(100vh-320px)] overflow-auto">
          <button
            v-for="z in visibleZones"
            :key="z.id"
            class="zone-item"
            :class="{ active: z.id === zoneId }"
            @click="zoneId = z.id"
          >
            <span class="zone-name">{{ z.name }}</span>
            <span class="zone-meta">
              <Tag
                :color="z.status === 'active' ? 'green' : 'orange'"
                class="mr-0"
                >{{ z.status }}</Tag
              >
              <span class="truncate">{{
                z.provider === 'cloudflare' ? 'Cloudflare' : 'Spaceship'
              }}</span>
            </span>
          </button>
          <Empty
            v-if="!visibleZones.length && !loading"
            :image="Empty.PRESENTED_IMAGE_SIMPLE"
            description="没有区域"
          />
        </div>
      </Card>

      <Card :bordered="true" class="min-w-0 flex-1">
        <template #title>
          <div class="flex flex-wrap items-center gap-2">
            <span class="font-mono text-sm">{{
              activeZone?.name || '未选择区域'
            }}</span>
            <Tag
              v-if="activeZone"
              :color="activeZone.status === 'active' ? 'green' : 'orange'"
              class="mr-0"
            >
              {{ activeZone.status }}
            </Tag>
            <Tag v-if="activeZone" class="mr-0">{{
              activeZone.connectionName
            }}</Tag>
            <Tag v-if="activeZone && !isCloudflare" class="mr-0"
              >Spaceship 基础解析</Tag
            >
          </div>
        </template>
        <template #extra>
          <span class="text-xs text-slate-400">
            {{ records.length }} 条
            <template v-if="Object.keys(typeStats).length">
              ·
              <span v-for="(count, type) in typeStats" :key="type" class="ml-1"
                >{{ type }} {{ count }}</span
              >
            </template>
          </span>
        </template>

        <div class="mb-3 space-y-2">
          <div class="flex flex-wrap items-center gap-2">
            <Input
              v-model:value="keyword"
              allow-clear
              placeholder="搜索名称或内容"
              class="min-w-0 flex-1"
              style="max-width: 240px"
              @press-enter="loadRecords"
            />
            <Select
              v-model:value="typeFilter"
              allow-clear
              placeholder="全部类型"
              style="width: 124px; flex: none"
              :options="zoneTypes.map((t) => ({ label: t, value: t }))"
              @change="loadRecords"
            />
            <Button :loading="loading" @click="loadRecords">查询</Button>
            <Button :disabled="!records.length" @click="exportRecords"
              >导出</Button
            >
            <span class="ml-auto text-xs text-slate-400"
              >{{ records.length }} 条记录</span
            >
          </div>

          <div
            v-if="canWrite && selectedRecords.length"
            class="flex flex-wrap items-center gap-2 rounded border border-blue-100 px-3 py-1.5"
            style="background: #f2f7ff"
          >
            <span class="text-xs text-slate-600"
              >已选 {{ selectedRecords.length }} 条</span
            >
            <div class="ml-auto flex items-center gap-2">
              <Button size="small" @click="selectedKeys = []">取消选择</Button>
              <Popconfirm
                :title="`确认删除选中的 ${selectedRecords.length} 条记录？删除后不可恢复`"
                ok-text="删除"
                cancel-text="取消"
                @confirm="removeSelected"
              >
                <Button danger size="small" :loading="batchBusy"
                  >批量删除</Button
                >
              </Popconfirm>
            </div>
          </div>
        </div>

        <Table
          :columns="columns"
          :data-source="records"
          :loading="loading"
          :pagination="false"
          :row-key="(r: any) => r.id || r.raw?.type + r.name + r.content"
          :row-selection="rowSelection"
          size="small"
        >
          <template #bodyCell="{ column, record }">
            <template v-if="column.key === 'type'">
              <span class="type-chip" :class="record.type">{{
                record.type
              }}</span>
            </template>
            <template v-else-if="column.key === 'name'">
              <span class="font-mono text-[12.5px]">{{
                shortName(record.name)
              }}</span>
            </template>
            <template v-else-if="column.key === 'content'">
              <div
                class="truncate font-mono text-[12.5px] text-slate-600"
                style="max-width: 380px"
                :title="record.content"
              >
                {{ record.content }}
              </div>
              <div v-if="record.comment" class="text-xs text-slate-400">
                {{ record.comment }}
              </div>
              <div
                v-if="record.type === 'SRV' && record.data"
                class="text-xs text-slate-400"
              >
                {{ record.data.priority }} {{ record.data.weight }}
                {{ record.data.port }} {{ record.data.target }}
              </div>
            </template>
            <template v-else-if="column.key === 'proxy'">
              <Tooltip
                :title="
                  record.proxiable ? '点击切换代理状态' : '该类型不支持代理'
                "
              >
                <Tag
                  class="mr-0"
                  :color="record.proxied ? 'orange' : 'default'"
                  :style="{
                    cursor:
                      record.proxiable && canWrite ? 'pointer' : 'not-allowed',
                  }"
                  @click="
                    record.proxiable &&
                    canWrite &&
                    toggleProxy(record, !record.proxied)
                  "
                >
                  {{ record.proxied ? '已代理' : '仅 DNS' }}
                </Tag>
              </Tooltip>
            </template>
            <template v-else-if="column.key === 'ttl'">
              <span class="text-xs text-slate-500">{{
                record.ttl === 1 ? '自动' : `${record.ttl}s`
              }}</span>
            </template>
            <template v-else-if="column.key === 'action'">
              <Space :size="2">
                <Button size="small" type="link" @click="openLookup(record)"
                  >检查</Button
                >
                <Button
                  size="small"
                  type="link"
                  :disabled="!canWrite"
                  @click="openEdit(record)"
                  >编辑</Button
                >
                <Popconfirm
                  title="确认删除这条记录？"
                  ok-text="删除"
                  cancel-text="取消"
                  @confirm="remove(record)"
                >
                  <Button size="small" type="link" danger :disabled="!canWrite"
                    >删除</Button
                  >
                </Popconfirm>
              </Space>
            </template>
          </template>
        </Table>
        <Empty
          v-if="!records.length && !loading"
          :image="Empty.PRESENTED_IMAGE_SIMPLE"
          description="该区域还没有解析记录"
        />
      </Card>
    </div>

    <Modal
      v-model:open="modalOpen"
      :confirm-loading="modalSaving"
      :title="editing ? '编辑解析记录' : '新增解析记录'"
      ok-text="保存"
      width="640px"
      @ok="save"
    >
      <div class="grid grid-cols-2 gap-3 pt-2">
        <div>
          <div class="mb-1 text-xs text-slate-500">记录类型</div>
          <Select
            v-model:value="form.type"
            :disabled="Boolean(editing)"
            style="width: 100%"
            :options="zoneTypes.map((t) => ({ label: t, value: t }))"
          />
        </div>
        <div>
          <div class="mb-1 text-xs text-slate-500">名称</div>
          <Input v-model:value="form.name" placeholder="@ 或 www" />
          <div class="mt-1 text-xs text-slate-400">
            {{
              isCloudflare
                ? `完整名称：${fullName(form.name) || '—'}`
                : '相对名称，@ 表示根域名'
            }}
          </div>
        </div>

        <div
          v-if="
            ['A', 'AAAA', 'CNAME', 'NS', 'PTR', 'ALIAS'].includes(form.type)
          "
          class="col-span-2"
        >
          <div class="mb-1 text-xs text-slate-500">
            {{
              form.type === 'A'
                ? 'IPv4 地址'
                : form.type === 'AAAA'
                  ? 'IPv6 地址'
                  : '目标地址'
            }}
          </div>
          <Input v-model:value="form.content" placeholder="76.76.21.21" />
        </div>

        <div v-if="form.type === 'TXT'" class="col-span-2">
          <div class="mb-1 text-xs text-slate-500">记录值</div>
          <Input.TextArea
            v-model:value="form.content"
            :rows="3"
            placeholder="v=spf1 include:_spf.example.com ~all"
          />
        </div>

        <template v-if="form.type === 'MX'">
          <div>
            <div class="mb-1 text-xs text-slate-500">优先级</div>
            <InputNumber
              v-model:value="form.priority"
              :min="0"
              :max="65_535"
              style="width: 100%"
            />
          </div>
          <div>
            <div class="mb-1 text-xs text-slate-500">邮件服务器</div>
            <Input
              v-model:value="form.content"
              placeholder="mail.example.com"
            />
          </div>
        </template>

        <template v-if="form.type === 'SRV'">
          <div>
            <div class="mb-1 text-xs text-slate-500">优先级</div>
            <InputNumber
              v-model:value="form.data.priority"
              :min="0"
              style="width: 100%"
            />
          </div>
          <div>
            <div class="mb-1 text-xs text-slate-500">权重</div>
            <InputNumber
              v-model:value="form.data.weight"
              :min="0"
              style="width: 100%"
            />
          </div>
          <div>
            <div class="mb-1 text-xs text-slate-500">端口</div>
            <InputNumber
              v-model:value="form.data.port"
              :min="0"
              style="width: 100%"
            />
          </div>
          <div>
            <div class="mb-1 text-xs text-slate-500">目标主机</div>
            <Input
              v-model:value="form.data.target"
              placeholder="srv.example.com"
            />
          </div>
        </template>

        <template v-if="form.type === 'CAA'">
          <div>
            <div class="mb-1 text-xs text-slate-500">标记</div>
            <InputNumber
              v-model:value="form.data.flags"
              :min="0"
              :max="255"
              style="width: 100%"
            />
          </div>
          <div>
            <div class="mb-1 text-xs text-slate-500">标签</div>
            <Select
              v-model:value="form.data.tag"
              style="width: 100%"
              :options="
                ['issue', 'issuewild', 'iodef'].map((v) => ({
                  label: v,
                  value: v,
                }))
              "
            />
          </div>
          <div class="col-span-2">
            <div class="mb-1 text-xs text-slate-500">记录值</div>
            <Input
              v-model:value="form.data.value"
              placeholder="letsencrypt.org"
            />
          </div>
        </template>

        <template v-if="form.type === 'TLSA'">
          <div>
            <div class="mb-1 text-xs text-slate-500">用途</div>
            <InputNumber
              v-model:value="form.data.usage"
              :min="0"
              style="width: 100%"
            />
          </div>
          <div>
            <div class="mb-1 text-xs text-slate-500">选择器</div>
            <InputNumber
              v-model:value="form.data.selector"
              :min="0"
              style="width: 100%"
            />
          </div>
          <div>
            <div class="mb-1 text-xs text-slate-500">匹配方式</div>
            <InputNumber
              v-model:value="form.data.matching"
              :min="0"
              style="width: 100%"
            />
          </div>
          <div class="col-span-2">
            <div class="mb-1 text-xs text-slate-500">证书关联数据</div>
            <Input v-model:value="form.data.certificate" />
          </div>
        </template>

        <template v-if="form.type === 'HTTPS'">
          <div>
            <div class="mb-1 text-xs text-slate-500">优先级</div>
            <InputNumber
              v-model:value="form.data.priority"
              :min="0"
              style="width: 100%"
            />
          </div>
          <div>
            <div class="mb-1 text-xs text-slate-500">目标</div>
            <Input v-model:value="form.data.target" placeholder="." />
          </div>
          <div class="col-span-2">
            <div class="mb-1 text-xs text-slate-500">参数</div>
            <Input v-model:value="form.data.value" placeholder="alpn=h2,h3" />
          </div>
        </template>

        <div>
          <div class="mb-1 text-xs text-slate-500">TTL</div>
          <Select
            v-model:value="form.ttl"
            style="width: 100%"
            :options="
              isCloudflare
                ? TTL_OPTIONS
                : TTL_OPTIONS.filter((o) => o.value >= 60 && o.value <= 3600)
            "
          />
        </div>

        <div v-if="isCloudflare && ['A', 'AAAA', 'CNAME'].includes(form.type)">
          <div class="mb-1 text-xs text-slate-500">Cloudflare 代理</div>
          <div class="flex h-8 items-center gap-2">
            <Switch v-model:checked="form.proxied" />
            <span class="text-xs text-slate-500">{{
              form.proxied ? '已代理' : '仅 DNS'
            }}</span>
          </div>
        </div>

        <div v-if="isCloudflare" class="col-span-2">
          <div class="mb-1 text-xs text-slate-500">备注（选填）</div>
          <Input
            v-model:value="form.comment"
            placeholder="例如：主站、邮箱验证"
          />
        </div>
      </div>
      <div class="mt-3 flex flex-wrap gap-1.5">
        <span class="text-xs text-slate-400">快速填充：</span>
        <Button
          size="small"
          @click="
            form.type = 'A';
            form.name = '@';
            form.content = '76.76.21.21';
          "
          >A 记录</Button
        >
        <Button
          size="small"
          @click="
            form.type = 'CNAME';
            form.name = 'www';
            form.content = activeZone?.name;
          "
          >www CNAME</Button
        >
        <Button
          size="small"
          @click="
            form.type = 'TXT';
            form.name = '@';
            form.content = 'v=spf1 -all';
          "
          >SPF</Button
        >
        <Button
          size="small"
          @click="
            form.type = 'MX';
            form.name = '@';
            form.content = activeZone?.name;
          "
          >MX</Button
        >
      </div>
    </Modal>

    <Modal
      v-model:open="lookupOpen"
      :footer="null"
      title="检查解析是否生效"
      width="560px"
    >
      <div class="space-y-3 pt-2">
        <div class="flex gap-2">
          <Input v-model:value="lookupName" placeholder="完整域名" />
          <Select
            v-model:value="lookupType"
            style="width: 110px"
            :options="
              ['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'NS'].map((t) => ({
                label: t,
                value: t,
              }))
            "
          />
          <Button type="primary" @click="doLookup">查询</Button>
        </div>
        <div
          v-if="lookupResult"
          class="rounded border px-3 py-2 text-xs"
          :class="
            lookupResult.error
              ? 'border-amber-200 bg-amber-50 text-amber-800'
              : 'border-emerald-200 bg-emerald-50 text-emerald-800'
          "
        >
          <div class="mb-1">
            {{
              lookupResult.error
                ? `未查询到记录：${lookupResult.error}`
                : `解析结果（${lookupResult.resolver}）`
            }}
          </div>
          <pre class="whitespace-pre-wrap font-mono text-[12px]">{{
            JSON.stringify(
              lookupResult.error ? [] : lookupResult.answer,
              null,
              2,
            )
          }}</pre>
        </div>
        <div v-else class="text-xs text-slate-400">
          使用本机递归 DNS 查询，可与上面表格中的记录对比。
        </div>
      </div>
    </Modal>
  </Page>
</template>

<style scoped>
.zone-item {
  display: flex;
  flex-direction: column;
  gap: 3px;
  width: 100%;
  padding: 8px 10px;
  margin-bottom: 2px;
  text-align: left;
  cursor: pointer;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 6px;
}

.zone-item:hover {
  background: #f8fafc;
}

.zone-item.active {
  background: #eff6ff;
  border-color: #bfdbfe;
}

.zone-name {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12.5px;
  font-weight: 500;
  color: #0f172a;
}

.zone-meta {
  display: flex;
  gap: 6px;
  align-items: center;
  font-size: 11px;
  color: #94a3b8;
}

.type-chip {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 44px;
  padding: 0 6px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 10.5px;
  font-weight: 600;
  color: #334155;
  background: #f1f5f9;
  border-radius: 4px;
}

.type-chip.A,
.type-chip.AAAA {
  color: #1d4ed8;
  background: #e8f0fe;
}

.type-chip.CNAME {
  color: #6d28d9;
  background: #f1eafe;
}

.type-chip.MX {
  color: #b45309;
  background: #fef3e2;
}

.type-chip.TXT {
  color: #047857;
  background: #e9f7f0;
}

.type-chip.NS {
  color: #0f766e;
  background: #e7f5f4;
}

.type-chip.SRV,
.type-chip.CAA,
.type-chip.TLSA,
.type-chip.HTTPS {
  color: #be123c;
  background: #fdecf1;
}
</style>
