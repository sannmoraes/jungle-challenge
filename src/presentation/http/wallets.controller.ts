import { Body, Controller, Get, HttpCode, Param, Post, Query, UseFilters, UseGuards } from "@nestjs/common";
import { AuthGuard } from "./auth.guard";
import { OpenWalletUseCase } from "../../application/open-wallet.use-case";
import { GetWalletUseCase } from "../../application/get-wallet.use-case";
import { GetLedgerUseCase } from "../../application/get-ledger.use-case";
import type { Wallet } from "../../domain/wallet";
import { DomainExceptionFilter } from "./domain-exception.filter";
import { parseOpenWalletBody } from "./open-wallet.request";

function toResponse(wallet: Wallet) {
  return {
    id: wallet.id,
    playerId: wallet.playerId,
    balance: { amount: wallet.balance.toString(), currency: wallet.balance.currency },
    version: wallet.version,
  };
}

@Controller("wallets")
@UseGuards(AuthGuard)
@UseFilters(DomainExceptionFilter)
export class WalletsController {
  constructor(
    private readonly openWallet: OpenWalletUseCase,
    private readonly getWallet: GetWalletUseCase,
    private readonly getLedger: GetLedgerUseCase,    
  ) {}

  @Post()
  @HttpCode(201)
  async open(@Body() body: unknown) {
    const wallet = await this.openWallet.execute(parseOpenWalletBody(body));
    return toResponse(wallet);
  }

  @Get(":walletId")
  async findOne(@Param("walletId") walletId: string) {
    return toResponse(await this.getWallet.execute(walletId));
  }


  @Get(":walletId/ledger")
  async ledger(
    @Param("walletId") walletId: string,
    @Query("limit") limit: unknown,
    @Query("cursor") cursor: unknown,
  ) {
    return this.getLedger.execute(walletId, limit, cursor);
  }
}