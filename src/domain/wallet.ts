import { Money } from "./money";


export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class Wallet {
  private constructor(
    public readonly id: string,
    public readonly playerId: string,
    public readonly balance: Money,
    public readonly version: number,
  ) {}

  static open(id: string, playerId: string, initialBalance: Money): Wallet {
    if (!UUID.test(playerId)) throw new Error("Invalid playerId");
    return new Wallet(id, playerId, initialBalance, 1);
  }

  static rehydrate(id: string, playerId: string, balance: Money, version: number): Wallet {
    return new Wallet(id, playerId, balance, version);
  }
}