import type { Wallet } from "../wallet";

export interface LedgerEntry {
  id: string;
  transactionId: string;
  direction: "DEBIT" | "CREDIT";
  amount: string;
  balanceBefore: string;
  balanceAfter: string;
  createdAt: string;
}

export interface LedgerCursor {
  createdAt: string;
  id: string;
}

export abstract class WalletRepository {
  abstract openWithOpeningEntry(wallet: Wallet): Promise<void>;
  abstract findById(id: string): Promise<Wallet | undefined>;
  abstract findLedger(walletId: string, limit: number, after?: LedgerCursor): Promise<LedgerEntry[]>;
}