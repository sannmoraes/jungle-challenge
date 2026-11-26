import { Injectable } from "@nestjs/common";
import { InvalidInputError, WalletNotFoundError } from "../domain/errors";
import { WalletRepository } from "../domain/ports/wallet-repository";
import { UUID, type Wallet } from "../domain/wallet";

@Injectable()
export class GetWalletUseCase {
  constructor(private readonly wallets: WalletRepository) {}

  async execute(id: string): Promise<Wallet> {
    if (!UUID.test(id)) throw new InvalidInputError("walletId must be a UUID");
    const wallet = await this.wallets.findById(id);
    if (wallet === undefined) throw new WalletNotFoundError(id);
    return wallet;
  }
}