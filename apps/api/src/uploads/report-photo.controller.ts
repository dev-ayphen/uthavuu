// The citizen half of photo verification: upload one, and look at your own.
//
// A SIBLING OF `POST /uploads`, NOT A REPLACEMENT. Avatars and mission-completion
// photos keep using the original route unchanged — they are not sent to a
// moderation provider, they have no verdict, and they are legitimately public
// the moment they land. Extending the shared route with a `purpose` flag would
// have meant one handler branching on which rules apply, which is how the
// stricter branch eventually gets skipped.
//
// Memory storage, not disk. multer's diskStorage writes the file before any code
// has looked at it, which for this route would put an unexamined image inside a
// directory before the format was known. Buffering it means the first thing that
// touches the bytes is the inspector.

import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Param,
  Post,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Session, type UserSession } from '@thallesp/nestjs-better-auth';
import type { Response } from 'express';
import { and, eq } from 'drizzle-orm';
import { db } from '../db';
import { photoUploads } from '../db/schema/photo-verification-schema';
import { PhotoVerificationService } from '../moderation/photo-verification.service';
import { MAX_REPORT_PHOTO_BYTES } from './report-photo-limits';
import { quarantinePathFor } from './quarantine-storage';
import { maybeSweepQuarantine } from './quarantine-sweep';
import {
  UploadRateLimitError,
  checkUploadRateLimit,
} from './upload-rate-limiter';
import { ReportPhotoUploadDto } from './dto/report-photo-upload.dto';

@Controller('uploads/report-photo')
export class ReportPhotoController {
  constructor(private readonly verification: PhotoVerificationService) {}

  // Auth is the globally-registered Better Auth guard, same as UploadsController.
  @Post()
  @UseInterceptors(
    FileInterceptor('file', {
      // Deliberately no fileFilter: multer's only means of filtering is the
      // client-declared mimetype, and trusting it is the bug this route exists
      // to avoid. The size limit is real, because it can be enforced on bytes.
      limits: { fileSize: MAX_REPORT_PHOTO_BYTES },
    }),
  )
  async upload(
    @Session() session: UserSession,
    @UploadedFile() file: Express.Multer.File | undefined,
    // Body fields arrive as strings on a multipart request. `categoryKey` is a
    // real input to the verdict — relevance is judged against that category's
    // expected labels — so it is required rather than optional.
    @Body() dto: ReportPhotoUploadDto,
  ) {
    if (!file) throw new BadRequestException('No photo was uploaded.');

    // Before the file is written and before any paid call — a refused request
    // must cost nothing.
    try {
      await checkUploadRateLimit(session.user.id);
    } catch (error) {
      if (error instanceof UploadRateLimitError) {
        throw new HttpException(
          {
            code: 'UPLOAD_RATE_LIMITED',
            message: error.message,
            retryAfterSeconds: error.retryAfterSeconds,
          },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
      throw error;
    }

    // Retention cleanup rides here because there is nowhere else for it to run:
    // no cron, no queue, and on Vercel a promise left floating past the response
    // is killed with the invocation. quarantine-sweep.ts has the full reasoning.
    //
    // CONCURRENT WITH THE VERDICT, NOT AFTER IT. `verify()` waits on a
    // Rekognition round-trip; overlapping the sweep with that spends the time
    // that was being spent anyway, so the citizen usually pays nothing for it.
    // Both are awaited — nothing floats past the response — and
    // maybeSweepQuarantine() never rejects, so it cannot take the upload down
    // with it. The file this very request is about to quarantine is minutes old
    // and therefore not a sweep candidate; the age gate makes the two safe to
    // run against the same directory at the same time.
    const [result] = await Promise.all([
      this.verification.verify({
        uploaderId: session.user.id,
        bytes: file.buffer,
        categoryKey: dto.categoryKey,
      }),
      maybeSweepQuarantine(),
    ]);

    // 200 for every verdict, including reject. The request succeeded; the photo
    // is what did not. A 4xx here would make the client's error path responsible
    // for rendering a moderation outcome, and would be indistinguishable from
    // the transport actually failing.
    return result;
  }

  /**
   * Streams a quarantined photo back to the person who uploaded it.
   *
   * Exists because a held photo has no public URL by design, and the reporter
   * still needs to see the picture they just took while they finish the report.
   *
   * Ownership is checked against the session, in the WHERE clause rather than
   * after the fetch: a row that is not yours is not fetched at all, so there is
   * no window in which the wrong row exists in memory next to a permission check
   * somebody could later reorder.
   */
  @Get(':id')
  async file(
    @Session() session: UserSession,
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    const [upload] = await db
      .select({
        storedFilename: photoUploads.storedFilename,
        mimeType: photoUploads.mimeType,
      })
      .from(photoUploads)
      .where(
        and(
          eq(photoUploads.id, id),
          eq(photoUploads.uploaderId, session.user.id),
        ),
      );

    // 404 for "not yours" as well as "not found". Distinguishing them would
    // confirm the existence of another citizen's upload id.
    const path = upload && quarantinePathFor(upload.storedFilename);
    if (!path) {
      throw new HttpException(
        { code: 'UPLOAD_NOT_FOUND', message: 'Photo not found.' },
        HttpStatus.NOT_FOUND,
      );
    }

    res.type(upload.mimeType);
    // Private, no-store: this image may be refused moments from now, and a copy
    // sitting in a proxy cache would outlive the decision.
    res.setHeader('Cache-Control', 'private, no-store');
    res.sendFile(path);
  }
}
