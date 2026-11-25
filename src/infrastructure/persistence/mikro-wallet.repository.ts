import { Injectable } from "@nestjs/common";
import { EntityManager, UniqueConstraintViolationException } from "@mikro-orm/postgresql";
import { WalletAlreadyExistsError } from "../../domain/errors";
import { WalletRepository } from "../../domain/ports/wallet-repository";
import { Wallet } from "../../domain/wallet";

@Injectable()
export class MikroWalletRepository extends WalletRepository {
  constructor(private readonly em: EntityManager) {
    super();
  }

  async openWithOpeningEntry(wallet: Wallet): Promise<void> {
    try {
      await this.em.fork().transactional(async (tx) => {
        await tx.execute(
          `insert into wallets (id, player_id, currency, balance)
           values (?, ?, ?, ?)`,
          [wallet.id, wallet.playerId, wallet.balance.currency, wallet.balance.toString()],
        );

        if (wallet.balance.cents === 0n) return;

        const transactionId = crypto.randomUUID();

        await tx.execute(
          `insert into wager_transactions
             (id, provider_id, external_transaction_id, idempotency_key, payload_hash,
              wallet_id, player_id, round_id, game_id, kind, amount, currency,
              status, balance_after, processed_at)
           values (?, 'system', ?, ?, 'opening', ?, ?, 'opening', 'opening',
                   'OPENING', ?, ?, 'PROCESSED', ?, now())`,
          [
            transactionId,
            `opening:${wallet.id}`,
            `opening:${wallet.id}`,
            wallet.id,
            wallet.playerId,
            wallet.balance.toString(),
            wallet.balance.currency,
            wallet.balance.toString(),
          ],
        );

        await tx.execute(
          `insert into wallet_ledger_entries
             (id, wallet_id, transaction_id, direction, amount, balance_before, balance_after)
           values (?, ?, ?, 'CREDIT', ?, 0, ?)`,
          [
            crypto.randomUUID(),
            wallet.id,
            transactionId,
            wallet.balance.toString(),
            wallet.balance.toString(),
          ],
        );           
      });
    } catch (error) {
      if (
        error instanceof UniqueConstraintViolationException &&
        error.message.includes("wallets_player_currency_unique")
      ) {
        throw new WalletAlreadyExistsError(wallet.playerId, wallet.balance.currency);
      }
      throw error;
    }
  }
}