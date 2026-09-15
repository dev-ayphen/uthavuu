import {
  CommunityUpdateFieldsSchema,
  ENGLISH_FIELD_NOT_ENGLISH,
  TAMIL_FIELD_NOT_TAMIL,
} from './create-community-update.dto';

/**
 * The script rule, tested at the DTO because that is where it is ENFORCED.
 *
 * The admin console mirrors these checks so an operator is told at the field
 * rather than by a 400, but the console is not the boundary: `POST
 * /admin/community-updates` is reachable by any client with a session, and the
 * mirrored copy in `apps/admin/src/features/announcements/schema.ts` never runs
 * for those. If this file passes and that one drifts, the product is still
 * correct. If this file is deleted, a script check exists only by politeness.
 */
describe('community update language/script rules', () => {
  const valid = {
    titleEn: 'Heavy rain warning for Chennai district',
    bodyEn: 'Heavy rainfall is expected tonight. Avoid low-lying roads.',
  };

  const messagesFor = (result: {
    success: boolean;
    error?: { issues: { path: PropertyKey[]; message: string }[] };
  }) =>
    result.error?.issues.map((i) => `${String(i.path[0])}: ${i.message}`) ?? [];

  describe('English fields must be English', () => {
    it.each(['titleEn', 'bodyEn'] as const)(
      'rejects Tamil script in %s',
      (field) => {
        const result = CommunityUpdateFieldsSchema.safeParse({
          ...valid,
          [field]: 'சென்னை மாவட்டத்தில் கனமழை எச்சரிக்கை',
        });

        expect(result.success).toBe(false);
        expect(messagesFor(result)).toContain(
          `${field}: ${ENGLISH_FIELD_NOT_ENGLISH}`,
        );
      },
    );

    it('rejects a mostly-English field with Tamil spliced into it', () => {
      // The realistic mistake is not a wholly Tamil paste — it is one Tamil
      // phrase left in an otherwise English sentence, which a length or
      // required check sails straight past.
      const result = CommunityUpdateFieldsSchema.safeParse({
        ...valid,
        titleEn: 'Heavy rain warning for சென்னை',
      });

      expect(result.success).toBe(false);
    });

    it('accepts English carrying digits, punctuation and loanwords', () => {
      const result = CommunityUpdateFieldsSchema.safeParse({
        titleEn: 'COVID-19 vaccination camp — Velachery, 9am',
        bodyEn: 'Call 1077 (toll-free) or visit the T. Nagar centre.',
      });

      expect(result.success).toBe(true);
    });
  });

  describe('Tamil fields, when filled, must be Tamil', () => {
    it.each(['titleTa', 'bodyTa'] as const)(
      'rejects English typed into %s',
      (field) => {
        const result = CommunityUpdateFieldsSchema.safeParse({
          ...valid,
          [field]: 'Heavy rain warning for Chennai district',
        });

        expect(result.success).toBe(false);
        expect(messagesFor(result)).toContain(
          `${field}: ${TAMIL_FIELD_NOT_TAMIL}`,
        );
      },
    );

    it('accepts Tamil containing Latin digits and loanwords', () => {
      // THE REASON THE TAMIL RULE IS "contains Tamil" AND NOT "contains no
      // Latin". A real announcement carries an ambulance number, a disease
      // name, a road spelled in English. A no-Latin rule would reject every one
      // of these, and an operator who cannot publish a correct announcement
      // will publish it in the English box instead — which is the exact
      // outcome this rule exists to prevent.
      const result = CommunityUpdateFieldsSchema.safeParse({
        ...valid,
        titleTa: 'COVID-19 தடுப்பூசி முகாம்',
        bodyTa: 'உதவிக்கு 1077 என்ற எண்ணை அழைக்கவும்.',
      });

      expect(result.success).toBe(true);
    });
  });

  describe('the optional-Tamil rule survives the script rule', () => {
    it('accepts an English-only announcement', () => {
      expect(CommunityUpdateFieldsSchema.safeParse(valid).success).toBe(true);
    });

    it('accepts an explicit null, which is how a translation is cleared', () => {
      const result = CommunityUpdateFieldsSchema.safeParse({
        ...valid,
        titleTa: null,
        bodyTa: null,
      });

      expect(result.success).toBe(true);
    });

    it('still rejects the empty string, so "no translation" keeps one spelling', () => {
      // Not a script failure — `.min(1)` catches it first. Asserted anyway
      // because the refine was inserted into that chain and must not have
      // reordered it into accepting ''.
      expect(
        CommunityUpdateFieldsSchema.safeParse({ ...valid, titleTa: '' })
          .success,
      ).toBe(false);
    });

    it('accepts a fully bilingual announcement', () => {
      const result = CommunityUpdateFieldsSchema.safeParse({
        ...valid,
        titleTa: 'சென்னை மாவட்டத்தில் கனமழை எச்சரிக்கை',
        bodyTa: 'தாழ்வான சாலைகளைத் தவிர்க்கவும்.',
      });

      expect(result.success).toBe(true);
    });

    it('accepts a Tamil title over an English body — half-translated is legal', () => {
      // Per the DTO header: the fallback is per-field, so this is a real state
      // the product allows. The console warns about it; the API must not reject
      // it, or the warning would be unreachable.
      const result = CommunityUpdateFieldsSchema.safeParse({
        ...valid,
        titleTa: 'சென்னை மாவட்டத்தில் கனமழை எச்சரிக்கை',
      });

      expect(result.success).toBe(true);
    });
  });
});
