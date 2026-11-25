# Distributed Wagering Processor

Um serviço que recebe apostas de provedores de jogos (por HTTP e por fila SQS) e atualiza a carteira do jogador sem duplicar nem perder dinheiro, mesmo com mensagens repetidas ou simultâneas. 

## Stack
Bun, TypeScript, NestJS, MikroORM, PostgreSQL, SQS (LocalStack), Docker Compose.

## Como rodar
```bash
bun install
docker compose up -d
```

## Testes
```bash
bun test
```