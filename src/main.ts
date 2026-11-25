import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { JsonLogger } from "./infrastructure/json-logger";

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { logger: new JsonLogger() 
});
  await app.listen(Number(process.env.PORT ?? 3000));
}

bootstrap();