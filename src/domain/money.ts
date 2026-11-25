export class Money {
  private constructor(
    public readonly cents: bigint,
    public readonly currency: string,
  ) {}

  static fromCents(cents: bigint, currency: string): Money {
    if (cents < 0n) throw new Error("Money cannot be negative");
    if (!/^[A-Z]{3}$/.test(currency)) throw new Error("Invalid currency");
    return new Money(cents, currency);
  }

  add(other: Money): Money {
    if (this.currency !== other.currency) throw new Error("Currency mismatch");
    return Money.fromCents(this.cents + other.cents, this.currency);
  }

  subtract(other: Money): Money {
    if (this.currency !== other.currency) throw new Error("Currency mismatch");
    if (this.cents < other.cents) throw new Error("Resulting money cannot be negative");
    return Money.fromCents(this.cents - other.cents, this.currency);
  }

  toString(): string {
    const whole = this.cents / 100n;
    const fraction = this.cents % 100n;
    return `${whole}.${String(fraction).padStart(2, "0")}`;
  }
}