import { Controller, Get, ServiceUnavailableException } from "@nestjs/common";
import { EntityManager } from "@mikro-orm/postgresql";

@Controller("health")
export class HealthController {
  constructor(private readonly em: EntityManager) {}

  @Get("live")
  live() {
    return { status: "ok" };
  }

  @Get("ready")
  async ready() {
    try {
      await this.em.fork().execute("select 1");
      return { status: "ok" };
    } catch {
      throw new ServiceUnavailableException({ status: "unavailable" });
    }
  }
}