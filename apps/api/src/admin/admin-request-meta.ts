import { createParamDecorator } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';

/**
 * The provenance an audit row records alongside the change.
 *
 * Both fields are nullable and both are best-effort. Behind a proxy or a load
 * balancer `req.ip` is the proxy's address unless Express is configured to trust
 * it, and this app does not set `trust proxy` today — so the value can be an
 * internal hop rather than the admin's real address. Recorded as-is and
 * explicitly nullable rather than dressed up: an audit trail that quietly
 * asserts a wrong IP is worse than one that admits it does not know.
 */
export interface AdminRequestMeta {
  ipAddress: string | null;
  userAgent: string | null;
}

/**
 * In its own file, away from admin.decorators.ts, for the reason admin-rbac.ts
 * documents: that file imports `@thallesp/nestjs-better-auth`, which is ESM-only
 * and cannot be loaded by this repo's CommonJS Jest transform. Everything a
 * spec needs to import has to stay clear of it.
 */
export const RequestMeta = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AdminRequestMeta => {
    const request = context.switchToHttp().getRequest<{
      ip?: string;
      headers?: Record<string, string | string[] | undefined>;
      socket?: { remoteAddress?: string };
    }>();

    const userAgent = request.headers?.['user-agent'];

    return {
      ipAddress: request.ip ?? request.socket?.remoteAddress ?? null,
      userAgent: typeof userAgent === 'string' ? userAgent : null,
    };
  },
);
