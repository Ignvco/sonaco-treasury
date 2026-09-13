export interface ExportRow {
  [key: string]: string | number;
}

export function toCSV(rows: ExportRow[]): string {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  const escape = (v: string | number) => {
    let s = String(v ?? "");
    if (typeof v === "string" && /^[\s]*[=+@\-\t\r]/.test(s)) s = "'" + s;
    return /[",\r\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [headers.map(escape).join(";"), ...rows.map((r) => headers.map((h) => escape(r[h])).join(";"))];
  return "\uFEFF" + lines.join("\r\n");
}

export function downloadFile(content: string, filename: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Native XLSX export. String cells are kept as text, never evaluated as formulas. */
export async function downloadExcel(rows: ExportRow[], filename: string): Promise<void> {
  const XLSX = await import("xlsx");
  const ws = XLSX.utils.json_to_sheet(rows);
  ws["!cols"] = Object.keys(rows[0] ?? {}).map((key) => ({ wch: Math.min(48, Math.max(16, key.length + 4)) }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Movimientos");
  XLSX.writeFile(wb, `${filename.replace(/\.xlsx$/i, "")}.xlsx`);
}
