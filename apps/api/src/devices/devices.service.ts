import { Injectable } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';
import { db } from '../db';
import { devices } from '../db/schema/devices-schema';
import type { RegisterDeviceDto } from './dto/register-device.dto';

@Injectable()
export class DevicesService {
  // Upserts by pushToken — a device re-registering (including under a
  // different account after logout/login on the same phone) updates the
  // existing row rather than creating a duplicate.
  async register(userId: string, input: RegisterDeviceDto) {
    const [device] = await db
      .insert(devices)
      .values({ id: uuidv7(), userId, pushToken: input.token, platform: input.platform })
      .onConflictDoUpdate({
        target: devices.pushToken,
        set: { userId, platform: input.platform, updatedAt: sql`now()` },
      })
      .returning();

    return device;
  }
}
