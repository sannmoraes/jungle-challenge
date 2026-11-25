import { describe, expect, test } from "bun:test";
import { Money } from "./money";
import { Wallet } from "./wallet";

const WALLET_ID = "0192f291-27dd-7d3f-8071-5f8685deef37";
const PLAYER_ID = "0192f28f-5dc0-7d58-bdb2-814ad6a0f4a1";

describe("Wallet", () => {
  test("abre com o saldo inicial e versão 1", () => {
    const wallet = Wallet.open(WALLET_ID, PLAYER_ID, Money.fromString("1000.00", "BRL"));

    expect(wallet.id).toBe(WALLET_ID);
    expect(wallet.playerId).toBe(PLAYER_ID);
    expect(wallet.balance.toString()).toBe("1000.00");
    expect(wallet.balance.currency).toBe("BRL");
    expect(wallet.version).toBe(1);
  });

  test("rejeita playerId que não é UUID", () => {
    expect(() => Wallet.open(WALLET_ID, "abc", Money.fromString("1.00", "BRL"))).toThrow(
      "Invalid playerId",
    );
  });
});