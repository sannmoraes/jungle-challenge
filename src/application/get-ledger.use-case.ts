import { Injectable } from "@nestjs/common";
import { InvalidInputError } from "../domain/errors";
import { WalletRepository } from "../domain/ports/wallet-repository";
import { GetWalletUseCase } from "./get-wallet.use-case";
import { decodeCursor, encodeCursor } from "./ledger-cursor";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

@Injectable()
export class GetLedgerUseCase {
  constructor(
    private readonly getWallet: GetWalletUseCase,
    private readonly wallets: WalletRepository,
  ) {}

  async execute(walletId: string, rawLimit: unknown, rawCursor: unknown) {
    const limit = parseLimit(rawLimit);
    const after = decodeCursor(rawCursor);
    const wallet = await this.getWallet.execute(walletId);
    const rows = await this.wallets.findLedger(wallet.id, limit + 1, after);
    const entries = rows.slice(0, limit);
    const last = entries[entries.length - 1];
    const nextCursor = rows.length > limit && last ? encodeCursor(last) : null;
    return { currency: wallet.balance.currency, entries, nextCursor };
  }
}

function parseLimit(raw: unknown): number {
  if (raw === undefined) return DEFAULT_LIMIT;
  const limit = Number(raw);
  if (typeof raw !== "string" || !/^\d+$/.test(raw) || limit < 1 || limit > MAX_LIMIT) {
    throw new InvalidInputError(`limit must be an integer between 1 and ${MAX_LIMIT}`);
  }
  return limit;
}