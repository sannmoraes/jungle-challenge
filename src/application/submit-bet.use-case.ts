import { Injectable } from "@nestjs/common";
import { InvalidInputError } from "../domain/errors";
import { Money } from "../domain/money";
import { payloadHash } from "../domain/payload-hash";
import {
  WagerRepository,
  type ProcessBetCommand,
  type ProcessBetResult,
} from "../domain/ports/wager-repository";

export interface SubmitBetInput {
  idempotencyKey: string;
  providerId: string;
  externalTransactionId: string;
  playerId: string;
  walletId: string;
  roundId: string;
  gameId: string;
  kind: string;
  amount: string;
  currency: string;
}

@Injectable()
export class SubmitBetUseCase {
  constructor(private readonly wagers: WagerRepository) {}

  async execute(input: SubmitBetInput): Promise<ProcessBetResult> {
    let command: ProcessBetCommand;
    try {
      if (input.kind !== "BET") throw new Error("Only kind BET is supported");
      const money = Money.fromString(input.amount, input.currency);
      if (money.cents === 0n) throw new Error("amount must be greater than zero");
      const payload = { ...input, amount: money.toString() };
      command = { ...payload, payloadHash: payloadHash(payload) };
    } catch (error) {
      throw new InvalidInputError(error instanceof Error ? error.message : "Invalid input");
    }
    return this.wagers.processBet(command);
  }
}