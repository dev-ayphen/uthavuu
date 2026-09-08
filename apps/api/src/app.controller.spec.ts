/**
 * AppController now carries @AllowAnonymous() so `GET /` can serve as a liveness
 * probe, which means this spec imports @thallesp/nestjs-better-auth transitively.
 * That package is ESM-only and cannot be loaded by this repo's CommonJS Jest
 * transform, so it is mocked — the same workaround, for the same reason, as
 * admin-module-guard.spec.ts and admin-report-photos.controller.spec.ts.
 *
 * The decorator is metadata only, and what it means is asserted for real in
 * rate-limit/rate-limit-routes.spec.ts against the genuine metadata key.
 */
jest.mock('@thallesp/nestjs-better-auth', () => ({
  AllowAnonymous: () => () => undefined,
}));

import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { AppService } from './app.service';

describe('AppController', () => {
  let appController: AppController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [AppService],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  describe('root', () => {
    it('should return "Hello World!"', () => {
      expect(appController.getHello()).toBe('Hello World!');
    });
  });
});
