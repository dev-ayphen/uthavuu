import {
  DetectLabelsCommand,
  DetectModerationLabelsCommand,
  ImageTooLargeException,
  InvalidImageFormatException,
  ProvisionedThroughputExceededException,
  RekognitionClient,
  ThrottlingException,
} from '@aws-sdk/client-rekognition';
import {
  RekognitionModerationProvider,
  hasRekognitionCredentials,
} from './rekognition-moderation.provider';

// No AWS credentials exist in this environment, so the network call itself is
// BLOCKED and reported as such. What can be proven — and is proven here — is
// everything around it: that a real Rekognition response shape maps onto the
// analysis contract without losing the fields the decision engine reads, and
// that every documented failure maps to the right unavailable reason.
//
// The response fixtures follow the published DetectModerationLabels and
// DetectLabels reference: ModerationLabels[{Name,ParentName,TaxonomyLevel,
// Confidence}], ContentTypes[], ModerationModelVersion, Labels[{Name,Confidence,
// Parents,Categories}] and ImageProperties.Quality{Brightness,Sharpness,Contrast}.

/**
 * `send` is heavily overloaded and one overload takes a node-style callback, so
 * the raw spy's inferred return type is `void`. Narrowing it here is what lets
 * the mocks resolve a promise without tripping no-misused-promises at every
 * call site.
 */
type SendSpy = jest.SpyInstance<Promise<unknown>, [unknown]>;

function sendSpy(): SendSpy {
  return jest.spyOn(RekognitionClient.prototype, 'send') as unknown as SendSpy;
}

function mockSend(handler: (command: unknown) => unknown): SendSpy {
  const spy = sendSpy();
  spy.mockImplementation((command) => Promise.resolve(handler(command)));
  return spy;
}

const MODERATION_RESPONSE = {
  ModerationLabels: [
    { Name: 'Violence', ParentName: '', TaxonomyLevel: 1, Confidence: 91.2 },
    {
      Name: 'Graphic Violence',
      ParentName: 'Violence',
      TaxonomyLevel: 2,
      Confidence: 91.2,
    },
    {
      Name: 'Blood & Gore',
      ParentName: 'Graphic Violence',
      TaxonomyLevel: 3,
      Confidence: 91.2,
    },
  ],
  ContentTypes: [{ Name: 'Illustrated', Confidence: 12.5 }],
  ModerationModelVersion: '7.0',
};

const LABELS_RESPONSE = {
  Labels: [
    {
      Name: 'Dog',
      Confidence: 98.1,
      Parents: [{ Name: 'Animal' }, { Name: 'Pet' }],
      Categories: [{ Name: 'Animals and Pets' }],
    },
  ],
  ImageProperties: {
    Quality: { Brightness: 61.4, Sharpness: 55.2, Contrast: 48.9 },
  },
  LabelModelVersion: '3.0',
};

function provider() {
  return new RekognitionModerationProvider('ap-south-1', {
    accessKeyId: 'test',
    secretAccessKey: 'test',
  });
}

const request = {
  bytes: Buffer.from([0xff, 0xd8, 0xff]),
  format: 'jpeg' as const,
};

afterEach(() => {
  jest.restoreAllMocks();
});

