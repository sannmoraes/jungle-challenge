import { Body, Controller, Headers, Logger, Post, Res, UseFilters } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { SubmitBetUseCase } from "../../application/submit-bet.use-case";
import { DomainExceptionFilter } from "./domain-exception.filter";
import { parseSubmitBetRequest } from "./submit-bet.request";

type StatusResponse = { status(code: number): unknown };

@Controller("wagering/transactions")
@UseFilters(DomainExceptionFilter)
export class WageringController {
  private readonly logger = new Logger(WageringController.name);
  constructor(private readonly submitBet: SubmitBetUseCase) {}

  @Post()
  async submit(
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Headers("x-request-id") requestIdHeader: string | undefined,
    @Body() body: unknown,
    @Res({ passthrough: true }) response: StatusResponse,
  ) {
    const requestId = requestIdHeader ?? randomUUID();
    const result = await this.submitBet.execute(parseSubmitBetRequest(idempotencyKey, body));
    this.logger.log({
      message: "bet processed",
      requestId,
      transactionId: result.transactionId,
      status: result.status,
      idempotentReplay: result.idempotentReplay,
    });
    response.status(result.status === "REJECTED" ? 422 : result.idempotentReplay ? 200 : 201);
    return result;
  }
}