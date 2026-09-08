import {
  BadRequestException,
  Controller,
  Post,
  Req,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Request } from 'express';
import { avatarUploadOptions } from './multer.config';
import { buildUploadUrl } from './upload-url';
import { RateLimit } from '../rate-limit/rate-limit.decorator';

@Controller('uploads')
export class UploadsController {
  // Auth guard is registered globally by @thallesp/nestjs-better-auth (same as
  // UsersController) — this route is authenticated by default.
  // Had no limit of any kind until the API-wide limiter shipped, while its
  // stricter sibling POST /uploads/report-photo has had one since photo
  // verification. Nothing here is free: every call writes a file to the API
  // host's own disk (ADR 0008), which nothing evicts automatically.
  //
  // Declared on the route rather than left to the generic `write` default
  // because the scarce resource is disk over hours, not requests per minute.
  @Post()
  @RateLimit('avatar-upload')
  @UseInterceptors(FileInterceptor('file', avatarUploadOptions))
  uploadAvatar(
    @Req() req: Request,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException(
        'No image uploaded, or it was not a jpeg/png/webp under 5MB.',
      );
    }
    // Derived from the request, not BETTER_AUTH_URL — see upload-url.ts. Still a
    // placeholder for the real cloud storage URL this becomes once a provider is
    // connected (ADR 0008); only this module changes when that happens.
    return { url: buildUploadUrl(req, file.filename) };
  }
}
