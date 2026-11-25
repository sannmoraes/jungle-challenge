import { Catch, type ArgumentsHost, type ExceptionFilter } from "@nestjs/common";
import {
  IdempotencyConflictError,
  InvalidInputError,
  WalletAlreadyExistsError,
  WalletNotFoundError,
} from "../../domain/errors";

type JsonResponse = { status(code: number): { json(body: unknown): void } };
type DomainError =
  | WalletAlreadyExistsError
  | InvalidInputError
  | IdempotencyConflictError
  | WalletNotFoundError;

@Catch(WalletAlreadyExistsError, InvalidInputError, IdempotencyConflictError, WalletNotFoundError)
export class DomainExceptionFilter implements ExceptionFilter {
  catch(error: DomainError, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<JsonResponse>();
    let status = 400;
    if (error instanceof WalletAlreadyExistsError || error instanceof IdempotencyConflictError) status = 409;
    if (error instanceof WalletNotFoundError) status = 404;
    response.status(status).json({ error: error.name, message: error.message });
  }
}