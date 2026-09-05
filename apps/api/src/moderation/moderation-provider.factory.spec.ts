import { createImageModerationProvider } from './moderation-provider.factory';
import { UnconfiguredModerationProvider } from './unconfigured-moderation.provider';
import { RekognitionModerationProvider } from './rekognition-moderation.provider';

// The environment is a parameter rather than a process.env read, which is the
// whole reason these cases can exist — push-provider.factory.ts made the same
// choice and its comment explains why: it makes the production block testable
// without jest.resetModules gymnastics.

describe('createImageModerationProvider', () => {
  it('uses Rekognition when a region is configured', () => {
    const provider = createImageModerationProvider({
      AI_MODERATION_PROVIDER: 'rekognition',
      AWS_REGION: 'ap-south-1',
    });

    expect(provider).toBeInstanceOf(RekognitionModerationProvider);
    expect(provider.configured).toBe(true);
    expect(provider.name).toBe('aws-rekognition');
  });

  it('defaults to Rekognition when the provider is unnamed but credentials exist', () => {
    const provider = createImageModerationProvider({
      AWS_REGION: 'ap-south-1',
    });
    expect(provider).toBeInstanceOf(RekognitionModerationProvider);
  });

  it('falls back when nothing is configured', () => {
    const provider = createImageModerationProvider({});

    expect(provider).toBeInstanceOf(UnconfiguredModerationProvider);
    expect(provider.configured).toBe(false);
  });

  it('honours an explicit opt-out outside production', () => {
    const provider = createImageModerationProvider({
      AI_MODERATION_PROVIDER: 'none',
      AWS_REGION: 'ap-south-1',
    });
    expect(provider).toBeInstanceOf(UnconfiguredModerationProvider);
  });

  it('refuses to start in production without a provider', () => {
    // The failure this prevents is quiet and expensive: with no provider every
    // photo routes to REVIEW, so the app stops publishing reports and starts
    // filling a queue nobody may be watching, with no error pointing at why.
    expect(() =>
      createImageModerationProvider({ NODE_ENV: 'production' }),
    ).toThrow(/No image moderation provider is configured/);
  });

  it('refuses to start in production when moderation is explicitly disabled', () => {
    expect(() =>
      createImageModerationProvider({
        NODE_ENV: 'production',
        AI_MODERATION_PROVIDER: 'none',
        AWS_REGION: 'ap-south-1',
      }),
    ).toThrow(/No image moderation provider is configured/);
  });

  it('starts in production when Rekognition is properly configured', () => {
    expect(() =>
      createImageModerationProvider({
        NODE_ENV: 'production',
        AI_MODERATION_PROVIDER: 'rekognition',
        AWS_REGION: 'ap-south-1',
        AWS_ACCESS_KEY_ID: 'key',
        AWS_SECRET_ACCESS_KEY: 'secret',
      }),
    ).not.toThrow();
  });

  it('does not construct a half-filled credential object', () => {
    // Passing only one of the pair would override the SDK's default chain with
    // something unusable, turning a working instance role into an auth failure
    // that looks like bad credentials rather than a missing variable.
    expect(() =>
      createImageModerationProvider({
        AWS_REGION: 'ap-south-1',
        AWS_ACCESS_KEY_ID: 'key-without-a-secret',
      }),
    ).not.toThrow();
  });
});

describe('UnconfiguredModerationProvider', () => {
  it('reports that it analysed nothing, rather than approving', () => {
    // The silent bypass the product decision forbids, asserted directly.
    const warn = jest
      .spyOn(console, 'warn')
      .mockImplementation(() => undefined);
    try {
      return new UnconfiguredModerationProvider()
        .analyzeImage()
        .then((outcome) => {
          expect(outcome).toEqual({
            status: 'unavailable',
            reason: 'not-configured',
          });
        });
    } finally {
      warn.mockRestore();
    }
  });

  it('warns once, not once per photo', async () => {
    const warn = jest
      .spyOn(console, 'warn')
      .mockImplementation(() => undefined);
    try {
      const provider = new UnconfiguredModerationProvider();
      await provider.analyzeImage();
      await provider.analyzeImage();
      await provider.analyzeImage();

      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn.mock.calls[0][0]).toMatch(/NONE will be/);
    } finally {
      warn.mockRestore();
    }
  });
});
