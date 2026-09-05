import type {
  ModerationAnalysis,
  ModerationLabel,
  ModerationOutcome,
  ModerationUnavailableReason,
} from './image-moderation-provider.interface';
import {
  decideVerification,
  type DecisionInput,
} from './verification-decision';

// The policy is the product decision, so these are the tests that matter most —
// and they run without an AWS account, because the engine is pure. Fabricated
// signal sets are the point: they let a reviewer read what the rules DO rather
// than trusting that a live provider happened to return something plausible.

function analysis(over: Partial<ModerationAnalysis> = {}): ModerationAnalysis {
  return {
    labels: [],
    contentTypes: [],
    sceneLabels: [],
    // A neutral, clearly usable photo unless a case says otherwise.
    quality: { brightness: 70, sharpness: 65, contrast: 60 },
    moderationModelVersion: '7.0',
    labelModelVersion: '3.0',
    ...over,
  };
}

function decide(
  over: Partial<ModerationAnalysis> = {},
  input: Partial<DecisionInput> = {},
) {
  const outcome: ModerationOutcome = {
    status: 'analysed',
    analysis: analysis(over),
  };
  return decideVerification({
    outcome,
    duplicateDistance: null,
    exactDuplicate: false,
    expectedLabels: null,
    ...input,
  });
}

/** Rekognition returns the whole ancestor chain, so fixtures must too. */
function chain(
  l1: string,
  l2: string | null,
  l3: string | null,
  confidence: number,
): ModerationLabel[] {
  const labels: ModerationLabel[] = [
    { name: l1, parentName: null, taxonomyLevel: 1, confidence },
  ];
  if (l2)
    labels.push({ name: l2, parentName: l1, taxonomyLevel: 2, confidence });
  if (l3)
    labels.push({ name: l3, parentName: l2, taxonomyLevel: 3, confidence });
  return labels;
}

describe('a clean photo', () => {
  it('passes when nothing fires', () => {
    const decision = decide();
    expect(decision.verdict).toBe('pass');
    expect(decision.riskLevel).toBe('low');
    expect(decision.reasons).toEqual([]);
    expect(decision.signals.decision).toBe('pass');
  });
});

describe('the emergency carve-out', () => {
  // The single most important behaviour in this file. Uthavu exists to carry
  // photographs of injured animals and accident scenes; a moderation policy
  // tuned for a social feed holds every one of them.
  it('publishes an injured-animal photo whose only violence signal is blood', () => {
    const decision = decide({
      labels: chain('Violence', 'Graphic Violence', 'Blood & Gore', 88),
    });

    expect(decision.verdict).toBe('pass');
    expect(decision.reasons).not.toContain('graphic-violence');
    // Still reported honestly as a high violence signal, even though it published.
    expect(decision.signals.violence).toBe('high');
  });

  it('still holds blood the model is near-certain about', () => {
    const decision = decide({
      labels: chain('Violence', 'Graphic Violence', 'Blood & Gore', 95),
    });
    expect(decision.verdict).toBe('review');
    expect(decision.reasons).toContain('graphic-violence');
  });

  it('does not extend the carve-out to a fight', () => {
    // Physical Violence is deliberately outside EMERGENCY_EXPECTED_LABELS, so
    // the ordinary bar applies and a human looks at it.
    const decision = decide({
      labels: chain('Violence', 'Graphic Violence', 'Physical Violence', 85),
    });
    expect(decision.verdict).toBe('review');
    expect(decision.reasons).toContain('graphic-violence');
  });

  it('does not extend the carve-out when blood accompanies self-harm', () => {
    const decision = decide({
      labels: [
        ...chain('Violence', 'Graphic Violence', 'Blood & Gore', 88),
        {
          name: 'Self-Harm',
          parentName: 'Graphic Violence',
          taxonomyLevel: 3,
          confidence: 84,
        },
      ],
    });
    expect(decision.verdict).toBe('review');
  });
});

