import { defineConfig } from "@mikro-orm/postgresql";
import { ReflectMetadataProvider } from "@mikro-orm/decorators/legacy";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL não definida: copie .env.example para .env");
}

export default defineConfig({
  clientUrl: databaseUrl,
  entities: [],
  discovery: { warnWhenNoEntities: false },
  metadataProvider: ReflectMetadataProvider,
});