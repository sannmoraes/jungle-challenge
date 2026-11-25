import { Module } from "@nestjs/common";
import { MikroOrmModule } from "@mikro-orm/nestjs";
import config from "./infrastructure/persistence/mikro-orm.config";
import { WalletRepository } from "./domain/ports/wallet-repository";
import { MikroWalletRepository } from "./infrastructure/persistence/mikro-wallet.repository";
import { OpenWalletUseCase } from "./application/open-wallet.use-case";
import { WalletsController } from "./presentation/http/wallets.controller";

@Module({
  imports: [MikroOrmModule.forRoot(config)],
  controllers: [WalletsController],
  providers: [
    OpenWalletUseCase,
    { provide: WalletRepository, useClass: MikroWalletRepository },
  ],
})
export class AppModule {}