describe('rejections', () => {
  it('rejects high-confidence explicit content', () => {
    const decision = decide({
      labels: chain(
        'Explicit',
        'Explicit Nudity',
        'Exposed Female Genitalia',
        96,
      ),
    });

    expect(decision.verdict).toBe('reject');
    expect(decision.riskLevel).toBe('high');
    expect(decision.reasons).toContain('explicit-content');
    expect(decision.signals.nudity).toBe('explicit');
    expect(decision.signals.sexualContent).toBe('detected');
  });

  it('rejects hate symbols', () => {
    const decision = decide({
      labels: chain('Hate Symbols', 'Nazi Party', null, 91),
    });
    expect(decision.verdict).toBe('reject');
    expect(decision.reasons).toContain('hate-symbols');
  });

  it('rejects a photo that is both too dark and too soft to use', () => {
    const decision = decide({
      quality: { brightness: 4, sharpness: 3, contrast: 5 },
    });
    expect(decision.verdict).toBe('reject');
    expect(decision.reasons).toContain('unusable-quality');
    expect(decision.signals.imageQuality).toBe('poor');
  });

  it('accepts a dark but sharp photo — night is when help is needed', () => {
    const decision = decide({
      quality: { brightness: 6, sharpness: 55, contrast: 30 },
    });
    expect(decision.verdict).toBe('pass');
    expect(decision.signals.imageQuality).toBe('pass');
  });

  it('accepts a soft but bright photo', () => {
    const decision = decide({
      quality: { brightness: 70, sharpness: 5, contrast: 30 },
    });
    expect(decision.verdict).toBe('pass');
  });
});

describe('reviews', () => {
  it('holds partial nudity', () => {
    const decision = decide({
      labels: chain(
        'Non-Explicit Nudity of Intimate parts and Kissing',
        'Non-Explicit Nudity',
        'Implied Nudity',
        72,
      ),
    });
    expect(decision.verdict).toBe('review');
    expect(decision.signals.nudity).toBe('partial');
  });

  it('holds a weapon without accusing anyone of anything', () => {
    const decision = decide({ labels: chain('Violence', 'Weapons', null, 88) });

    expect(decision.verdict).toBe('review');
    expect(decision.reasons).toContain('weapons');
    expect(decision.signals.weapons).toBe('possible');
  });

  it('never rejects on drugs, however confident the provider is', () => {
    // Rekognition's drug taxonomy bottoms out at "Pills" and "Smoking", which
    // cannot tell prescription medication at a crash site from anything illicit.
    const decision = decide({
      labels: chain('Drugs & Tobacco', 'Products', 'Pills', 99),
    });

    expect(decision.verdict).toBe('review');
    expect(decision.verdict).not.toBe('reject');
    expect(decision.signals.drugs).toBe('possible');
  });

  it('holds a cartoon, and calls it what it is', () => {
    const decision = decide({
      contentTypes: [{ name: 'Illustrated', confidence: 93 }],
    });

    expect(decision.verdict).toBe('review');
    expect(decision.reasons).toContain('not-photographic');
    expect(decision.signals.notPhotographic).toBe(true);
    // The signal set must not imply a manipulation/AI-generation capability the
    // provider does not have.
    expect(decision.signals).not.toHaveProperty('manipulationRisk');
  });
});

