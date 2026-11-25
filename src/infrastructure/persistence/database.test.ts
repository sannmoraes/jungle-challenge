import "reflect-metadata";
import { describe, expect, test } from "bun:test";
import { MikroORM } from "@mikro-orm/postgresql";
import { Injectable, Module } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import config from "./mikro-orm.config";

@Injectable()
class Dependencia {
  valor = 42;
}

@Injectable()
class Servico {
  constructor(readonly dependencia: Dependencia) {}
}

@Module({ providers: [Dependencia, Servico] })
class ModuloDeTeste {}

describe("infraestrutura", () => {
  test("Nest injeta pelo construtor (decorator metadata no Bun)", async () => {
    const app = await NestFactory.createApplicationContext(ModuloDeTeste, { logger: false });
    expect(app.get(Servico).dependencia.valor).toBe(42);
    await app.close();
  });

  test("MikroORM conecta no Postgres real e roda SELECT 1", async () => {
    const orm = await MikroORM.init(config);
    try {
      const rows = await orm.em.getConnection().execute("select 1 as ok");
      expect(rows[0]?.ok).toBe(1);
    } finally {
      await orm.close();
    }
  });
});