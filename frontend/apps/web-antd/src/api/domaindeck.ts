import { requestClient } from '#/api/request';
import { Modal } from 'ant-design-vue';

const purchaseRequests = new Map<string, string>();
async function purchase(path: string, kind: string, data: Record<string, any>) {
  let domain = data.domain || decodeURIComponent(path.split('/')[2] || '');
  const years = kind === 'transfer' ? 1 : Number(data.years || 1);
  const quotePath = kind === 'transfer' ? '/transfer/quotes' : '/availability';
  const quote: any = await requestClient.get(quotePath, { params: { domain, years, connectionId: data.connectionId } });
  domain = quote.domain;
  const selected = quote.quotes?.find((item: any) => item.connectionId === data.connectionId) || quote.quotes?.find((item: any) => !item.error);
  const price = selected?.prices?.[kind];
  const cloudflareTransfer = kind === 'transfer' && selected?.provider === 'cloudflare';
  if (!selected || selected.error || (!price && !selected.unpriced && !cloudflareTransfer) || (cloudflareTransfer && selected.transferReady !== true)) throw new Error(selected?.transferBlockReason || '无法取得有效报价，请先检查服务商接入');
  const confirmed = await new Promise<boolean>((resolve) => Modal.confirm({
    title: `确认${({ register: '注册', renew: '续费', transfer: '转入' } as Record<string, string>)[kind]} ${domain}？`,
    content: price ? `${years} 年合计 ${price.currency} ${price.amount}。将使用服务商账户实际扣款，请核对域名与费用。` : cloudflareTransfer ? 'Cloudflare API 不提供转入报价。提交后会按 Cloudflare 实际转入费从默认支付方式扣款；费用不可退款，UK 系列通常零转入费。请先在 Cloudflare 账单及官方转入页面核实并确认。' : '此服务商未提供可验证报价。继续将按官方账户的实际价格扣款，请先在官方后台确认费用。',
    okText: '确认扣款并提交', cancelText: '取消', onOk: () => { resolve(true); }, onCancel: () => { resolve(false); },
  }));
  if (!confirmed) return { cancelled: true };
  const identity = `${kind}:${domain}:${selected.connectionId}:${years}`;
  const requestId = purchaseRequests.get(identity) || crypto.randomUUID();
  purchaseRequests.set(identity, requestId);
  const result: any = await requestClient.post(path, { ...data, domain, connectionId: selected.connectionId, years, confirm: true, requestId, expectedPrice: price, acceptUnpriced: !price && (selected.unpriced === true || cloudflareTransfer) });
  purchaseRequests.delete(identity);
  return { ...result, operationId: result.order?.operationId };
}

/* ---------------- 类型 ---------------- */
export interface Capabilities {
  registrar?: boolean;
  dns?: boolean;
  payments?: boolean;
  invoices?: boolean;
  register?: boolean;
  renew?: boolean;
  transfer?: boolean;
  authCode?: boolean;
  nameservers?: boolean;
}

export interface DomainItem {
  name: string;
  unicodeName: string;
  provider: string;
  connectionId: string;
  connectionName: string;
  autoRenew: boolean;
  registrationDate: string;
  expirationDate: string;
  lifecycleStatus: string;
  status?: string;
  nameservers: string[];
  locked: boolean;
  privacy: null | string;
  isPremium: boolean;
  can: Capabilities;
  zoneId: null | string;
  zoneConnectionId: null | string;
  daysLeft: null | number;
}

export interface ConnectionItem {
  id: string;
  provider: string;
  providerName: string;
  name: string;
  enabled: boolean;
  roles: string[];
  isDefault: boolean;
  credentials: Record<string, string>;
  capabilities: Capabilities;
  canHostDns: boolean;
  lastTestAt: null | string;
  lastTestOk: null | boolean;
  lastTestMessage: string;
}

export interface ProviderField {
  key: string;
  label: string;
  required?: boolean;
  secret?: boolean;
  placeholder?: string;
  kind?: string;
  default?: any;
  help?: string;
  url?: string;
}

