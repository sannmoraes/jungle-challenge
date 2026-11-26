import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { SQL } from "bun";

const sql = new SQL(process.env.DATABASE_URL!);

const WALLET_ID = "22222222-2222-2222-2222-222222222222";
const PLAYER_ID = "11111111-1111-1111-1111-111111111111";
const TX_ID = "33333333-3333-3333-3333-333333333333";
const ENTRY_ID = "44444444-4444-4444-4444-444444444444";

// cada teste começa com uma wallet de 100.00 e o lançamento de abertura
beforeEach(async () => {
  await sql`truncate wallet_ledger_entries, wager_transactions, wallets cascade`;
  await sql`insert into wallets (id, player_id, currency, balance)
            values (${WALLET_ID}, ${PLAYER_ID}, 'BRL', 100)`;
  await sql`insert into wager_transactions
              (id, provider_id, external_transaction_id, idempotency_key, payload_hash,
               wallet_id, player_id, round_id, game_id, kind, amount, currency, status)
            values (${TX_ID}, 'system', 'tx-1', 'key-1', 'hash', ${WALLET_ID}, ${PLAYER_ID},
                    'round-1', 'game-1', 'OPENING', 100, 'BRL', 'PROCESSED')`;
  await sql`insert into wallet_ledger_entries
              (id, wallet_id, transaction_id, direction, amount, balance_before, balance_after)
            values (${ENTRY_ID}, ${WALLET_ID}, ${TX_ID}, 'CREDIT', 100, 0, 100)`;
});

afterAll(async () => {
  await sql.close();
});

// devolve a mensagem de erro do banco, ou "" se a consulta passou
async function errorMessage(query: PromiseLike<unknown>): Promise<string> {
  try {
    await query;
    return "";
  } catch (error) {
    return (error as Error).message;
  }
}

describe("constraints do banco", () => {
  test("saldo negativo é recusado", async () => {
    const message = await errorMessage(sql`update wallets set balance = -1 where id = ${WALLET_ID}`);

    expect(message).toContain("wallets_balance_non_negative");
  });

  test("lançamento do ledger não pode ser alterado", async () => {
    const message = await errorMessage(sql`update wallet_ledger_entries set amount = 1 where id = ${ENTRY_ID}`);

    expect(message).toContain("immutable");
  });

  test("lançamento do ledger não pode ser apagado", async () => {
    const message = await errorMessage(sql`delete from wallet_ledger_entries where id = ${ENTRY_ID}`);

    expect(message).toContain("immutable");
  });
});