import { InvalidInputError } from "../domain/errors";
import type { LedgerCursor } from "../domain/ports/wallet-repository";
import { UUID } from "../domain/wallet";

const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/;

export function encodeCursor({ createdAt, id }: LedgerCursor): string {
  return Buffer.from(`${createdAt}|${id}`).toString("base64url");
}

export function decodeCursor(raw: unknown): LedgerCursor | undefined {
  if (raw === undefined) return undefined;
  const text = typeof raw === "string" ? Buffer.from(raw, "base64url").toString() : "";
  const [createdAt = "", id = ""] = text.split("|");
  if (!TIMESTAMP.test(createdAt) || Number.isNaN(Date.parse(createdAt)) || !UUID.test(id)) {
    throw new InvalidInputError("Invalid cursor");
  }
  return { createdAt, id };
}