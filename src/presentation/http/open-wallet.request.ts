import { InvalidInputError } from "../../domain/errors";
import type { OpenWalletInput } from "../../application/open-wallet.use-case";

export function parseOpenWalletBody(body: unknown): OpenWalletInput {
  const data = body as { playerId?: unknown; initialBalance?: { amount?: unknown; currency?: unknown } };
  const playerId = data?.playerId;
  const amount = data?.initialBalance?.amount;
  const currency = data?.initialBalance?.currency;

  if (typeof playerId !== "string" || typeof amount !== "string" || typeof currency !== "string") {
    throw new InvalidInputError(
      "Body must be { playerId: string, initialBalance: { amount: string, currency: string } }",
    );
  }
  return { playerId, amount, currency };
}