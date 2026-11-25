// Validação e formatação de CNPJ e CPF (algoritmo oficial dos dígitos verificadores).

export function onlyDigits(value: string): string {
  return String(value ?? '').replace(/\D+/g, '');
}

function cnpjCheckDigit(base: string): number {
  const weights =
    base.length === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const sum = base.split('').reduce((acc, d, i) => acc + Number(d) * weights[i], 0);
  const rest = sum % 11;
  return rest < 2 ? 0 : 11 - rest;
}

export function isValidCnpj(value: string): boolean {
  const d = onlyDigits(value);
  if (d.length !== 14 || /^(\d)\1+$/.test(d)) return false;
  const d1 = cnpjCheckDigit(d.slice(0, 12));
  const d2 = cnpjCheckDigit(d.slice(0, 12) + d1);
  return d.endsWith(`${d1}${d2}`);
}

export function isValidCpf(value: string): boolean {
  const d = onlyDigits(value);
  if (d.length !== 11 || /^(\d)\1+$/.test(d)) return false;
  const calc = (len: number) => {
    let sum = 0;
    for (let i = 0; i < len; i++) sum += Number(d[i]) * (len + 1 - i);
    const r = (sum * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return calc(9) === Number(d[9]) && calc(10) === Number(d[10]);
}

export function isValidDocument(value: string): boolean {
  const d = onlyDigits(value);
  return d.length === 11 ? isValidCpf(d) : isValidCnpj(d);
}

export function formatCnpj(value: string): string {
  const d = onlyDigits(value).padStart(14, '0').slice(0, 14);
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

/** Gera um CNPJ válido a partir de 8 dígitos de raiz (matriz 0001). */
export function makeCnpj(root8: string, branch = '0001'): string {
  const base = (onlyDigits(root8).padStart(8, '0').slice(0, 8) + branch).slice(0, 12);
  const d1 = cnpjCheckDigit(base);
  const d2 = cnpjCheckDigit(base + d1);
  return formatCnpj(base + d1 + d2);
}
