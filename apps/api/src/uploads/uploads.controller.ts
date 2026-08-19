import { BadRequestException, Controller, Post, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { avatarUploadOptions } from './multer.config';

@Controller('uploads')
export class UploadsController {
  // Auth guard is registered globally by @thallesp/nestjs-better-auth (same as
  // UsersController) — this route is authenticated by default.
  @Post()
  @UseInterceptors(FileInterceptor('file', avatarUploadOptions))
  uploadAvatar(@UploadedFile() file?: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException(
        'No image uploaded, or it was not a jpeg/png/webp under 5MB.'
      );
    }
    // Same host as the rest of the API — a placeholder for the real cloud
    // storage URL this becomes once a provider is connected (ADR 0008).
    return { url: `${process.env.BETTER_AUTH_URL}/uploads/${file.filename}` };
  }
}
