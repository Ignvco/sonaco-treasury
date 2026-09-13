export type StatusTone = "success" | "warning" | "danger" | "info" | "muted";

/** Map a domain status string to a semantic tone. */
export function statusTone(status: string): StatusTone {
  const s = status.toLowerCase();
  if (["conciliado", "pagado", "confirmado", "activo", "ok", "vigente", "rescatada"].includes(s))
    return "success";
  if (s === "programado" || s === "por_vencer") return "info";
  if (s === "borrador") return "muted";
  if (["pendiente", "vence_pronto", "revisar"].includes(s)) return "warning";
  if (["vencido", "cancelado"].includes(s)) return "danger";
  return "info";
}
