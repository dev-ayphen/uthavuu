import { Body, Controller, Post } from '@nestjs/common';
import { Session, type UserSession } from '@thallesp/nestjs-better-auth';
import type { auth } from '../auth/auth';
import { DevicesService } from './devices.service';
import { RegisterDeviceDto } from './dto/register-device.dto';

@Controller('devices')
export class DevicesController {
  constructor(private readonly devicesService: DevicesService) {}

  // Auth guard is registered globally by @thallesp/nestjs-better-auth — this
  // route is authenticated by default.
  @Post()
  register(@Session() session: UserSession<typeof auth>, @Body() body: RegisterDeviceDto) {
    return this.devicesService.register(session.user.id, body);
  }
}
