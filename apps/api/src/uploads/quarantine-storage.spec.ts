import { existsSync, rmSync } from 'fs';
import { join, resolve, sep } from 'path';
import { UPLOADS_DIR } from './multer.config';
import {
  QUARANTINE_DIR,
  discardQuarantined,
  promoteToPublic,
  quarantinePathFor,
  writeQuarantined,
} from './quarantine-storage';

// The property under test is the whole point of the module: a photo awaiting a
// verdict must not be reachable by the static middleware `main.ts` mounts on
// UPLOADS_DIR. Everything else here is in service of that one invariant.

describe('quarantine location', () => {
  it('is outside the publicly-served uploads directory', () => {
    const publicRoot = resolve(UPLOADS_DIR);
    const quarantineRoot = resolve(QUARANTINE_DIR);

    expect(quarantineRoot).not.toBe(publicRoot);
    expect(quarantineRoot.startsWith(publicRoot + sep)).toBe(false);
  });

  it('refuses to load if pointed inside the public directory', () => {
    // A one-word misconfiguration — QUARANTINE_DIR=./uploads/pending — would
    // publish every unverified photo, and would do it silently. This asserts the
    // module treats that as fatal rather than merely wrong, matching the
    // precedent in push-provider.factory.ts.
    jest.resetModules();
    const saved = process.env.QUARANTINE_DIR;
    process.env.QUARANTINE_DIR = join(UPLOADS_DIR, 'pending');

    try {
      // require(), not import: the assertion is that module EVALUATION throws,
      // which only a fresh synchronous load after resetModules can observe.
      /* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-return */
      expect(() => require('./quarantine-storage')).toThrow(
        /served publicly by static middleware/i,
      );
      /* eslint-enable @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-return */
    } finally {
      if (saved === undefined) delete process.env.QUARANTINE_DIR;
      else process.env.QUARANTINE_DIR = saved;
      jest.resetModules();
    }
  });
});

describe('quarantine lifecycle', () => {
  const written: string[] = [];

  afterAll(() => {
    for (const name of written) {
      for (const dir of [QUARANTINE_DIR, UPLOADS_DIR]) {
        const path = join(dir, name);
        if (existsSync(path)) rmSync(path, { force: true });
      }
    }
  });

  async function store(): Promise<string> {
    const name = await writeQuarantined(
      Buffer.from([0xff, 0xd8, 0xff]),
      'jpeg',
    );
    written.push(name);
    return name;
  }

  it('writes into quarantine, not into public uploads', async () => {
    const name = await store();

    expect(existsSync(join(QUARANTINE_DIR, name))).toBe(true);
    expect(existsSync(join(UPLOADS_DIR, name))).toBe(false);
  });

  it('names the file from the sniffed format, never a client filename', async () => {
    const name = await store();
    expect(name).toMatch(/^[0-9a-f-]{36}\.jpg$/);
  });

  it('resolves a stored file and reports a missing one as undefined', async () => {
    const name = await store();

    expect(quarantinePathFor(name)).toBe(join(QUARANTINE_DIR, name));
    expect(quarantinePathFor('never-written.jpg')).toBeUndefined();
  });

  it('refuses names that try to escape the directory', () => {
    // These come back out of a database column, and treating a column as
    // trusted is how this class of bug reaches production a second time.
    expect(quarantinePathFor('../multer.config.ts')).toBeUndefined();
    expect(quarantinePathFor('nested/file.jpg')).toBeUndefined();
    expect(quarantinePathFor('back\\slash.jpg')).toBeUndefined();
    expect(quarantinePathFor('')).toBeUndefined();
  });

  it('promotes a file into public storage and leaves nothing behind', async () => {
    const name = await store();

    await expect(promoteToPublic(name)).resolves.toBe(name);
    expect(existsSync(join(UPLOADS_DIR, name))).toBe(true);
    // No window in which both copies exist — a leftover quarantine copy would
    // mean a rejected photo could still be promoted twice.
    expect(existsSync(join(QUARANTINE_DIR, name))).toBe(false);
  });

  it('promotes across a filesystem boundary when rename cannot', async () => {
    // Regression for the 500 that only a real container run surfaced. Docker
    // mounts UPLOADS_DIR as a named volume while QUARANTINE_DIR sits on the
    // container's own layer, so rename() fails EXDEV on every approval in a
    // deployed environment. Simulated here by forcing the error, because a
    // spec cannot conjure a second filesystem.
    const name = await store();
    const promises =
      jest.requireActual<typeof import('fs/promises')>('fs/promises');
    const crossDevice: NodeJS.ErrnoException = new Error(
      'EXDEV: cross-device link not permitted',
    );
    crossDevice.code = 'EXDEV';

    const renameSpy = jest
      .spyOn(promises, 'rename')
      .mockRejectedValueOnce(crossDevice);

    try {
      await expect(promoteToPublic(name)).resolves.toBe(name);
      expect(existsSync(join(UPLOADS_DIR, name))).toBe(true);
      // The source must still be gone — a copy that leaves the original behind
      // would keep a "quarantined" duplicate of a now-public photo.
      expect(existsSync(join(QUARANTINE_DIR, name))).toBe(false);
    } finally {
      renameSpy.mockRestore();
    }
  });

  it('does not swallow a promotion failure that is not a device boundary', async () => {
    const name = await store();
    const promises =
      jest.requireActual<typeof import('fs/promises')>('fs/promises');
    const denied: NodeJS.ErrnoException = new Error(
      'EACCES: permission denied',
    );
    denied.code = 'EACCES';

    const renameSpy = jest
      .spyOn(promises, 'rename')
      .mockRejectedValueOnce(denied);

    try {
      await expect(promoteToPublic(name)).rejects.toThrow(/EACCES/);
    } finally {
      renameSpy.mockRestore();
    }
  });

  it('cannot promote a file that was never quarantined', async () => {
    await expect(promoteToPublic('never-written.jpg')).resolves.toBeUndefined();
  });

  it('discards a file, and discarding twice is not an error', async () => {
    const name = await store();

    await discardQuarantined(name);
    expect(existsSync(join(QUARANTINE_DIR, name))).toBe(false);
    await expect(discardQuarantined(name)).resolves.toBeUndefined();
  });
});
