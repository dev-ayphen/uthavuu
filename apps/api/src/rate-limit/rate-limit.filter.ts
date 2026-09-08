import { Catch, HttpStatus } from '@nestjs/common';
import type { ArgumentsHost, ExceptionFilter } from '@nestjs/common';
import type { Response } from 'express';
import { RateLimitedException } from './rate-limited.exception';

/**
 * Puts `Retry-After` on every rate-limit refusal.
 *
 * SCOPE IS EXACTLY ONE EXCEPTION TYPE, and that is the point. This project has
 * no global exception filter yet and building one is a separate piece of work
 * (it needs a request-id story, an error registry and a decision about every
 * other exception in the codebase). A `@Catch(RateLimitedException)` filter
 * needs none of that: anything that is not a rate-limit refusal falls straight
 * through to Nest's default handling, unchanged. Nothing else in the API's error
 * behaviour moves because of this file.
 *
 * The body is passed through exactly as the exception built it, so this filter
 * only ADDS a header. That matters for the pre-existing photo-upload 429, whose
 * body shape is already in use by the mobile client.
 */
@Catch(RateLimitedException)
export class RateLimitExceptionFilter implements ExceptionFilter {
  catch(exception: RateLimitedException, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();

    // RFC 9110 §10.2.3 allows either a delay in seconds or an HTTP-date.
    // Seconds, because it needs no clock agreement between server and client —
    // a phone with a wrong clock still backs off by the right amount.
    response.setHeader('Retry-After', String(exception.retryAfterSeconds));
    response.status(HttpStatus.TOO_MANY_REQUESTS).json(exception.getResponse());
  }
}