describe('category relevance', () => {
  const animalRescue = ['Animal', 'Dog', 'Cat'];

  it('passes a dog photo for Animal Rescue', () => {
    const decision = decide(
      {
        sceneLabels: [
          { name: 'Dog', confidence: 97, parents: ['Animal', 'Pet'] },
        ],
      },
      { expectedLabels: animalRescue },
    );

    expect(decision.verdict).toBe('pass');
    expect(decision.signals.categoryRelevance).toBe('high');
  });

  it('matches through an ancestor label', () => {
    // "Golden Retriever" is not in the expected set; "Animal" reaches it only
    // via Parents, which is why the provider adapter carries them.
    const decision = decide(
      {
        sceneLabels: [
          {
            name: 'Golden Retriever',
            confidence: 90,
            parents: ['Dog', 'Animal'],
          },
        ],
      },
      { expectedLabels: animalRescue },
    );
    expect(decision.verdict).toBe('pass');
  });

  it('holds a burger submitted as Animal Rescue', () => {
    const decision = decide(
      { sceneLabels: [{ name: 'Burger', confidence: 98, parents: ['Food'] }] },
      { expectedLabels: animalRescue },
    );

    expect(decision.verdict).toBe('review');
    expect(decision.reasons).toContain('category-mismatch');
    expect(decision.signals.categoryRelevance).toBe('low');
  });

  it('ignores a match that is below the confidence floor', () => {
    const decision = decide(
      { sceneLabels: [{ name: 'Dog', confidence: 20, parents: ['Animal'] }] },
      { expectedLabels: animalRescue },
    );
    expect(decision.reasons).toContain('category-mismatch');
  });

  it('skips the check entirely for a broad category', () => {
    // Community Help has no meaningful expected imagery; enforcing one would
    // hold legitimate reports for no reason.
    const decision = decide(
      { sceneLabels: [{ name: 'Burger', confidence: 98, parents: ['Food'] }] },
      { expectedLabels: null },
    );

    expect(decision.verdict).toBe('pass');
    expect(decision.signals.categoryRelevance).toBe('unchecked');
  });
});

describe('duplicates', () => {
  it('holds an exact re-upload', () => {
    const decision = decide({}, { exactDuplicate: true });
    expect(decision.verdict).toBe('review');
    expect(decision.reasons).toContain('duplicate-image');
    expect(decision.signals.duplicate).toBe(true);
  });

  it('holds a near-duplicate inside the distance threshold', () => {
    const decision = decide({}, { duplicateDistance: 3 });
    expect(decision.verdict).toBe('review');
  });

  it('publishes a photo that merely resembles another', () => {
    const decision = decide({}, { duplicateDistance: 25 });
    expect(decision.verdict).toBe('pass');
    expect(decision.signals.duplicate).toBe(false);
  });

  it('never rejects on duplication alone — a human decides', () => {
    const decision = decide({}, { exactDuplicate: true });
    expect(decision.verdict).not.toBe('reject');
  });
});

describe('when the provider could not analyse the photo', () => {
  const reasons: ModerationUnavailableReason[] = [
    'not-configured',
    'timeout',
    'throttled',
    'rejected-image',
    'provider-error',
    'invalid-response',
  ];

  it.each(reasons)('routes "%s" to review, never to pass', (reason) => {
    const decision = decideVerification({
      outcome: { status: 'unavailable', reason },
      duplicateDistance: null,
      exactDuplicate: false,
      expectedLabels: null,
    });

    expect(decision.verdict).toBe('review');
    expect(decision.reasons).toEqual(['verification-unavailable']);
    expect(decision.unavailableReason).toBe(reason);
    // The signal summary must not read as "we checked and it was clean".
    expect(decision.signals.imageQuality).toBe('unknown');
    expect(decision.signals.categoryRelevance).toBe('unchecked');
    // And it must not invent a risk BAND either. A band is a measurement; there
    // is none. Writing 'medium' here made `?risk=medium` in the moderation
    // queue return unexamined photos beside genuinely mid-risk ones.
    expect(decision.riskLevel).toBeNull();
    expect(decision.signals.overallRisk).toBeNull();
  });

  it('does not silently approve when moderation is switched off', () => {
    // The specific bypass the product decision forbids: no credentials must not
    // mean everything publishes.
    const decision = decideVerification({
      outcome: { status: 'unavailable', reason: 'not-configured' },
      duplicateDistance: null,
      exactDuplicate: false,
      expectedLabels: null,
    });
    expect(decision.verdict).not.toBe('pass');
  });
});

describe('precedence', () => {
  it('prefers reject over review when both fire', () => {
    const decision = decide({
      labels: [
        ...chain('Explicit', 'Explicit Nudity', null, 97),
        ...chain('Violence', 'Weapons', null, 90),
      ],
    });

    expect(decision.verdict).toBe('reject');
    expect(decision.riskLevel).toBe('high');
    // The weapon is still recorded — a moderator reviewing the rejection should
    // see everything that fired, not only the reason that won.
    expect(decision.reasons).toContain('explicit-content');
    expect(decision.reasons).toContain('weapons');
  });
});
