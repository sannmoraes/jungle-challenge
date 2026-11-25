import { createHash } from "node:crypto";

export interface BetPayload {
  providerId: string;
  externalTransactionId: string;
  playerId: string;
  walletId: string;
  roundId: string;
  gameId: string;
  kind: string;
  amount: string;
  currency: string;
}

export function payloadHash(p: BetPayload): string {
  const canonical = JSON.stringify({
    amount: p.amount,
    currency: p.currency,
    externalTransactionId: p.externalTransactionId,
    gameId: p.gameId,
    kind: p.kind,
    playerId: p.playerId,
    providerId: p.providerId,
    roundId: p.roundId,
    walletId: p.walletId,
  });
  return createHash("sha256").update(canonical).digest("hex");
}