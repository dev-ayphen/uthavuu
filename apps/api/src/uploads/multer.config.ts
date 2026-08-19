import { existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';
import { diskStorage } from 'multer';
import type { MulterOptions } from '@nestjs/platform-express/multer/interfaces/multer-options.interface';

// Local disk for now, not a cloud bucket — see
// docs/decisions/0008-local-disk-photo-storage.md. UPLOADS_DIR defaults to a
// repo-relative folder so the same path works whether the API runs on the
// host or in Docker (the compose volume mounts onto this exact path).
export const UPLOADS_DIR = process.env.UPLOADS_DIR ?? join(process.cwd(), 'uploads');

if (!existsSync(UPLOADS_DIR)) {
  mkdirSync(UPLOADS_DIR, { recursive: true });
}

const ALLOWED_MIME_TYPES: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
};
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // a phone camera photo, not raw

export const avatarUploadOptions: MulterOptions = {
  storage: diskStorage({
    destination: UPLOADS_DIR,
    filename: (_req, file, cb) => {
      cb(null, `${randomUUID()}${ALLOWED_MIME_TYPES[file.mimetype] ?? '.jpg'}`);
    },
  }),
  limits: { fileSize: MAX_FILE_SIZE_BYTES },
  fileFilter: (_req, file, cb) => {
    cb(null, file.mimetype in ALLOWED_MIME_TYPES);
  },
};
