import "reflect-metadata";
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import type { INestApplication } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { EntityManager } from "@mikro-orm/postgresql";
import { AppModule } from "../src/app.module";

const PLAYER_ID = "0192f28f-5dc0-7d58-bdb2-814ad6a0f4a1";

let app: INestApplication;
let baseUrl: string;
let em: EntityManager;

beforeAll(async () => {
  app = await NestFactory.create(AppModule, { logger: false });
  await app.listen(0);
  baseUrl = await app.getUrl();
  em = app.get(EntityManager);
});

afterAll(async () => {
  await app.close();
});

beforeEach(async () => {
  await em.fork().execute("truncate wallet_ledger_entries, wager_transactions, wallets cascade");
});

async function openWallet(amount: string): Promise<string> {
  const response = await fetch(`${baseUrl}/wallets`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ playerId: PLAYER_ID, initialBalance: { amount, currency: "BRL" } }),
  });
  return ((await response.json()) as { id: string }).id;
}

function betBody(walletId: string, amount: string, externalId = "tx-1") {
  return {
    providerId: "provider-a",
    externalTransactionId: externalId,
    playerId: PLAYER_ID,
    walletId,
    roundId: "round-1",
    gameId: "fortune-chimp",
    kind: "BET",
    money: { amount, currency: "BRL" },
  };
}

function postBet(body: unknown, key: string | null = "provider-a:tx-1") {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (key !== null) headers["idempotency-key"] = key;
  return fetch(`${baseUrl}/wagering/transactions`, { method: "POST", headers, body: JSON.stringify(body) });
}

async function walletBalance(walletId: string): Promise<string> {
  const rows = await em.fork().execute("select balance::text as balance from wallets where id = ?", [walletId]);
  return rows[0]!.balance as string;
}

async function count(table: string): Promise<number> {
  const rows = await em.fork().execute(`select count(*)::int as n from ${table}`);
  return rows[0]!.n as number;
}

describe("POST /wagering/transactions (BET)", () => {
  test("BET aprovada debita o saldo e grava o lançamento DEBIT", async () => {
    const walletId = await openWallet("100.00");

    const response = await postBet(betBody(walletId, "25.00"));
    expect(response.status).toBe(201);
    const body = (await response.json()) as { status: string; balance: { amount: string }; idempotentReplay: boolean };
    expect(body.status).toBe("PROCESSED");
    expect(body.balance.amount).toBe("75.00");
    expect(body.idempotentReplay).toBe(false);

    expect(await walletBalance(walletId)).toBe("75.00");
    const entries = await em.fork().execute(
      `select l.direction, l.amount::text as amount, l.balance_before::text as before,
              l.balance_after::text as after
         from wallet_ledger_entries l
         join wager_transactions t on t.id = l.transaction_id
        where t.kind = 'BET'`,
    );
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ direction: "DEBIT", amount: "25.00", before: "100.00", after: "75.00" });
  });

  test("saldo insuficiente: 422 REJECTED, saldo intacto e sem lançamento", async () => {
    const walletId = await openWallet("100.00");

    const response = await postBet(betBody(walletId, "100.01"));
    expect(response.status).toBe(422);
    const body = (await response.json()) as { status: string; failureCode: string };
    expect(body.status).toBe("REJECTED");
    expect(body.failureCode).toBe("INSUFFICIENT_FUNDS");

    expect(await walletBalance(walletId)).toBe("100.00");
    // só o lançamento OPENING da abertura; a aposta rejeitada não gera ledger
    expect(await count("wallet_ledger_entries")).toBe(1);
  });

  test("repetição com a mesma key devolve o resultado original sem debitar de novo", async () => {
    const walletId = await openWallet("100.00");

    const first = await postBet(betBody(walletId, "25.00"));
    const second = await postBet(betBody(walletId, "25.00"));

    expect(second.status).toBe(200);
    const a = (await first.json()) as { transactionId: string };
    const b = (await second.json()) as { transactionId: string; balance: { amount: string }; idempotentReplay: boolean };
    expect(b.transactionId).toBe(a.transactionId);
    expect(b.balance.amount).toBe("75.00");
    expect(b.idempotentReplay).toBe(true);

    expect(await walletBalance(walletId)).toBe("75.00");
    expect(await count("wallet_ledger_entries")).toBe(2); // OPENING + uma BET
  });

  test("mesma key com payload diferente: 409 e nada é debitado", async () => {
    const walletId = await openWallet("100.00");

    expect((await postBet(betBody(walletId, "25.00"))).status).toBe(201);
    const conflict = await postBet(betBody(walletId, "30.00"));

    expect(conflict.status).toBe(409);
    expect(((await conflict.json()) as { error: string }).error).toBe("IdempotencyConflictError");
    expect(await walletBalance(walletId)).toBe("75.00");
  });

  test("sem o header Idempotency-Key: 400 e nada é gravado", async () => {
    const walletId = await openWallet("100.00");

    const response = await postBet(betBody(walletId, "25.00"), null);

    expect(response.status).toBe(400);
    expect(await walletBalance(walletId)).toBe("100.00");
    expect(await count("wager_transactions")).toBe(1); // só o OPENING
  });

  test("mesmo externalTransactionId com outra key: 409 e nada é debitado", async () => {
    const walletId = await openWallet("100.00");

    expect((await postBet(betBody(walletId, "25.00"), "provider-a:tx-1")).status).toBe(201);
    const conflict = await postBet(betBody(walletId, "25.00"), "outra-key");

    expect(conflict.status).toBe(409);
    expect(await walletBalance(walletId)).toBe("75.00");
    expect(await count("wager_transactions")).toBe(2); // OPENING + a 1ª BET
  });

});

