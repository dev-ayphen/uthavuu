import { Module } from '@nestjs/common';
import { PushModule } from '../push/push.module';
import { AlertsController } from './alerts.controller';
import { AlertsService } from './alerts.service';

// PushModule: every alert row is also attempted as an FCM push
// (alerts.service.ts). Importing it here rather than in AppModule keeps the
// dependency where it is actually used — and since every module that raises
// alerts already imports AlertsModule, all five call sites are covered without
// any of them changing.
@Module({
  imports: [PushModule],
  controllers: [AlertsController],
  providers: [AlertsService],
  exports: [AlertsService],
})
export class AlertsModule {}
