export class WalletAlreadyExistsError extends Error {
  constructor(
    readonly playerId: string,
    readonly currency: string,
  ) {
    super(`Wallet already exists for player ${playerId} in ${currency}`);
    this.name = "WalletAlreadyExistsError";
  }
}

export class InvalidInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidInputError";
  }
}

export class IdempotencyConflictError extends Error {
  constructor(readonly key: string) {
    super(`Idempotency key ${key} was already used with a different payload`);
    this.name = "IdempotencyConflictError";
  }
}

export class WalletNotFoundError extends Error {
  constructor(readonly walletId: string) {
    super(`Wallet ${walletId} not found`);
    this.name = "WalletNotFoundError";
  }
}