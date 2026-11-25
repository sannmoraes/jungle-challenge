import { Body, Controller, Headers, Post, Res, UseFilters } from "@nestjs/common";
import { SubmitBetUseCase } from "../../application/submit-bet.use-case";
import { DomainExceptionFilter } from "./domain-exception.filter";
import { parseSubmitBetRequest } from "./submit-bet.request";

type StatusResponse = { status(code: number): unknown };

@Controller("wagering/transactions")
@UseFilters(DomainExceptionFilter)
export class WageringController {
  constructor(private readonly submitBet: SubmitBetUseCase) {}

  @Post()
  async submit(
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body() body: unknown,
    @Res({ passthrough: true }) response: StatusResponse,
  ) {
    const result = await this.submitBet.execute(parseSubmitBetRequest(idempotencyKey, body));
    response.status(result.status === "REJECTED" ? 422 : result.idempotentReplay ? 200 : 201);
    return result;
  }
}