import { Injectable } from "@nestjs/common";
import { EntityManager, ForeignKeyConstraintViolationException } from "@mikro-orm/postgresql";
import { IdempotencyConflictError, WalletNotFoundError } from "../../domain/errors";
import {
  WagerRepository,
  type ProcessBetCommand,
  type ProcessBetResult,
} from "../../domain/ports/wager-repository";

@Injectable()
export class MikroWagerRepository extends WagerRepository {
  constructor(private readonly em: EntityManager) {
    super();
  }

  async processBet(cmd: ProcessBetCommand): Promise<ProcessBetResult> {
    try {
      return await this.em.fork().transactional(async (tx) => {
        const transactionId = crypto.randomUUID();

        // 1. reserva a key: só um vence
        const inserted = await tx.execute(
          `insert into wager_transactions
             (id, provider_id, external_transaction_id, idempotency_key, payload_hash,
              wallet_id, player_id, round_id, game_id, kind, amount, currency, status)
           values (?, ?, ?, ?, ?, ?, ?, ?, ?, 'BET', ?, ?, 'PENDING')
           on conflict (idempotency_key) do nothing
           returning id`,
          [
            transactionId, cmd.providerId, cmd.externalTransactionId, cmd.idempotencyKey,
            cmd.payloadHash, cmd.walletId, cmd.playerId, cmd.roundId, cmd.gameId,
            cmd.amount, cmd.currency,
          ],
        );

        // 2. key já existia: devolve o resultado original (replay) ou 409
        if (inserted.length === 0) {
          const rows = await tx.execute(
            `select id, payload_hash, status, failure_code, balance_after::text as balance_after, currency
               from wager_transactions
              where idempotency_key = ?`,
            [cmd.idempotencyKey],
          );
          const original = rows[0]!;
          if (original.payload_hash !== cmd.payloadHash) {
            throw new IdempotencyConflictError(cmd.idempotencyKey);
          }
          return {
            transactionId: original.id as string,
            status: original.status as "PROCESSED" | "REJECTED",
            failureCode: (original.failure_code as string | null) ?? null,
            balance:
              original.balance_after === null
                ? null
                : { amount: original.balance_after as string, currency: original.currency as string },
            idempotentReplay: true,
          };
        }

        // 3. débito atômico (opção A)
        const debited = await tx.execute(
          `update wallets
              set balance = balance - ?, version = version + 1, updated_at = now()
            where id = ? and currency = ? and balance >= ?
            returning balance::text as balance`,
          [cmd.amount, cmd.walletId, cmd.currency, cmd.amount],
        );

        // 4. 0 linhas: não debitou. Rejeita com o motivo.
        if (debited.length === 0) {
          const failureCode = await this.rejectionReason(tx, cmd);
          await tx.execute(
            `update wager_transactions
                set status = 'REJECTED', failure_code = ?, processed_at = now()
              where id = ?`,
            [failureCode, transactionId],
          );
          return { transactionId, status: "REJECTED", failureCode, balance: null, idempotentReplay: false };
        }

        // 5. ledger + fecha a transação, tudo na MESMA transação do débito
        const balanceAfter = debited[0]!.balance as string;
        await tx.execute(
          `insert into wallet_ledger_entries
             (id, wallet_id, transaction_id, direction, amount, balance_before, balance_after)
           values (?, ?, ?, 'DEBIT', ?, ?::numeric + ?::numeric, ?)`,
          [crypto.randomUUID(), cmd.walletId, transactionId, cmd.amount, balanceAfter, cmd.amount, balanceAfter],
        );
        await tx.execute(
          `update wager_transactions
              set status = 'PROCESSED', balance_after = ?, processed_at = now()
            where id = ?`,
          [balanceAfter, transactionId],
        );
        return {
          transactionId,
          status: "PROCESSED",
          failureCode: null,
          balance: { amount: balanceAfter, currency: cmd.currency },
          idempotentReplay: false,
        };
      });
    } catch (error) {
      if (error instanceof ForeignKeyConstraintViolationException) {
        throw new WalletNotFoundError(cmd.walletId);
      }
      throw error;
    }
  }

  private async rejectionReason(tx: EntityManager, cmd: ProcessBetCommand): Promise<string> {
    const rows = await tx.execute("select currency from wallets where id = ?", [cmd.walletId]);
    return rows[0]!.currency === cmd.currency ? "INSUFFICIENT_FUNDS" : "CURRENCY_MISMATCH";
  }
}