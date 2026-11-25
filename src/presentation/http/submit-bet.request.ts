import { InvalidInputError } from "../../domain/errors";
import type { SubmitBetInput } from "../../application/submit-bet.use-case";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseSubmitBetRequest(idempotencyKey: unknown, body: unknown): SubmitBetInput {
  if (typeof idempotencyKey !== "string" || idempotencyKey.trim() === "") {
    throw new InvalidInputError("Idempotency-Key header is required");
  }
  const data = (body ?? {}) as {
    providerId?: unknown;
    externalTransactionId?: unknown;
    playerId?: unknown;
    walletId?: unknown;
    roundId?: unknown;
    gameId?: unknown;
    kind?: unknown;
    money?: { amount?: unknown; currency?: unknown };
  };
  const { providerId, externalTransactionId, playerId, walletId, roundId, gameId, kind } = data;
  const amount = data.money?.amount;
  const currency = data.money?.currency;

  if (
    typeof providerId !== "string" ||
    typeof externalTransactionId !== "string" ||
    typeof playerId !== "string" ||
    typeof walletId !== "string" ||
    typeof roundId !== "string" ||
    typeof gameId !== "string" ||
    typeof kind !== "string" ||
    typeof amount !== "string" ||
    typeof currency !== "string"
  ) {
    throw new InvalidInputError("Body must have string fields: providerId, externalTransactionId, playerId, walletId, roundId, gameId, kind, money.{amount,currency}");
  }
  if (!UUID.test(playerId) || !UUID.test(walletId)) {
    throw new InvalidInputError("playerId and walletId must be UUIDs");
  }
  return { idempotencyKey, providerId, externalTransactionId, playerId, walletId, roundId, gameId, kind, amount, currency };
}