describe('response mapping', () => {
  it('maps a real response onto the analysis contract', async () => {
    mockSend((command) =>
      command instanceof DetectModerationLabelsCommand
        ? MODERATION_RESPONSE
        : LABELS_RESPONSE,
    );

    const outcome = await provider().analyzeImage(request);

    expect(outcome.status).toBe('analysed');
    if (outcome.status !== 'analysed') return;
    const { analysis } = outcome;

    // The ancestor chain must survive intact — the gore carve-out reads
    // parentName to work out which children fired.
    expect(analysis.labels).toHaveLength(3);
    expect(analysis.labels[2]).toEqual({
      name: 'Blood & Gore',
      parentName: 'Graphic Violence',
      taxonomyLevel: 3,
      confidence: 91.2,
    });

    // An empty ParentName is Rekognition's way of saying "top level"; it has to
    // become null, not "", or a case-insensitive compare against "" would match.
    expect(analysis.labels[0].parentName).toBeNull();

    expect(analysis.contentTypes).toEqual([
      { name: 'Illustrated', confidence: 12.5 },
    ]);
    expect(analysis.quality).toEqual({
      brightness: 61.4,
      sharpness: 55.2,
      contrast: 48.9,
    });
    expect(analysis.moderationModelVersion).toBe('7.0');
    expect(analysis.labelModelVersion).toBe('3.0');
  });

  it('flattens Parents and Categories so relevance can match an ancestor', async () => {
    mockSend((command) =>
      command instanceof DetectModerationLabelsCommand
        ? MODERATION_RESPONSE
        : LABELS_RESPONSE,
    );

    const outcome = await provider().analyzeImage(request);
    if (outcome.status !== 'analysed') throw new Error('expected analysis');

    expect(outcome.analysis.sceneLabels).toEqual([
      {
        name: 'Dog',
        confidence: 98.1,
        parents: ['Animal', 'Pet', 'Animals and Pets'],
      },
    ]);
  });

  it('requests both label features, or image quality is silently absent', async () => {
    // IMAGE_PROPERTIES is opt-in. Omitting it returns no Quality block at all,
    // which would make every photo's quality "unknown" and quietly disable the
    // unusable-photo rejection.
    const commands: unknown[] = [];
    mockSend((command) => {
      commands.push(command);
      return command instanceof DetectModerationLabelsCommand
        ? MODERATION_RESPONSE
        : LABELS_RESPONSE;
    });

    await provider().analyzeImage(request);

    const labelCommand = commands.find(
      (command) => command instanceof DetectLabelsCommand,
    ) as DetectLabelsCommand;
    expect(labelCommand.input.Features).toEqual([
      'GENERAL_LABELS',
      'IMAGE_PROPERTIES',
    ]);
  });

  it('sends raw bytes rather than an S3 reference', async () => {
    // Keeps ADR 0008's local-disk decision intact: no bucket is required.
    const commands: unknown[] = [];
    mockSend((command) => {
      commands.push(command);
      return command instanceof DetectModerationLabelsCommand
        ? MODERATION_RESPONSE
        : LABELS_RESPONSE;
    });

    await provider().analyzeImage(request);

    const moderationCommand = commands.find(
      (command) => command instanceof DetectModerationLabelsCommand,
    ) as DetectModerationLabelsCommand;
    expect(moderationCommand.input.Image?.Bytes).toBe(request.bytes);
    expect(moderationCommand.input.Image?.S3Object).toBeUndefined();
  });

  it('drops malformed entries instead of propagating undefined into comparisons', async () => {
    mockSend((command) =>
      command instanceof DetectModerationLabelsCommand
        ? {
            ModerationLabels: [
              { Name: 'Violence', Confidence: 80, TaxonomyLevel: 1 },
              { Name: 'Missing confidence' },
              { Confidence: 90 },
            ],
            ContentTypes: [{ Name: 'Animated' }],
          }
        : { Labels: [], ImageProperties: {} },
    );

    const outcome = await provider().analyzeImage(request);
    if (outcome.status !== 'analysed') throw new Error('expected analysis');

    expect(outcome.analysis.labels).toHaveLength(1);
    expect(outcome.analysis.contentTypes).toEqual([]);
    // A missing Quality block must read as unknown, never as a passing score.
    expect(outcome.analysis.quality).toBeNull();
  });
});

describe('failure classification', () => {
  const meta = { $metadata: {} };

  function failWith(error: Error) {
    sendSpy().mockImplementation(() => Promise.reject(error));
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  }

  it('treats an oversized image as permanently rejected, not retryable', async () => {
    failWith(new ImageTooLargeException({ message: 'too big', ...meta }));
    await expect(provider().analyzeImage(request)).resolves.toEqual({
      status: 'unavailable',
      reason: 'rejected-image',
    });
  });

  it('treats an unreadable format as permanently rejected', async () => {
    failWith(new InvalidImageFormatException({ message: 'nope', ...meta }));
    await expect(provider().analyzeImage(request)).resolves.toEqual({
      status: 'unavailable',
      reason: 'rejected-image',
    });
  });

  it('treats throttling as transient', async () => {
    failWith(new ThrottlingException({ message: 'slow down', ...meta }));
    await expect(provider().analyzeImage(request)).resolves.toEqual({
      status: 'unavailable',
      reason: 'throttled',
    });
  });

  it('treats exceeded provisioned throughput as transient', async () => {
    failWith(
      new ProvisionedThroughputExceededException({ message: 'over', ...meta }),
    );
    await expect(provider().analyzeImage(request)).resolves.toEqual({
      status: 'unavailable',
      reason: 'throttled',
    });
  });

  it('recognises an aborted call as a timeout', async () => {
    const aborted = new Error('aborted');
    aborted.name = 'TimeoutError';
    failWith(aborted);

    await expect(provider().analyzeImage(request)).resolves.toEqual({
      status: 'unavailable',
      reason: 'timeout',
    });
  });

  it('falls back to provider-error for anything else', async () => {
    failWith(new Error('connection reset'));
    await expect(provider().analyzeImage(request)).resolves.toEqual({
      status: 'unavailable',
      reason: 'provider-error',
    });
  });

  it('never throws, and never leaks the provider error', async () => {
    const warn = jest
      .spyOn(console, 'warn')
      .mockImplementation(() => undefined);
    sendSpy().mockImplementation(() =>
      Promise.reject(
        new Error('AccessDenied for arn:aws:iam::123456789012:user/leaky'),
      ),
    );

    // A citizen reporting an emergency must never see a 500 because a
    // moderation API was unreachable.
    await expect(provider().analyzeImage(request)).resolves.toMatchObject({
      status: 'unavailable',
    });

    const logged = warn.mock.calls.map((call) => String(call[0])).join(' ');
    expect(logged).not.toContain('arn:aws:iam');
    expect(logged).not.toContain('AccessDenied');
  });
});

describe('hasRekognitionCredentials', () => {
  it('requires a region — the SDK can find credentials but cannot guess a region', () => {
    expect(hasRekognitionCredentials({ AWS_REGION: 'ap-south-1' })).toBe(true);
    expect(
      hasRekognitionCredentials({
        AWS_ACCESS_KEY_ID: 'k',
        AWS_SECRET_ACCESS_KEY: 's',
      }),
    ).toBe(false);
    expect(hasRekognitionCredentials({})).toBe(false);
  });
});
