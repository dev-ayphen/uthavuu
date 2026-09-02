import { Module } from '@nestjs/common';
import { createPushProvider } from './push-provider.factory';
import { PushService } from './push.service';
import { PUSH_PROVIDER } from './push-provider.interface';

// Deliberately NOT registered in AppModule: AlertsModule imports it, and Nest
// instantiates the providers of an imported module eagerly during
// NestFactory.create(). That is what makes push-provider.factory.ts's
// production hard-block a genuine STARTUP failure rather than a first-send
// failure — the useFactory below runs while the app is booting.
@Module({
  providers: [
    { provide: PUSH_PROVIDER, useFactory: () => createPushProvider() },
    PushService,
  ],
  exports: [PushService],
})
export class PushModule {}
