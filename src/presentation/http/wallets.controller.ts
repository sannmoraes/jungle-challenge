import { Body, Controller, HttpCode, Post, UseFilters } from "@nestjs/common";
import { OpenWalletUseCase } from "../../application/open-wallet.use-case";
import { DomainExceptionFilter } from "./domain-exception.filter";
import { parseOpenWalletBody } from "./open-wallet.request";

@Controller("wallets")
@UseFilters(DomainExceptionFilter)
export class WalletsController {
  constructor(private readonly openWallet: OpenWalletUseCase) {}

  @Post()
  @HttpCode(201)
  async open(@Body() body: unknown) {
    const wallet = await this.openWallet.execute(parseOpenWalletBody(body));
    return {
      id: wallet.id,
      playerId: wallet.playerId,
      balance: { amount: wallet.balance.toString(), currency: wallet.balance.currency },
      version: wallet.version,
    };
  }
}