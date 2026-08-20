import { Module } from '@nestjs/common';
import { DevOtpController } from './dev-otp.controller';

@Module({
  controllers: [DevOtpController],
})
export class DevModule {}
