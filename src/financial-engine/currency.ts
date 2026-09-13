/** Convert a source-currency amount into the CLP base used by all aggregate calculations. */
export function amountInClp(value: number, currency: string, rates: Record<string, number>): number {
  if (!Number.isFinite(value)) throw new Error("El monto no es un número finito.");
  if (currency === "CLP") return value;
  const rate = rates[currency];
  if (!Number.isFinite(rate) || rate <= 0) throw new Error(`Falta una tasa válida para ${currency}. No se puede consolidar en CLP.`);
  const converted = value * rate;
  if (!Number.isFinite(converted)) throw new Error("El monto convertido excede el rango admitido.");
  return converted;
}