export interface ProviderSetupStep {
  title: string;
  detail?: string;
  url?: string;
}

export interface OverviewResponse {
  at?: string;
  domains: {
    items: DomainItem[];
    total: number;
    errors?: { message: string; connectionName?: string }[];
  };
  zones?: {
    items: { id: string; name: string; status: string }[];
    total: number;
  };
  expiring: DomainItem[];
  audit?: {
    action: string;
    target: string;
    status: string;
    summary: string;
    ts: string;
  }[];
  orders?: { id: string; domain: string; currency?: string; amount?: number }[];
  stats: {
    registrars: number;
    dnsProviders: number;
    defaultPayment?: string;
    billingEnabled: boolean;
  };
}

export interface ProviderMeta {
  id: string;
  name: string;
  vendor: string;
  docs: string;
  roles: string[];
  canHostDns: boolean;
  capabilities: Capabilities;
  fields: ProviderField[];
  hint: string;
  builtin?: boolean;
  preset?: string;
  credentialsUrl?: string;
  setup?: ProviderSetupStep[];
}

export interface PaymentMethod {
  id: string;
  name: string;
  type: string;
  account: string;
  holder: string;
  expiry: string;
  isDefault: boolean;
  status: 'active' | 'disabled';
  note: string;
  source: 'cloudflare' | 'manual' | 'spaceship';
  editable: boolean;
  connectionName?: string;
  meta?: Record<string, any>;
}

/* ---------------- 概览 ---------------- */
export const getOverview = () =>
  requestClient.get<OverviewResponse>('/overview');

/* ---------------- 接入管理 ---------------- */
export const getProviders = () =>
  requestClient.get<{ items: ProviderMeta[]; paymentTypes: any[] }>(
    '/providers',
  );
/** 内置的声明式模板（Porkbun / GoDaddy / Namecheap） */
export const getProviderPresets = () =>
  requestClient.get<{ items: any[] }>('/providers/presets');
/** 运行时保存自定义注册商（不改代码、不重启） */
export const saveCustomProvider = (manifest: Record<string, any>) =>
  requestClient.post('/providers/custom', manifest);
export const validateCustomProvider = (manifest: Record<string, any>) =>
  requestClient.post('/providers/custom/validate', manifest);
export const getCustomProvider = (id: string) =>
  requestClient.get(`/providers/custom/${id}`);
export const deleteCustomProvider = (id: string) =>
  requestClient.delete(`/providers/custom/${id}`);
export const getConnections = () =>
  requestClient.get<{ items: ConnectionItem[] }>('/connections');
export const createConnection = (data: Record<string, any>) =>
  requestClient.post('/connections', data);
export const updateConnection = (id: string, data: Record<string, any>) =>
  requestClient.put(`/connections/${id}`, data);
export const deleteConnection = (id: string) =>
  requestClient.delete(`/connections/${id}`);
export const setDefaultConnection = (id: string) =>
  requestClient.post(`/connections/${id}/default`);
export const testConnection = (id: string) =>
  requestClient.post(`/connections/${id}/test`);
export const syncConnection = (id: string) => requestClient.post(`/connections/${id}/sync`);
export const syncRegistrarDomains = (id: string) => requestClient.post(`/connections/${id}/registrations`);
export const testAllConnections = () =>
  requestClient.post('/settings/test', {});

/* ---------------- 域名 ---------------- */
export const getDomains = () =>
  requestClient.get<{ items: DomainItem[]; total: number; errors: any[] }>(
    '/domains',
  );
export const getDomain = (domain: string, connectionId?: string) =>
  requestClient.get(
    `/domains/${domain}${connectionId ? `?connectionId=${connectionId}` : ''}`,
  );
export const renewDomain = (domain: string, data: Record<string, any>) =>
  purchase(`/domains/${domain}/renew`, 'renew', { ...data, domain });
