import { register } from 'node:module';

/**
 * Entry point for `node --import`. Installs ./extensionless-ts-resolver.mjs so
 * the unit tests in this package can import its ordinary, extensionless source
 * files. See that file for why this exists at all.
 */
register('./extensionless-ts-resolver.mjs', import.meta.url);
