import { describe, expect, test } from "bun:test";
import { payloadHash, type BetPayload } from "./payload-hash";

const base: BetPayload = {
  providerId: "provider-a",
  externalTransactionId: "transaction-123",
  playerId: "0192f28f-5dc0-7d58-bdb2-814ad6a0f4a1",
  walletId: "0192f291-27dd-7d3f-8071-5f8685deef37",
  roundId: "round-987",
  gameId: "fortune-chimp",
  kind: "BET",
  amount: "25.00",
  currency: "BRL",
};

describe("payloadHash", () => {
  test("mesmo payload gera o mesmo hash (sha256 hex, 64 caracteres)", () => {
    expect(payloadHash({ ...base })).toBe(payloadHash(base));
    expect(payloadHash(base)).toHaveLength(64);
  });

  test("a ordem das chaves não muda o hash", () => {
    const embaralhado = {
      currency: "BRL", amount: "25.00", kind: "BET", gameId: "fortune-chimp",
      roundId: "round-987", walletId: base.walletId, playerId: base.playerId,
      externalTransactionId: "transaction-123", providerId: "provider-a",
    };
    expect(payloadHash(embaralhado)).toBe(payloadHash(base));
  });

  test("qualquer campo de negócio diferente muda o hash", () => {
    expect(payloadHash({ ...base, amount: "26.00" })).not.toBe(payloadHash(base));
    expect(payloadHash({ ...base, roundId: "round-988" })).not.toBe(payloadHash(base));
  });
});