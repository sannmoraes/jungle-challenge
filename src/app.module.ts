import { Module } from "@nestjs/common";
import { MikroOrmModule } from "@mikro-orm/nestjs";
import config from "./infrastructure/persistence/mikro-orm.config";
import { WalletRepository } from "./domain/ports/wallet-repository";
import { WagerRepository } from "./domain/ports/wager-repository";
import { MikroWalletRepository } from "./infrastructure/persistence/mikro-wallet.repository";
import { MikroWagerRepository } from "./infrastructure/persistence/mikro-wager.repository";
import { OpenWalletUseCase } from "./application/open-wallet.use-case";
import { SubmitBetUseCase } from "./application/submit-bet.use-case";
import { GetWalletUseCase } from "./application/get-wallet.use-case";
import { GetLedgerUseCase } from "./application/get-ledger.use-case";
import { WalletsController } from "./presentation/http/wallets.controller";
import { WageringController } from "./presentation/http/wagering.controller";
import { HealthController } from "./presentation/http/health.controller";

@Module({
  imports: [MikroOrmModule.forRoot(config)],
  controllers: [WalletsController, WageringController, HealthController],
  providers: [
    OpenWalletUseCase,
    SubmitBetUseCase,
    GetWalletUseCase,
    GetLedgerUseCase,        
    { provide: WalletRepository, useClass: MikroWalletRepository },
    { provide: WagerRepository, useClass: MikroWagerRepository },
  ],
})
export class AppModule {}