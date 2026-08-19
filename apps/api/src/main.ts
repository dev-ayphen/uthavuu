import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { UPLOADS_DIR } from './uploads/multer.config';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    // @thallesp/nestjs-better-auth needs the raw body for its own routes and
    // re-adds JSON/urlencoded parsing for everything else (see AuthModule.forRoot
    // bodyParser option in app.module.ts) — don't add express.json() separately.
    bodyParser: false,
  });
  // Serves uploaded avatars back out as plain static files — not behind the
  // global auth guard (Express static middleware runs outside Nest's router),
  // which is correct: an avatar URL needs to be publicly viewable, only the
  // upload itself (UploadsController) requires a session.
  app.useStaticAssets(UPLOADS_DIR, { prefix: '/uploads/' });
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
