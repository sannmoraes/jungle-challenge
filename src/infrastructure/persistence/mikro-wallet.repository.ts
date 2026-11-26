import { Injectable } from "@nestjs/common";
import { EntityManager, UniqueConstraintViolationException } from "@mikro-orm/postgresql";
import { WalletAlreadyExistsError } from "../../domain/errors";
import { WalletRepository, type LedgerEntry, type LedgerCursor } from "../../domain/ports/wallet-repository";
import { Wallet } from "../../domain/wallet";
import { Money } from "../../domain/money";


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


  async findById(id: string): Promise<Wallet | undefined> {
    const rows = await this.em.fork().execute(
      `select id, player_id, currency, balance::text as balance, version
         from wallets
        where id = ?`,
      [id],
    );
    const row = rows[0];
    if (row === undefined) return undefined;
    return Wallet.rehydrate(
      row.id as string,
      row.player_id as string,
      Money.fromString(row.balance as string, row.currency as string),
      row.version as number,
    );
  }

  async findLedger(walletId: string, limit: number, after?: LedgerCursor): Promise<LedgerEntry[]> {
    const rows = await this.em.fork().execute(
      `select id,
              transaction_id as "transactionId",
              direction,
              amount::text as amount,
              balance_before::text as "balanceBefore",
              balance_after::text as "balanceAfter",
              to_char(created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as "createdAt"
         from wallet_ledger_entries
        where wallet_id = ?
        and (?::timestamptz is null or (created_at, id) < (?::timestamptz, ?::uuid))
        order by created_at desc, id desc
        limit ?`,
      [walletId, after?.createdAt ?? null, after?.createdAt ?? null, after?.id ?? null, limit],
    );
    return rows as LedgerEntry[];
  }
}