export const setAutorenew = (
  domain: string,
  isEnabled: boolean,
  connectionId?: string,
) =>
  requestClient.put(`/domains/${domain}/autorenew`, {
    isEnabled,
    connectionId,
  });
export const setNameservers = (domain: string, data: Record<string, any>) =>
  requestClient.put(`/domains/${domain}/nameservers`, data);
export const setTransferLock = (
  domain: string,
  isLocked: boolean,
  connectionId?: string,
) =>
  requestClient.put(`/domains/${domain}/transfer-lock`, {
    isLocked,
    connectionId,
  });
export const getAuthCode = (domain: string, connectionId?: string) =>
  requestClient.get(
    `/domains/${domain}/auth-code${connectionId ? `?connectionId=${connectionId}` : ''}`,
  );
export const checkAvailability = (domain: string, connectionId?: string) =>
  requestClient.get(
    `/availability?domain=${encodeURIComponent(domain)}${connectionId ? `&connectionId=${connectionId}` : ''}`,
  );
export const registerDomain = (data: Record<string, any>) =>
  purchase('/register', 'register', data);
export const getTransferInfo = (domain: string, connectionId?: string) =>
  requestClient.get(`/transfer/${encodeURIComponent(domain)}`, { params: { connectionId } });
/** 各家注册商的转入报价与能力 */
export const getTransferQuotes = (domain: string) =>
  requestClient.get<{ domain: string; quotes: any[] }>(
    `/transfer/quotes?domain=${encodeURIComponent(domain)}`,
  );
/** 各接入的账户余额（能读到的才有 balance 字段） */
export const getBalances = () =>
  requestClient.get<{ items: any[] }>('/accounts/balances');
export const submitTransfer = (data: Record<string, any>) =>
  purchase('/transfer', 'transfer', data);
export const getOperation = (id: string) =>
  requestClient.get(`/operations/${id}`);

/* ---------------- 解析 ---------------- */
export const getDnsZones = () =>
  requestClient.get<{ items: any[]; total: number }>('/dns/zones');
export const getZoneRecords = (zoneId: string, params?: Record<string, any>) =>
  requestClient.get(`/dns/zones/${encodeURIComponent(zoneId)}/records`, {
    params,
  });
export const createRecord = (zoneId: string, data: Record<string, any>) =>
  requestClient.post(`/dns/zones/${encodeURIComponent(zoneId)}/records`, data);
export const updateRecord = (
  zoneId: string,
  recordId: string,
  data: Record<string, any>,
) =>
  requestClient.request(
    `/dns/zones/${encodeURIComponent(zoneId)}/records/${encodeURIComponent(recordId)}`,
    { method: 'PATCH', data },
  );
export const deleteRecord = (
  zoneId: string,
  recordId: string,
  params?: Record<string, any>,
) =>
  requestClient.delete(
    `/dns/zones/${encodeURIComponent(zoneId)}/records/${encodeURIComponent(recordId)}`,
    {
      params,
    },
  );
export const purgeZone = (zoneId: string, connectionId?: string) =>
  requestClient.post(`/dns/zones/${encodeURIComponent(zoneId)}/purge`, {
    connectionId,
  });
export const lookupDns = (name: string, type: string) =>
  requestClient.get(
    `/lookup?name=${encodeURIComponent(name)}&type=${encodeURIComponent(type)}`,
  );

/* ---------------- 设置与审计 ---------------- */
export const getSettings = () => requestClient.get('/settings');
export const saveSettings = (data: Record<string, any>) =>
  requestClient.put('/settings', data);
export const getAudit = (limit = 50) =>
  requestClient.get(`/audit?limit=${limit}`);
/** 运行状态：版本、数据目录、计数、接入健康 */
export const getSystemStatus = () => requestClient.get<any>('/system/status');
/** 当前版本、版本源与已缓存的检查结果 */
export const getUpdateInfo = () => requestClient.get<any>('/system/update');
/** 拉版本源，看有没有新版本 */
export const checkUpdate = () =>
  requestClient.post<any>('/system/update/check', {});
