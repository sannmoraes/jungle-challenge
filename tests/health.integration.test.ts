import { afterAll, beforeAll, describe, expect, test } from "bun:test";

const PORT = 3103;
const baseUrl = `http://localhost:${PORT}`;
let child: ReturnType<typeof Bun.spawn>;

beforeAll(async () => {
  child = Bun.spawn([process.execPath, "src/main.ts"], {
    env: { ...process.env, PORT: String(PORT), DATABASE_URL: "postgres://jungle:jungle@localhost:5999/jungle" },
    stdout: "ignore",
    stderr: "inherit",
  });
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    try {
      await fetch(`${baseUrl}/health/live`);
      return;
    } catch {
      await Bun.sleep(200);
    }
  }
  throw new Error("app não ficou pronta");
}, 60_000);

afterAll(async () => {
  child.kill();
  await child.exited;
});

describe("health com o Postgres inacessível", () => {
  test("live segue 200: o processo está vivo", async () => {
    expect((await fetch(`${baseUrl}/health/live`)).status).toBe(200);
  });

  test("ready devolve 503: o banco não responde", async () => {
    expect((await fetch(`${baseUrl}/health/ready`)).status).toBe(503);
  });
});

describe("ready com o Postgres no ar", () => {
  test("ready devolve 200", async () => {
    const healthy = Bun.spawn([process.execPath, "src/main.ts"], {
      env: { ...process.env, PORT: "3104" },
      stdout: "ignore",
      stderr: "inherit",
    });
    try {
      let status = 0;
      for (let i = 0; i < 150 && status !== 200; i++) {
        try {
          status = (await fetch("http://localhost:3104/health/ready")).status;
        } catch {
          await Bun.sleep(200);
        }
      }
      expect(status).toBe(200);
    } finally {
      healthy.kill();
      await healthy.exited;
    }
  }, 60_000);
});