describe("concorrência", () => {
  test("2 BETs de 80 simultâneas contra saldo 100: 1 PROCESSED, 1 REJECTED, saldo 20", async () => {
    const walletId = await openWallet("100.00");

    const responses = await Promise.all([
      postBet(betBody(walletId, "80.00", "tx-a"), "provider-a:tx-a"),
      postBet(betBody(walletId, "80.00", "tx-b"), "provider-a:tx-b"),
    ]);
    const bodies = await Promise.all(responses.map((r) => r.json() as Promise<{ status: string }>));

    expect(bodies.map((b) => b.status).sort()).toEqual(["PROCESSED", "REJECTED"]);
    expect(responses.map((r) => r.status).sort()).toEqual([201, 422]);
    expect(await walletBalance(walletId)).toBe("20.00");

    const debits = await em.fork().execute(
      "select count(*)::int as n from wallet_ledger_entries where direction = 'DEBIT'",
    );
    expect(debits[0]!.n).toBe(1);
  });

  test("50 requisições paralelas idênticas: 1 débito, todas com o mesmo resultado", async () => {
    const walletId = await openWallet("100.00");
    const body = betBody(walletId, "10.00", "tx-same");

    const responses = await Promise.all(
      Array.from({ length: 50 }, () => postBet(body, "provider-a:tx-same")),
    );
    const bodies = await Promise.all(
      responses.map(
        (r) => r.json() as Promise<{ transactionId: string; status: string; balance: { amount: string } }>,
      ),
    );

    const statuses = responses.map((r) => r.status);
    expect(statuses.filter((s) => s === 201)).toHaveLength(1);
    expect(statuses.filter((s) => s === 200)).toHaveLength(49);
    expect(new Set(bodies.map((b) => b.transactionId)).size).toBe(1);
    expect(bodies.every((b) => b.status === "PROCESSED" && b.balance.amount === "90.00")).toBe(true);

    expect(await walletBalance(walletId)).toBe("90.00");
    const debits = await em.fork().execute(
      "select count(*)::int as n from wallet_ledger_entries where direction = 'DEBIT'",
    );
    expect(debits[0]!.n).toBe(1);
    expect(await count("wager_transactions")).toBe(2); // OPENING + uma BET
  });
});