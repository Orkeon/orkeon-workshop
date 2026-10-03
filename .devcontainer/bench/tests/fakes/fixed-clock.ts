import type { Clock } from '../../src/application/ports/clock.js';

export class FixedClock implements Clock {
  constructor(private readonly instant: Date) {}

  now(): Date {
    return this.instant;
  }
}
