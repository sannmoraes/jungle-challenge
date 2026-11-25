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

function postWallet(body: unknown) {
  return fetch(`${baseUrl}/wallets`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function bodyWith(amount: unknown) {
  return { playerId: PLAYER_ID, initialBalance: { amount, currency: "BRL" } };
}

async function count(table: string): Promise<number> {
  const rows = await em.fork().execute(`select count(*)::int as n from ${table}`);
  return rows[0]!.n as number;
}

describe("POST /wallets", () => {
  test("abre a wallet com saldo e um lançamento OPENING", async () => {
    const response = await postWallet(bodyWith("1000.00"));
    expect(response.status).toBe(201);
    const wallet = (await response.json()) as { id: string; balance: { amount: string }; version: number };
    expect(wallet.balance.amount).toBe("1000.00");
    expect(wallet.version).toBe(1);

    const saved = await em.fork().execute("select balance::text as balance from wallets where id = ?", [wallet.id]);
    expect(saved[0]!.balance).toBe("1000.00");

    const entries = await em.fork().execute(
      `select l.direction, l.amount::text as amount, l.balance_before::text as before,
              l.balance_after::text as after, t.kind
         from wallet_ledger_entries l
         join wager_transactions t on t.id = l.transaction_id
        where l.wallet_id = ?`,
      [wallet.id],
    );
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      kind: "OPENING",
      direction: "CREDIT",
      amount: "1000.00",
      before: "0.00",
      after: "1000.00",
    });
  });

  test("duplicata (mesmo jogador e moeda) devolve 409 e não cria nada a mais", async () => {
    expect((await postWallet(bodyWith("1000.00"))).status).toBe(201);

    const second = await postWallet(bodyWith("50.00"));
    expect(second.status).toBe(409);
    expect(((await second.json()) as { error: string }).error).toBe("WalletAlreadyExistsError");

    expect(await count("wallets")).toBe(1);
    expect(await count("wallet_ledger_entries")).toBe(1);
  });

  test("10 aberturas simultâneas do mesmo jogador: só uma vence", async () => {
    const responses = await Promise.all(Array.from({ length: 10 }, () => postWallet(bodyWith("100.00"))));
    const statuses = responses.map((r) => r.status).sort();

    expect(statuses.filter((s) => s === 201)).toHaveLength(1);
    expect(statuses.filter((s) => s === 409)).toHaveLength(9);
    expect(await count("wallets")).toBe(1);
    expect(await count("wager_transactions")).toBe(1);
    expect(await count("wallet_ledger_entries")).toBe(1);
  });

  test("saldo inicial zero abre a wallet sem lançamento", async () => {
    const response = await postWallet(bodyWith("0.00"));
    expect(response.status).toBe(201);
    expect(await count("wallets")).toBe(1);
    expect(await count("wallet_ledger_entries")).toBe(0);
  });

  test.each([
    ["número em vez de string", 1000.5],
    ["negativo", "-5.00"],
    ["uma casa decimal", "10.5"],
  ])("recusa saldo inválido (%s) com 400 e não grava nada", async (_nome, amount) => {
    const response = await postWallet(bodyWith(amount));
    expect(response.status).toBe(400);
    expect(await count("wallets")).toBe(0);
  });
});