/** 下载并切换到校验后的程序版本，由 systemd 自动重启服务 */
export const applyUpdate = (data: { version?: string }) =>
  requestClient.post<any>('/system/update/apply', data);

/* ---------------- 账户 / 角色 ---------------- */
export const getAccounts = (keyword = '') =>
  requestClient.get<{ items: any[]; total: number }>(
    `/accounts?keyword=${encodeURIComponent(keyword)}`,
  );
export const createAccount = (data: Record<string, any>) =>
  requestClient.post('/accounts', data);
export const updateAccount = (id: string, data: Record<string, any>) =>
  requestClient.put(`/accounts/${id}`, data);
export const resetAccountPassword = (id: string, password: string) =>
  requestClient.post(`/accounts/${id}/password`, { password });
export const deleteAccount = (id: string) =>
  requestClient.delete(`/accounts/${id}`);

export const getRoles = () =>
  requestClient.get<{ items: any[]; total: number }>('/roles');
export const getPermissionCatalog = () =>
  requestClient.get<{ groups: any[]; all: string[] }>('/permissions');
export const createRole = (data: Record<string, any>) =>
  requestClient.post('/roles', data);
export const updateRole = (id: string, data: Record<string, any>) =>
  requestClient.put(`/roles/${id}`, data);
export const deleteRole = (id: string) => requestClient.delete(`/roles/${id}`);

/* ---------------- 支付 / 账单 ---------------- */
export const getPaymentTypes = () => requestClient.get<any[]>('/payment-types');
export const getPayments = () =>
  requestClient.get<{
    items: PaymentMethod[];
    synced: PaymentMethod[];
    manual: PaymentMethod[];
    notes: any[];
    defaultName: null | string;
    syncedAt: string;
  }>('/payments');
export const syncPayments = () => requestClient.post('/payments/sync', {});
export const createPayment = (data: Record<string, any>) =>
  requestClient.post('/payments', data);
export const updatePayment = (id: string, data: Record<string, any>) =>
  requestClient.put(`/payments/${id}`, data);
export const deletePayment = (id: string) =>
  requestClient.delete(`/payments/${id}`);
export const setDefaultPayment = (id: string) =>
  requestClient.post(`/payments/${id}/default`);
export const verifyPayment = (id?: string) =>
  requestClient.post('/payments/verify', { id });
export const getOrders = (domain = '') =>
  requestClient.get<{ items: any[]; total: number }>(
    `/orders?domain=${encodeURIComponent(domain)}`,
  );
export const updateOrder = (id: string, status: string) =>
  requestClient.put(`/orders/${id}`, { status });
/** 向注册商拉取这些订单的官方异步操作状态 */
export const syncOrders = () => requestClient.post<any>('/orders/sync', {});
export const syncOrder = (id: string) =>
  requestClient.post<any>(`/orders/${id}/sync`, {});
export const getInvoices = (limit = 50) =>
  requestClient.get<{ items: any[]; notes: any[] }>(`/invoices?limit=${limit}`);

/** 各服务商是否支持通过 API 读取支付方式 */
export const getPaymentCapabilities = () =>
  requestClient.get<any>('/payments/capabilities');
/** 用当前接入的真实凭据实测账单端点是否存在 */
export const probePaymentEndpoints = () =>
  requestClient.post<any>('/payments/probe', {});

/* ---------------- 通知 ---------------- */
export const getNotifications = () => requestClient.get('/notifications');
export const saveNotifications = (data: Record<string, any>) =>
  requestClient.put('/notifications', data);
export const testNotification = (channelId?: string) =>
  requestClient.post('/notifications/test', { channelId });
export const runExpiryCheck = (force = true) =>
  requestClient.post('/notifications/run', { force });
export const getNotificationLog = (limit = 30) =>
  requestClient.get(`/notifications/log?limit=${limit}`);

/* ---------------- 自己的密码 ---------------- */
export const changePassword = (data: Record<string, any>) =>
  requestClient.post('/auth/change-password', data);
