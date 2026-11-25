import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { SQL } from "bun";

const PLAYER_ID = "0192f28f-5dc0-7d58-bdb2-814ad6a0f4a1";
const PORTS = [3101, 3102];

const sql = new SQL(process.env.DATABASE_URL!);
const children: ReturnType<typeof Bun.spawn>[] = [];

function startInstance(port: number) {
  const child = Bun.spawn([process.execPath, "src/main.ts"], {
    env: { ...process.env, PORT: String(port) },
    stdout: "ignore",
    stderr: "inherit",
  });
  children.push(child);
}

async function waitUntilReady(port: number) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    try {
      await fetch(`http://localhost:${port}/`);
      return;
    } catch {
      await Bun.sleep(200);
    }
  }
  throw new Error(`instância na porta ${port} não ficou pronta`);
}

beforeAll(async () => {
  PORTS.forEach((port) => startInstance(port));
  await Promise.all(PORTS.map((port) => waitUntilReady(port)));
}, 60_000);

afterAll(async () => {
  for (const child of children) child.kill();
  await Promise.all(children.map((child) => child.exited));
  await sql.close();
});

beforeEach(async () => {
  await sql`truncate wallet_ledger_entries, wager_transactions, wallets cascade`;
});

async function openWallet(amount: string): Promise<string> {
  const response = await fetch(`http://localhost:${PORTS[0]}/wallets`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ playerId: PLAYER_ID, initialBalance: { amount, currency: "BRL" } }),
  });
  return ((await response.json()) as { id: string }).id;
}

function betBody(walletId: string, amount: string, externalId: string) {
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

function postBet(port: number, body: unknown, key: string) {
  return fetch(`http://localhost:${port}/wagering/transactions`, {
    method: "POST",
    headers: { "content-type": "application/json", "idempotency-key": key },
    body: JSON.stringify(body),
  });
}

async function walletBalance(walletId: string): Promise<string> {
  const rows = await sql`select balance::text as balance from wallets where id = ${walletId}`;
  return rows[0].balance as string;
}

async function countDebits(): Promise<number> {
  const rows = await sql`select count(*)::int as n from wallet_ledger_entries where direction = 'DEBIT'`;
  return rows[0].n as number;
}

describe("duas instâncias, um só Postgres", () => {
  test("50 requisições idênticas alternando as portas: 1 débito, 1x201, 49x200", async () => {
    const walletId = await openWallet("100.00");
    const body = betBody(walletId, "10.00", "tx-same");

    const responses = await Promise.all(
      Array.from({ length: 50 }, (_, i) => postBet(PORTS[i % 2]!, body, "provider-a:tx-same")),
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
    expect(await countDebits()).toBe(1);
  });

  test("2 BETs de 80 contra saldo 100, uma em cada instância: 1 PROCESSED, 1 REJECTED, saldo 20", async () => {
    const walletId = await openWallet("100.00");

    const responses = await Promise.all([
      postBet(PORTS[0]!, betBody(walletId, "80.00", "tx-a"), "provider-a:tx-a"),
      postBet(PORTS[1]!, betBody(walletId, "80.00", "tx-b"), "provider-a:tx-b"),
    ]);
    const bodies = await Promise.all(responses.map((r) => r.json() as Promise<{ status: string }>));

    expect(bodies.map((b) => b.status).sort()).toEqual(["PROCESSED", "REJECTED"]);
    expect(responses.map((r) => r.status).sort()).toEqual([201, 422]);
    expect(await walletBalance(walletId)).toBe("20.00");
    expect(await countDebits()).toBe(1);
  });
});