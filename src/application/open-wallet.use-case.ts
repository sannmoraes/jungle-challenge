import { Injectable } from "@nestjs/common";
import { WalletRepository } from "../domain/ports/wallet-repository";
import { Money } from "../domain/money";
import { Wallet } from "../domain/wallet";
import { InvalidInputError } from "../domain/errors";

export interface OpenWalletInput {
  playerId: string;
  amount: string;
  currency: string;
}

@Injectable()
export class OpenWalletUseCase {
  constructor(private readonly wallets: WalletRepository) {}

  async execute(input: OpenWalletInput): Promise<Wallet> {
    let wallet: Wallet;
    try {
      const initialBalance = Money.fromString(input.amount, input.currency);
      wallet = Wallet.open(crypto.randomUUID(), input.playerId, initialBalance);
    } catch (error) {
      throw new InvalidInputError(error instanceof Error ? error.message : "Invalid input");
    }
    await this.wallets.openWithOpeningEntry(wallet);
    return wallet;
  }
}
