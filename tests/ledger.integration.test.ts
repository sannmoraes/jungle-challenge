import "reflect-metadata";
import { afterAll, beforeAll, beforeEach, expect, test } from "bun:test";
import type { INestApplication } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { EntityManager } from "@mikro-orm/postgresql";
import { AppModule } from "../src/app.module";
import { Money } from "../src/domain/money";
import type { LedgerEntry } from "../src/domain/ports/wallet-repository";

const PLAYER_ID = "0192f28f-5dc0-7d58-bdb2-814ad6a0f4a1";

type LedgerPage = { entries: LedgerEntry[]; nextCursor: string | null };

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

async function bet(walletId: string, amount: string, externalId: string) {
  const response = await fetch(`${baseUrl}/wagering/transactions`, {
    method: "POST",
    headers: { "content-type": "application/json", "idempotency-key": `provider-a:${externalId}` },
    body: JSON.stringify({
      providerId: "provider-a",
      externalTransactionId: externalId,
      playerId: PLAYER_ID,
      walletId,
      roundId: "round-1",
      gameId: "fortune-chimp",
      kind: "BET",
      money: { amount, currency: "BRL" },
    }),
  });
  return (await response.json()) as { transactionId: string; status: string };
}

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`);
  return (await response.json()) as T;
}

test("saldo do GET = último balanceAfter = créditos - débitos; REJECTED fora do ledger", async () => {
  const walletId = await openWallet("100.00");
  await bet(walletId, "25.00", "tx-1");
  await bet(walletId, "10.00", "tx-2");
  const rejected = await bet(walletId, "500.00", "tx-3");
  expect(rejected.status).toBe("REJECTED");

  const wallet = await getJson<{ balance: { amount: string } }>(`/wallets/${walletId}`);
  const { entries } = await getJson<LedgerPage>(`/wallets/${walletId}/ledger`);

  let total = 0n;
  for (const entry of entries) {
    const { cents } = Money.fromString(entry.amount, "BRL");
    total += entry.direction === "CREDIT" ? cents : -cents;
  }

  expect(entries).toHaveLength(3);
  expect(wallet.balance.amount).toBe("65.00");
  expect(entries[0]!.balanceAfter).toBe(wallet.balance.amount);
  expect(total).toBe(Money.fromString(wallet.balance.amount, "BRL").cents);
  expect(entries.map((entry) => entry.transactionId)).not.toContain(rejected.transactionId);
});

test("limit=1 percorre o ledger sem repetir nem pular; cursor inválido = 400", async () => {
  const walletId = await openWallet("100.00");
  await bet(walletId, "25.00", "tx-1");
  await bet(walletId, "10.00", "tx-2");
  const path = `/wallets/${walletId}/ledger`;
  const all = await getJson<LedgerPage>(path);

  const seen: string[] = [];
  let cursor: string | null = null;
  do {
    const query: string = cursor === null ? "?limit=1" : `?limit=1&cursor=${cursor}`;
    const page: LedgerPage = await getJson<LedgerPage>(path + query);
    seen.push(...page.entries.map((entry) => entry.id));
    cursor = page.nextCursor;
  } while (cursor !== null && seen.length < 10);

  expect(all.entries).toHaveLength(3);
  expect(seen).toEqual(all.entries.map((entry) => entry.id));
  expect(cursor).toBeNull();

  const invalid = await fetch(`${baseUrl}${path}?cursor=abc`);
  expect(invalid.status).toBe(400);
});