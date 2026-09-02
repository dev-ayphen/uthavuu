import { Module } from '@nestjs/common';
import { PlatformConfigController } from './platform-config.controller';
import { PlatformConfigService } from './platform-config.service';

/** The citizen-facing `GET /config` route. The kill-switch enforcement half lives in MaintenanceModule. */
@Module({
  controllers: [PlatformConfigController],
  providers: [PlatformConfigService],
})
export class PlatformConfigModule {}
