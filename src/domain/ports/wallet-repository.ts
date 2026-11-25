import type { Wallet } from "../wallet";

export abstract class WalletRepository {
  abstract openWithOpeningEntry(wallet: Wallet): Promise<void>;
}