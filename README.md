# Distributed Wagering Processor

Serviço de carteira (wallet) que recebe apostas de provedores de jogos por HTTP e atualiza o saldo do jogador sem debitar a mesma aposta duas vezes nem deixar o saldo negativo, mesmo com requisições repetidas ou simultâneas.

Esta é uma entrega com escopo reduzido: veja [Limitações](#limitações).

## O que faz
- Abre uma wallet; saldo inicial maior que zero gera um lançamento `OPENING` no ledger.
- Processa apostas (`BET`) com idempotência gravada no PostgreSQL.
- Debita o saldo de forma atômica, também com mais de uma instância da aplicação.
- Só debita a wallet do próprio jogador: uma `BET` com outro `playerId` é rejeitada (`PLAYER_MISMATCH`).
- Registra cada débito ou crédito num ledger que o banco não deixa alterar nem apagar (`UPDATE` e `DELETE` bloqueados por trigger).
- Consulta a wallet e o ledger (paginação por cursor).
- Expõe health checks (live e ready) e logs em JSON.

Só o tipo `BET` é aceito. `WIN`, `LOSS`, `REFUND`, `ROLLBACK` e o processamento por fila SQS não foram implementados.

## Stack
Bun 1.x (runtime e testes), TypeScript em modo estrito, NestJS, MikroORM (conexão e transações, com SQL escrito à mão), PostgreSQL 16 e Docker Compose.

## Como rodar
Pré-requisitos: Bun 1.x e Docker com Docker Compose.

```bash
bun install
cp .env.example .env
docker compose up -d --wait
```

O PostgreSQL fica na porta `5433` da máquina (para não conflitar com uma instalação local na `5432`).

### Migrations
São arquivos SQL em `migrations/`, aplicados com o `psql` do container. Elas não rodam sozinhas ao subir a aplicação.

PowerShell:
```powershell
Get-Content migrations/001_schema.sql | docker compose exec -T postgres psql -U jungle -d jungle -v ON_ERROR_STOP=1
```

Bash:
```bash
docker compose exec -T postgres psql -U jungle -d jungle -v ON_ERROR_STOP=1 < migrations/001_schema.sql
```

A migration é aplicada uma vez. Para desfazer (**apaga as tabelas e os dados**), use o mesmo comando com `001_schema.down.sql`.

### Aplicação
```bash
bun src/main.ts
```

Sobe em `http://localhost:3000`; a variável `PORT` muda a porta.

## Testes
Exigem o PostgreSQL no ar e a migration aplicada.

```bash
bun test
bun run typecheck
```

- Os testes de integração usam o banco de `DATABASE_URL` e **apagam os dados das tabelas**.
- Alguns sobem a aplicação nas portas `3101` a `3104`, que precisam estar livres.
- Não rode duas execuções de `bun test` ao mesmo tempo no mesmo banco: uma apaga os dados da outra e surgem falhas falsas.

Os testes cobrem, contra PostgreSQL e HTTP reais: duas apostas de `80.00` disputando um saldo de `100.00`, 50 requisições idênticas em paralelo, os dois cenários com duas instâncias da aplicação, a igualdade entre o saldo e a soma do ledger, a aposta em moeda diferente da wallet e as constraints do banco (saldo negativo e `UPDATE`/`DELETE` no ledger).

## Endpoints

Valores monetários vão e voltam como texto com duas casas decimais (`"25.00"`). A moeda são três letras maiúsculas (`"BRL"`). `playerId` e `walletId` são UUIDs.

Erros de domínio respondem `{"error": "...", "message": "..."}`.

### `POST /wallets`
Abre uma wallet.

```json
{ "playerId": "11111111-1111-1111-1111-111111111111", "initialBalance": { "amount": "100.00", "currency": "BRL" } }
```

Resposta `201`:
```json
{ "id": "<walletId>", "playerId": "11111111-1111-1111-1111-111111111111", "balance": { "amount": "100.00", "currency": "BRL" }, "version": 1 }
```

- `400` `InvalidInputError`: campo ausente ou inválido.
- `409` `WalletAlreadyExistsError`: o jogador já tem wallet nessa moeda.

### `POST /wagering/transactions`
Envia uma aposta. O header `Idempotency-Key` é obrigatório; `x-request-id` é opcional e aparece só no log.

```json
{
  "providerId": "provider-a",
  "externalTransactionId": "tx-1",
  "playerId": "11111111-1111-1111-1111-111111111111",
  "walletId": "<walletId>",
  "roundId": "round-1",
  "gameId": "game-1",
  "kind": "BET",
  "money": { "amount": "25.00", "currency": "BRL" }
}
```

Resposta `201`:
```json
{ "transactionId": "<uuid>", "status": "PROCESSED", "failureCode": null, "balance": { "amount": "75.00", "currency": "BRL" }, "idempotentReplay": false }
```

| Status | Quando |
| --- | --- |
| `201` | aposta processada |
| `200` | repetição de uma aposta processada (mesma key e mesmo payload): `idempotentReplay: true`, com o saldo da época |
| `422` | `status: "REJECTED"` e `balance: null`, com `failureCode` `INSUFFICIENT_FUNDS`, `CURRENCY_MISMATCH` ou `PLAYER_MISMATCH`. A repetição de uma rejeitada também responde `422` |
| `409` | `IdempotencyConflictError`: mesma key com payload diferente, ou mesmo `providerId` + `externalTransactionId` com outra key |
| `404` | `WalletNotFoundError` |
| `400` | `InvalidInputError`: sem o header, campo ausente ou inválido, valor zero ou `kind` diferente de `BET` |

### `GET /wallets/:walletId`
Resposta `200` no mesmo formato da abertura. `400` se o `walletId` não for UUID; `404` se a wallet não existir.

### `GET /wallets/:walletId/ledger?limit=&cursor=`
Extrato, do lançamento mais recente para o mais antigo. `limit` vai de 1 a 100 (padrão 50). Para a próxima página, envie em `cursor` o valor de `nextCursor`; ele é `null` na última.

Resposta `200`:
```json
{
  "currency": "BRL",
  "entries": [
    {
      "id": "<uuid>",
      "transactionId": "<uuid>",
      "direction": "DEBIT",
      "amount": "25.00",
      "balanceBefore": "100.00",
      "balanceAfter": "75.00",
      "createdAt": "2026-01-01T12:00:00.000000Z"
    }
  ],
  "nextCursor": null
}
```

`400` para `walletId`, `limit` ou `cursor` inválido; `404` se a wallet não existir.

### Health
- `GET /health/live`: `200` `{"status":"ok"}` (não consulta o banco).
- `GET /health/ready`: `200` `{"status":"ok"}` se o PostgreSQL responde; senão `503` `{"status":"unavailable"}`.

## Limitações
Priorizei a correção do saldo, a concorrência e a idempotência da aposta; os itens abaixo ficaram fora desta entrega ou são fraquezas conhecidas.

### Funcionalidade
- Sem `WIN`, `LOSS`, `REFUND`, `ROLLBACK` e `PENDING_REFERENCE`.
- Sem SQS/DLQ, inbox, outbox e publicação de eventos.
- Sem reconciliação.
- Sem `GET /wagering/transactions/:transactionId` e `GET /providers/:providerId/wagering/transactions/:externalTransactionId`.

### Modelagem
- Não há classes `WagerTransaction`, `LedgerEntry`, `Inbox` e `Outbox`: transações e lançamentos existem só como tabelas e SQL; inbox e outbox não existem.
- `Wallet` não tem `debit`/`credit`: a regra do saldo está no SQL.
- As transições de estado da transação não estão documentadas. 

### Autenticação
- Não há autenticação. O `AuthGuard` aplicado nas rotas de wallets e apostas libera todas as requisições: quem alcança a API pode abrir wallet, consultar saldo e apostar. Ele é só o ponto de extensão; o desenho está em [ARCHITECTURE.md](ARCHITECTURE.md).

### Observabilidade
- Sem métricas Prometheus.
- `/health/ready` verifica só o PostgreSQL (não há SQS).
- O `requestId` aparece só no log da aposta e não volta na resposta.
- Os logs não têm `correlationId`, `walletId` nem `providerId`.
- O log de um erro `500` perde a mensagem e o stack; saem apenas campos como `code` e `detail` do driver.

### Robustez
- Valor acima do limite de `numeric(19,2)` resulta em `500`.
- Falha transitória de infraestrutura resulta em `500`, sem ser distinguida de outros erros.
- Uma aposta rejeitada responde `balance: null`, inclusive na repetição.
- Sem encerramento gracioso (`enableShutdownHooks`).
- O trigger do ledger bloqueia `UPDATE` e `DELETE`, mas não `TRUNCATE`.
- "Toda mudança de saldo tem lançamento" é garantido pela transação na aplicação, não pelo schema.
- As migrations são aplicadas à mão, sem tabela de versões.

### Testes
- Múltiplas instâncias testadas com 2 processos; o desafio pede 3 ou mais.
- Sem teste de wallets distintas em paralelo, nem de reinício ou queda do serviço.
- Sem teste da ordem do ledger com apostas concorrentes.
- A queda do banco é simulada com uma URL inválida.
- Os testes de integração não rodam em paralelo no mesmo banco.

### Ledger
- Sem índice em `(wallet_id, created_at, id)` para a paginação.
- A ordem depende do relógio do servidor do banco.
- O cursor não é assinado.
- Cursor com data impossível que passe no `Date.parse` não foi testado.

## Uso de IA

Usei IA como assistente em modo mentor: ela orientou as etapas, propôs blocos de código e de documentação e revisou o resultado. O código foi digitado, executado, testado e commitado por mim.

Preferi entregar um escopo menor, que testei, a incluir código que eu ainda não saberia defender.