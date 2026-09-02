import { Injectable } from '@nestjs/common';
import { getPlatformConfig } from './platform-settings';
import type { PlatformConfig } from './platform-settings';

/**
 * `GET /config` — the citizen half of Platform -> App Settings.
 *
 * Named PlatformConfigService rather than ConfigService so it can never be
 * confused with `@nestjs/config`'s, which is a different thing entirely
 * (environment variables, fixed at boot) from this one (operator-editable rows,
 * changeable at runtime).
 */
@Injectable()
export class PlatformConfigService {
  get(): Promise<PlatformConfig> {
    return getPlatformConfig();
  }
}
