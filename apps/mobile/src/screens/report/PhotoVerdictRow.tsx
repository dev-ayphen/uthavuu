/**
 * One photo's verification state, in words.
 *
 * Every state gets a row, `pass` included: silence after a spinner disappears
 * reads as "did that work?", and the whole point of showing this at all is that
 * the reporter knows where they stand before they commit.
 *
 * NOTHING HERE NAMES A SCORE, A LABEL, A THRESHOLD OR A PROVIDER. The reason
 * code is resolved to one of eight grouped sentences by photoVerdictCopy.ts,
 * which is where that rule is enforced and explained.
 *
 * EXTRACTED FROM ReportDetailsPage rather than copied. Two screens now send a
 * photo for a verdict — the create flow, and the held-report replacement on
 * RequestDetailsScreen — and the second one is answering a MODERATOR. A
 * second implementation of these five states would drift from this one exactly
 * where drift is most expensive: the wording that tells somebody whether the
 * picture they just took is going to be accepted.
 */

import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { AlertTriangle, CheckCircle2, RefreshCw } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { useMemo } from 'react';
import Spinner from '@uthavu/libs-mobile/components/Spinner';
import { StatusBadge } from '@uthavu/libs-mobile/components';
import { useTheme } from '@uthavu/libs-mobile/theme/ThemeProvider';
import type { ColorScheme } from '@uthavu/libs-mobile/theme/colors';
import { RADIUS, SPACING, TONES, TYPE } from '@uthavu/libs-mobile/theme/tokens';
import type { PhotoDraft } from './reportDraft';
import { photoReasonCopyKey } from './photoVerdictCopy';

export default function PhotoVerdictRow({
  photo,
  slotLabel,
  onRetake,
}: {
  photo: PhotoDraft;
  slotLabel: string;
  onRetake: () => void;
}) {
  const { t } = useTranslation('report');
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  // `failed` is not `reject`: the photo was never judged, so there is no reason
  // code to word, and the message is whatever went wrong with the request.
  const isRetakeable = photo.state === 'reject' || photo.state === 'failed';
  const message =
    photo.state === 'verifying'
      ? t('photoVerification.checking')
      : photo.state === 'pass'
        ? t('photoVerification.verified')
        : photo.state === 'review'
          ? t('photoVerification.needsReview')
          : photo.state === 'failed'
            ? photo.error || t('photoVerification.uploadFailed')
            : t(photoReasonCopyKey(photo.reason));

  const tone =
    photo.state === 'pass'
      ? TONES.success
      : photo.state === 'review'
        ? TONES.soon
        : isRetakeable
          ? TONES.critical
          : TONES.normal;

  return (
    <View style={styles.verdictRow}>
      <View style={styles.verdictHeader}>
        <StatusBadge
          label={slotLabel}
          tone={tone}
          align="inline"
          leading={
            photo.state === 'verifying' ? (
              <Spinner size="small" />
            ) : photo.state === 'pass' ? (
              <CheckCircle2 size={11} color={tone.fg} />
            ) : (
              <AlertTriangle size={11} color={tone.fg} />
            )
          }
        />
        {isRetakeable && (
          <TouchableOpacity style={styles.retakeBtn} onPress={onRetake}>
            <RefreshCw size={12} color={colors.primaryGreen} />
            <Text style={styles.retakeBtnText}>{t('photoVerification.retake')}</Text>
          </TouchableOpacity>
        )}
      </View>
      <Text style={[styles.verdictText, { color: tone.fg }]}>{message}</Text>
      {photo.state === 'review' && (
        <Text style={styles.verdictSubText}>{t('photoVerification.needsReviewHelp')}</Text>
      )}
    </View>
  );
}

const createStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    verdictRow: { gap: 2 },
    verdictHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: SPACING.xs,
    },
    // Colour comes from the row's tone, not from here — the same message is
    // green, amber or red depending on the verdict it is reporting.
    verdictText: { ...TYPE.caption, lineHeight: 16 },
    verdictSubText: { ...TYPE.caption, color: colors.textSecondary, lineHeight: 16 },
    retakeBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: SPACING.xs,
      paddingVertical: 2,
      borderRadius: RADIUS.pill,
      backgroundColor: colors.primaryGreenLight,
    },
    retakeBtnText: { ...TYPE.footnote, color: colors.primaryGreen, fontWeight: '700' },
  });
