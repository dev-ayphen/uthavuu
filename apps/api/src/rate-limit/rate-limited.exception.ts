import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * The one 429 this API raises from inside Nest.
 *
 * WHY A DEDICATED CLASS RATHER THAN `new HttpException({...}, 429)`. The
 * `Retry-After` HEADER cannot be expressed in an HttpException body, and it is
 * not optional: it is the only part of a 429 that a proxy, an HTTP client
 * library or a mobile OS retry policy understands without being taught the
 * shape of our JSON. Carrying `retryAfterSeconds` as a real field lets
 * RateLimitExceptionFilter set that header for every 429 in one place, so no
 * future throw site can forget it — which is exactly what happened to the
 * existing photo-upload 429, which shipped with the body field and no header.
 *
 * The body keeps the shape the hand-rolled 429s already used, so this is
 * additive for clients: `{ code, message, retryAfterSeconds }`.
 */
export class RateLimitedException extends HttpException {
  readonly retryAfterSeconds: number;

  constructor(code: string, message: string, retryAfterSeconds: number) {
    super({ code, message, retryAfterSeconds }, HttpStatus.TOO_MANY_REQUESTS);
    this.retryAfterSeconds = retryAfterSeconds;
  }
}
