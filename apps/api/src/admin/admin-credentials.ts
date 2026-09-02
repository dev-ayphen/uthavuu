import { Injectable } from '@nestjs/common';

/**
 * The one seam through which the admin surface touches password material.
 *
 * WHY IT IS AN INTERFACE AND NOT A DIRECT `import { auth }`.
 *
 * Two independent reasons, and both matter:
 *
 *  1. `auth/auth.ts` pulls in `better-auth`, `better-auth/api`,
 *     `better-auth/adapters/drizzle` and `better-auth/plugins` — all ESM-only,
 *     and this package transforms to CommonJS for Jest. A service that imports
 *     it at module scope cannot be loaded by ANY spec (the constraint that
 *     produced admin-rbac.ts, admin-request-meta.ts and login-block.ts). The
 *     password rules of this feature — "verify the current password before
 *     writing a new one", "never put a password in an audit row" — are exactly
 *     the rules that must be tested, so they cannot live behind an unloadable
 *     import.
 *  2. It names the contract. Everything password-shaped in AdminAccountsService
 *     goes through these three methods, so "does this feature ever hash with
 *     something other than what /api/auth/sign-in/email verifies against" is
 *     answerable by reading one file.
 *
 * The production implementation below defers the ESM import to first *use*
 * rather than to import time, so registering it in AdminModule stays free —
 * admin-module-guard.spec.ts loads that module and must not drag better-auth in
 * behind it.
 */
export interface AdminCredentials {
  /**
   * Hash a plaintext password with the exact algorithm
   * `/api/auth/sign-in/email` will verify it with. Never store, log or return
   * the plaintext.
   */
  hash(password: string): Promise<string>;

  /** True when `password` matches `hash`. */
  verify(args: { hash: string; password: string }): Promise<boolean>;

  /**
   * The `account.issuer` value Better Auth's credential lookup keys on. Better
   * Auth 1.7 finds a credential account by (issuer, accountId, providerId) — see
   * the note in db/seed-admins.ts — so a row written with the wrong issuer is a
   * password nobody can sign in with.
   */
  issuer(): Promise<string>;
}

/** Nest DI token. A string token because the interface has no runtime value. */
export const ADMIN_CREDENTIALS = 'ADMIN_CREDENTIALS';

interface PasswordContext {
  hash: (password: string) => Promise<string>;
  verify: (args: { hash: string; password: string }) => Promise<boolean>;
}

/**
 * The real implementation: Better Auth's own hasher (scrypt by default),
 * reached through the live `auth` instance exactly as db/seed-admins.ts does.
 *
 * This file never implements crypto and never chooses an algorithm. If Better
 * Auth's default changes, or `emailAndPassword.password.hash` is ever
 * configured in auth.ts, this follows automatically — which is the whole point
 * of going through `auth.$context` rather than importing a hash function.
 *
 * The two `await import(...)` calls are deliberate: a static import would make
 * every spec that loads AdminModule load better-auth too. They are memoised, so
 * the module is resolved at most once per process.
 */
@Injectable()
export class BetterAuthAdminCredentials implements AdminCredentials {
  private passwordContext: PasswordContext | null = null;
  private credentialIssuer: string | null = null;

  async hash(password: string): Promise<string> {
    const context = await this.password();
    return context.hash(password);
  }

  async verify(args: { hash: string; password: string }): Promise<boolean> {
    const context = await this.password();
    return context.verify(args);
  }

  async issuer(): Promise<string> {
    if (this.credentialIssuer === null) {
      const { createLocalAccountIssuer } = await import('better-auth');
      this.credentialIssuer = createLocalAccountIssuer('credential');
    }
    return this.credentialIssuer;
  }

  private async password(): Promise<PasswordContext> {
    if (this.passwordContext === null) {
      const { auth } = await import('../auth/auth.js');
      const context = await auth.$context;
      this.passwordContext = context.password;
    }
    return this.passwordContext;
  }
}
