# Arquitetura

Decisões desta entrega e o motivo de cada uma. O que ficou de fora está nas [limitações do README](README.md#limitações).

## Camadas

| Pasta | O que tem |
| --- | --- |
| `src/domain` | `Money`, `Wallet`, hash do payload, erros e as portas dos repositórios |
| `src/application` | casos de uso (abrir wallet, apostar, consultar wallet e ledger) e o cursor do ledger |
| `src/infrastructure` | repositórios em SQL, configuração do MikroORM e logger JSON |
| `src/presentation` | controllers, leitura das requisições, `AuthGuard` e filtro de erros |

O domínio não importa Nest nem ORM. A camada de aplicação usa do Nest apenas o decorator `@Injectable`, para a injeção de dependências. Os casos de uso acessam os dados pelas portas (`WalletRepository`, `WagerRepository`), sem conhecer o SQL.

## Persistência: MikroORM

- É o ORM que o desafio indica como preferencial.
- Uso o MikroORM para a conexão e as transações (`em.fork().transactional()`). O SQL é escrito à mão e não há entidades mapeadas (`entities: []`).
- Motivo: as operações que protegem o saldo (`INSERT ... ON CONFLICT` e `UPDATE` condicionado) ficam visíveis no código, como o banco as executa.
- Custo: não aproveito Unit of Work, Identity Map nem mapeamento automático; as linhas são convertidas à mão.

## Dinheiro (`Money`)

- No domínio, o valor é um `bigint` em centavos junto com a moeda: sem ponto flutuante e sem o limite de precisão do `number`.
- Nos contratos HTTP, é um texto com exatamente duas casas (`"25.00"`). Valor negativo ou em outro formato é recusado.
- No banco, é `numeric(19,2)`, lido como texto para não passar por `number`.
- Na aposta, a conta do saldo é feita pelo PostgreSQL, dentro do `UPDATE`. `Money.add` e `Money.subtract` têm testes, mas o fluxo da aplicação não os usa.
- Não usei biblioteca decimal: com escala fixa de duas casas, centavos em inteiro bastam.

## Transação e concorrência

A aposta roda numa única transação, no nível de isolamento padrão do PostgreSQL (`READ COMMITTED`):

1. `INSERT` em `wager_transactions` com `ON CONFLICT DO NOTHING`, que reserva a `Idempotency-Key`.
2. `UPDATE` da wallet, que só debita se `id`, `player_id` e `currency` conferem e `balance >= valor`.
3. Lançamento no ledger.
4. Transação marcada como `PROCESSED`, com o saldo resultante.

Se o `UPDATE` não altera nenhuma linha, a transação é gravada como `REJECTED`, sem lançamento. Se qualquer passo dá erro, nada é gravado.

**Por que um `UPDATE` condicionado.** Ler o saldo, decidir no código e só depois gravar permitiria que duas apostas de `80.00` lessem um saldo de `100.00` e fossem ambas aprovadas. Com a condição dentro do `UPDATE`, o PostgreSQL trava a linha da wallet: a segunda aposta espera a primeira, reavalia a condição com saldo `20.00` e não debita.

Alternativas consideradas:
- `SELECT ... FOR UPDATE` também resolveria, com uma consulta a mais e a linha travada por mais tempo.
- Lock otimista pela coluna `version` exigiria repetir a operação quando há disputa. A coluna é incrementada, mas não é usada como lock.

**Várias instâncias.** Não há lock em memória nem lock global: as instâncias compartilham apenas o PostgreSQL. Apostas na mesma wallet são feitas uma de cada vez; wallets diferentes não disputam a mesma linha.

**O banco como última barreira.** As regras também estão no schema: saldo não negativo; uma wallet por jogador e moeda; `idempotency_key` única; `providerId` + `externalTransactionId` únicos; um lançamento por wallet e transação; `balance_before` mais ou menos `amount` igual a `balance_after`; e um trigger que bloqueia `UPDATE` e `DELETE` no ledger.

**Ordem do extrato.** Na aposta, o lançamento usa `clock_timestamp()`, lido com a wallet já travada. `now()` devolveria o horário de início da transação, que pode não seguir a ordem dos débitos.

## Idempotência

- A garantia é o `UNIQUE` em `idempotency_key`. Uma segunda requisição simultânea com a mesma key espera a primeira no `INSERT` e depois lê o resultado gravado.
- Mesma key e mesmo payload: devolve o resultado original, sem debitar de novo, com o saldo da época. Uma aposta rejeitada continua rejeitada.
- Mesma key com payload diferente, ou mesmo `providerId` + `externalTransactionId` com outra key: `409`.
- Entrada inválida (`400`) e wallet inexistente (`404`) não gravam nada, e a key continua livre.

### `payloadHash`

SHA-256, em hexadecimal, de um JSON com estes campos em ordem alfabética: `amount`, `currency`, `externalTransactionId`, `gameId`, `kind`, `playerId`, `providerId`, `roundId`, `walletId`.

- O `amount` é normalizado antes (`"025.00"` vira `"25.00"`).
- A `Idempotency-Key` e o `x-request-id` não entram no hash.
- Os UUIDs não são normalizados: o mesmo UUID com outra combinação de maiúsculas e minúsculas gera outro hash, e a repetição responde `409`.

## Códigos de falha

Uma aposta rejeitada responde `422`, com `status: "REJECTED"` e um `failureCode`:

| `failureCode` | Motivo | O que o provedor pode fazer |
| --- | --- | --- |
| `PLAYER_MISMATCH` | a wallet é de outro jogador | corrigir `playerId` ou `walletId` |
| `CURRENCY_MISMATCH` | a moeda da aposta não é a da wallet | corrigir a moeda ou a wallet |
| `INSUFFICIENT_FUNDS` | saldo menor que o valor | desistir ou apostar um valor menor |

A rejeição fica gravada: repetir a mesma requisição devolve a mesma rejeição. Para uma nova tentativa, é preciso enviar `Idempotency-Key` e `externalTransactionId` novos.

Se há mais de um motivo, a ordem é a da tabela.

Os demais erros não gravam transação: `400` (corrigir a requisição), `404` (wallet inexistente) e `409` (key ou `externalTransactionId` já usados). Sem resposta ou com `500`, reenviar com a mesma key não debita duas vezes.

**Interpretação adotada (`PLAYER_MISMATCH`).** Uma aposta com o `playerId` de um jogador e a wallet de outro é tratada como rejeição de negócio: não debita, fica registrada para auditoria e a resposta não mostra o saldo da wallet.

## Estados da transação

- `PENDING` → `PROCESSED`: o débito foi feito.
- `PENDING` → `REJECTED`: o `UPDATE` não debitou.

`PENDING` existe só dentro da transação do banco, e outras conexões não o veem. A transação `OPENING` já é gravada como `PROCESSED`. `PROCESSED` e `REJECTED` são finais: o código não altera uma transação concluída, mas não há validação no domínio nem no banco que impeça isso. `PENDING_REFERENCE` e `FAILED` são aceitos pelo schema e não são usados.

## Autenticação

Não foi implementada: priorizei a correção do saldo, a concorrência e a idempotência. O ponto de extensão é o `AuthGuard` em `src/presentation/http/auth.guard.ts`, que hoje libera tudo. Ele está aplicado nas rotas de wallets e apostas; os health checks ficam de fora.

Desenho que eu adotaria:

1. Um provedor de identidade externo (OIDC) emite um token para cada provedor de jogos.
2. O `canActivate` valida o token (assinatura, emissor, audiência e validade) e responde `401` se falhar.
3. O `providerId` do token precisa ser igual ao do corpo da aposta; senão, `403`.
4. Abrir e consultar wallets exigiria uma permissão própria de serviço interno.

## Trade-offs

| Escolha | Ganho | Custo |
| --- | --- | --- |
| Escopo só com `BET` | foco em saldo, concorrência e idempotência | reversões, filas e eventos ficaram fora |
| Regra do saldo no SQL | atômica entre instâncias | domínio com pouca regra; só testável com banco |
| SQL escrito à mão | consultas visíveis | mapeamento manual |
| Trava na linha da wallet | simples, sem repetição | apostas na mesma wallet esperam em fila |

A lista completa está nas [limitações do README](README.md#limitações).