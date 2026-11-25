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
});
