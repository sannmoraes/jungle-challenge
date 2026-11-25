import { describe, expect, test } from "bun:test";
import { Money } from "./money";

describe("Money", () => {
  test("toString formata centavos com 2 casas", () => {
    expect(Money.fromCents(8005n, "BRL").toString()).toBe("80.05");
  });

  test("add soma e não altera o original", () => {
    const a = Money.fromCents(1000n, "BRL");
    const b = Money.fromCents(250n, "BRL");
    const total = a.add(b);
    expect(total.toString()).toBe("12.50");
    expect(a.toString()).toBe("10.00");
  });

  test("subtract que deixaria negativo lança erro", () => {
    const a = Money.fromCents(100n, "BRL");
    const b = Money.fromCents(500n, "BRL");
    expect(() => a.subtract(b)).toThrow("Resulting money cannot be negative");
  });

    test("add com moedas diferentes lança erro", () => {
    const a = Money.fromCents(100n, "BRL");
    const b = Money.fromCents(100n, "USD");
    expect(() => a.add(b)).toThrow("Currency mismatch");
  });

    test("fromCents com moeda inválida lança erro", () => {
    expect(() => Money.fromCents(100n, "xyz")).toThrow("Invalid currency");
  });

    test("fromString converte texto em centavos sem usar number", () => {
    const m = Money.fromString("80.00", "BRL");
    expect(m.cents).toBe(8000n);
    expect(m.currency).toBe("BRL");
  });

  test("fromString rejeita formatos inválidos", () => {
    const invalidos = ["80", "80.5", "80.001", "abc", "-1.00", "", " 80.00", "80.00 ", "1e3", "80,00", ".50"];
    for (const texto of invalidos) {
      expect(() => Money.fromString(texto, "BRL")).toThrow("Invalid amount");
    }
  });

  test("fromString com moeda inválida lança erro", () => {
    expect(() => Money.fromString("80.00", "xyz")).toThrow("Invalid currency");
  });

  test("fromString preserva valor que estoura number", () => {
    const m = Money.fromString("90071992547409.93", "BRL");
    expect(m.cents).toBe(9007199254740993n);
    expect(m.toString()).toBe("90071992547409.93");
  });

  test("fromString aceita zero e centavos", () => {
    expect(Money.fromString("0.00", "BRL").cents).toBe(0n);
    expect(Money.fromString("0.07", "BRL").cents).toBe(7n);
  });
});
