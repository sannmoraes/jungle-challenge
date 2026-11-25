import { Catch, type ArgumentsHost, type ExceptionFilter } from "@nestjs/common";
import { InvalidInputError, WalletAlreadyExistsError } from "../../domain/errors";

type JsonResponse = { status(code: number): { json(body: unknown): void } };

@Catch(WalletAlreadyExistsError, InvalidInputError)
export class DomainExceptionFilter implements ExceptionFilter {
  catch(error: WalletAlreadyExistsError | InvalidInputError, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<JsonResponse>();
    const status = error instanceof WalletAlreadyExistsError ? 409 : 400;
    response.status(status).json({ error: error.name, message: error.message });
  }
}