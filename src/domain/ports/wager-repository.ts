import type { BetPayload } from "../payload-hash";

export interface ProcessBetCommand extends BetPayload {
  idempotencyKey: string;
  payloadHash: string;
}

export interface ProcessBetResult {
  transactionId: string;
  status: "PROCESSED" | "REJECTED";
  failureCode: string | null;
  balance: { amount: string; currency: string } | null;
  idempotentReplay: boolean;
}

export abstract class WagerRepository {
  abstract processBet(command: ProcessBetCommand): Promise<ProcessBetResult>;
}