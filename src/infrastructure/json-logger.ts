import type { LoggerService } from "@nestjs/common";

export class JsonLogger implements LoggerService {
  log(message: unknown, context?: string) {
    this.write("info", message, context);
  }

  warn(message: unknown, context?: string) {
    this.write("warn", message, context);
  }

  error(message: unknown, _stack?: string, context?: string) {
    this.write("error", message, context);
  }

  private write(level: string, message: unknown, context?: string) {
    const fields = typeof message === "object" && message !== null ? message : { message };
    console.log(JSON.stringify({ timestamp: new Date().toISOString(), level, context, ...fields }));
  }
}