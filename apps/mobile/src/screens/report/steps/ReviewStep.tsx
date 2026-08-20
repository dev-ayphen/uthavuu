import { useMemo } from 'react';
import { Image, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Clock, Eye, EyeOff, MapPin, Phone, PhoneOff } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import type { ColorScheme } from '@uthavu/libs-mobile/theme/colors';
import { useTheme } from '@uthavu/libs-mobile/theme/ThemeProvider';
import { ICON_SIZE, RADIUS, SPACING, TYPE } from '@uthavu/libs-mobile/theme/tokens';
import type { ReportCategory } from '@uthavu/libs-mobile/api/reports';
import type { ReportDraft } from '../reportDraft';
import { formatExpiryMinutes } from '../reportDraft';

type Props = {
  draft: ReportDraft;
  category: ReportCategory | undefined;
};

export default function ReviewStep({ draft, category }: Props) {
  const { colors } = useTheme();
  const { t } = useTranslation('report');
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View>
      <Text style={styles.title}>{t('review.title')}</Text>
      <Text style={styles.subtitle}>{t('review.subtitle')}</Text>

      <View style={styles.card}>
        <View style={styles.categoryRow}>
          <Text style={styles.emoji}>{category?.emoji}</Text>
          <Text style={styles.categoryLabel}>{category?.label}</Text>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.photoRow}>
          {draft.photos.map((p) => (
            <Image key={p.localUri} source={{ uri: p.localUri }} style={styles.photo} />
          ))}
        </ScrollView>

        <Text style={styles.reportTitle}>{draft.title}</Text>
        <Text style={styles.description}>{draft.description}</Text>

        <View style={styles.metaRow}>
          <MapPin size={ICON_SIZE.xs} color={colors.textSecondary} />
          <Text style={styles.metaText}>
            {draft.locationLabel}
            {draft.landmark ? ` · ${draft.landmark}` : ''}
          </Text>
        </View>

        {category && (
          <View style={styles.metaRow}>
            <Clock size={ICON_SIZE.xs} color={colors.textSecondary} />
            <Text style={styles.metaText}>
              {t('review.expiresIn', { time: formatExpiryMinutes(category.defaultExpiryMinutes) })}
            </Text>
          </View>
        )}

        <View style={styles.metaRow}>
          {draft.anonymous ? (
            <EyeOff size={ICON_SIZE.xs} color={colors.textSecondary} />
          ) : (
            <Eye size={ICON_SIZE.xs} color={colors.textSecondary} />
          )}
          <Text style={styles.metaText}>
            {draft.anonymous ? t('review.postingAnonymously') : t('review.postingWithName')}
          </Text>
        </View>

        <View style={styles.metaRow}>
          {draft.phoneVisible ? (
            <Phone size={ICON_SIZE.xs} color={colors.textSecondary} />
          ) : (
            <PhoneOff size={ICON_SIZE.xs} color={colors.textSecondary} />
          )}
          <Text style={styles.metaText}>
            {draft.phoneVisible ? t('review.phoneShared') : t('review.phonePrivate')}
          </Text>
        </View>
      </View>
    </View>
  );
}

const createStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    title: { ...TYPE.pageTitle, color: colors.textPrimary, marginBottom: SPACING.xxs },
    subtitle: { ...TYPE.subhead, color: colors.textSecondary, marginBottom: SPACING.lg, lineHeight: 20 },
    card: {
      backgroundColor: colors.bgElevated,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: RADIUS.xxl,
      padding: SPACING.md,
    },
    categoryRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.xs, marginBottom: SPACING.sm },
    emoji: { fontSize: ICON_SIZE.md },
    categoryLabel: { ...TYPE.bodyStrong, color: colors.textPrimary },
    photoRow: { marginBottom: SPACING.sm },
    photo: { width: 72, height: 72, borderRadius: RADIUS.md, marginRight: SPACING.xs },
    reportTitle: { ...TYPE.title, color: colors.textPrimary, marginBottom: SPACING.xxs },
    description: { ...TYPE.body, color: colors.textSecondary, marginBottom: SPACING.sm, lineHeight: 18 },
    metaRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.xs, marginTop: SPACING.xxs },
    metaText: { ...TYPE.caption, color: colors.textSecondary, flexShrink: 1 },
  });
