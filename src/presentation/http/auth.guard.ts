import { Injectable, type CanActivate } from "@nestjs/common";

// Ponto de extensão para autenticação: hoje libera todas as requisições.
@Injectable()
export class AuthGuard implements CanActivate {
  canActivate(): boolean {
    return true;
  }
}