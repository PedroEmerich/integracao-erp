import { describe, expect, it } from 'vitest';
import { formatCnpj, isValidCnpj, isValidCpf, isValidDocument, makeCnpj, onlyDigits } from './documents';

describe('CNPJ/CPF', () => {
  it('aceita CNPJ válido com e sem máscara', () => {
    expect(isValidCnpj('11.222.333/0001-81')).toBe(true);
    expect(isValidCnpj('11222333000181')).toBe(true);
  });
  it('rejeita dígito verificador errado, tamanho errado e sequências repetidas', () => {
    expect(isValidCnpj('11.222.333/0001-82')).toBe(false);
    expect(isValidCnpj('1122233300018')).toBe(false);
    expect(isValidCnpj('11.111.111/1111-11')).toBe(false);
    expect(isValidCnpj('')).toBe(false);
  });
  it('gera CNPJs válidos a partir da raiz', () => {
    for (const root of ['41382907', '10234567', '00000001', '99999998']) {
      const c = makeCnpj(root);
      expect(isValidCnpj(c)).toBe(true);
      expect(c).toMatch(/^\d{2}\.\d{3}\.\d{3}\/0001-\d{2}$/);
    }
  });
  it('valida CPF e escolhe o algoritmo pelo tamanho', () => {
    expect(isValidCpf('529.982.247-25')).toBe(true);
    expect(isValidCpf('529.982.247-26')).toBe(false);
    expect(isValidDocument('52998224725')).toBe(true);
    expect(isValidDocument('11.222.333/0001-81')).toBe(true);
  });
  it('formata e remove máscara', () => {
    expect(onlyDigits('11.222.333/0001-81')).toBe('11222333000181');
    expect(formatCnpj('11222333000181')).toBe('11.222.333/0001-81');
  });
});
