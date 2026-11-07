/**
 * 轻量 CSV 导出：不引第三方库，直接拼文本 + Blob 下载。
 * - 加 BOM，Excel 打开中文不乱码
 * - 转义引号、逗号、换行
 * - 值以 = + - 开头时前置单引号，避免被当成公式执行（@ 保留，DNS 根域名要用）
 */
export type CsvCell = number | string | null | undefined;

function escapeCell(value: CsvCell): string {
  if (value === null || value === undefined) return '';
  let text = String(value);
  // 只挡真正会被当成公式的前缀；@ 在 DNS 里表示根域名，不能加引号
  if (/^\s*[=+\-@]/.test(text) && text !== '@') text = `'${text}`;
  if (/[",\n\r]/.test(text)) text = `"${text.replace(/"/g, '""')}"`;
  return text;
}

export function toCsv(headers: string[], rows: CsvCell[][]): string {
  const lines = [headers.map(escapeCell).join(','), ...rows.map((r) => r.map(escapeCell).join(','))];
  return lines.join('\r\n');
}

export function downloadCsv(filename: string, headers: string[], rows: CsvCell[][]) {
  const csv = toCsv(headers, rows);
  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** 文件名带日期后缀，避免多次导出互相覆盖 */
export function stamped(prefix: string, ext = 'csv') {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${prefix}-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}.${ext}`;
}
