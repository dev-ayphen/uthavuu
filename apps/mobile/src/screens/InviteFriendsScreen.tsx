import { useMemo, useState } from 'react';
import { ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';
import { Check, Copy, Gift, Share2 } from 'lucide-react-native';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';
import { useTheme } from '@uthavu/libs-mobile/theme/ThemeProvider';
import type { ColorScheme } from '@uthavu/libs-mobile/theme/colors';
import { ICON_SIZE, RADIUS, SIZES, SPACING, TYPE } from '@uthavu/libs-mobile/theme/tokens';
import { getMyInvite } from '@uthavu/libs-mobile/api/users';
import Button from '@uthavu/libs-mobile/components/Button';
import ErrorState from '@uthavu/libs-mobile/components/ErrorState';
import Skeleton from '@uthavu/libs-mobile/components/Skeleton';
import BackButton from '@uthavu/libs-mobile/components/BackButton';

type Props = NativeStackScreenProps<RootStackParamList, 'InviteFriends'>;

// Product decision (2026-08-24): a genuine shareable invite only — real
// per-user code/link, real copy, real native share. No claim/attribution
// tracking, no rewards language. See users.service.ts's getOrCreateInvite()
// for why the link doesn't resolve to a real page yet.
const COPY_CONFIRM_MS = 2000;

export default function InviteFriendsScreen(_props: Props) {
  const { colors } = useTheme();
  const { t } = useTranslation(['invite', 'common']);
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const { data: invite, isLoading, isError, isFetching, refetch } = useQuery({
    queryKey: ['myInvite'],
    queryFn: getMyInvite,
  });

  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [shareError, setShareError] = useState(false);

  const onCopyCode = async () => {
    if (!invite) return;
    await Clipboard.setStringAsync(invite.code);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), COPY_CONFIRM_MS);
  };

  const onCopyLink = async () => {
    if (!invite) return;
    await Clipboard.setStringAsync(invite.link);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), COPY_CONFIRM_MS);
  };

  const onShare = async () => {
    if (!invite) return;
    setShareError(false);
    try {
      await Share.share({
        message: t('shareMessage', { link: invite.link }),
        title: t('shareTitle'),
      });
    } catch {
      setShareError(true);
    }
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top + SPACING.xs }]}>
      <View style={styles.header}>
        <BackButton />
        <Text style={styles.headerTitle}>{t('title')}</Text>
        <View style={styles.headerSpacer} />
      </View>

      {isLoading ? (
        <View style={styles.content}>
          <Skeleton width="100%" height={140} borderRadius={RADIUS.xl} />
          <Skeleton width="100%" height={48} style={styles.skeletonBlock} />
          <Skeleton width="100%" height={48} style={styles.skeletonBlock} />
        </View>
      ) : isError && !invite ? (
        <ErrorState onRetry={refetch} retrying={isFetching} />
      ) : invite ? (
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.heroCard}>
            <View style={styles.heroIconWrap}>
              <Gift size={ICON_SIZE.lg} color={colors.textOnTint} />
            </View>
            <Text style={styles.heroTitle}>{t('heroTitle')}</Text>
            <Text style={styles.heroSubtitle}>{t('heroSubtitle')}</Text>
          </View>

          <Text style={styles.sectionLabel}>{t('codeLabel')}</Text>
          <View style={styles.codeRow}>
            <View style={styles.codeBox}>
              <Text style={styles.codeText}>{invite.code}</Text>
            </View>
            <Button
              label={copiedCode ? t('copied') : t('copyCode')}
              variant="secondary"
              icon={
                copiedCode ? (
                  <Check size={ICON_SIZE.sm} color={colors.primaryGreen} />
                ) : (
                  <Copy size={ICON_SIZE.sm} color={colors.primaryGreen} />
                )
              }
              onPress={onCopyCode}
              style={styles.copyCodeButton}
            />
          </View>

          <View style={styles.linkRow}>
            <Text style={styles.linkText} numberOfLines={1}>
              {invite.link}
            </Text>
            <Button
              label={copiedLink ? t('copied') : t('copyLink')}
              variant="secondary"
              icon={
                copiedLink ? (
                  <Check size={ICON_SIZE.sm} color={colors.primaryGreen} />
                ) : (
                  <Copy size={ICON_SIZE.sm} color={colors.primaryGreen} />
                )
              }
              onPress={onCopyLink}
              style={styles.copyLinkButton}
            />
          </View>

          <Button
            label={t('shareInvite')}
            icon={<Share2 size={ICON_SIZE.sm} color={colors.textOnTint} />}
            onPress={onShare}
            style={styles.shareButton}
          />
          {shareError && <Text style={styles.errorText}>{t('shareFailed')}</Text>}

          <View style={styles.stepsCard}>
            {[t('step1'), t('step2'), t('step3')].map((step, index) => (
              <View key={step} style={styles.stepRow}>
                <View style={styles.stepNumberWrap}>
                  <Text style={styles.stepNumber}>{index + 1}</Text>
                </View>
                <Text style={styles.stepText}>{step}</Text>
              </View>
            ))}
          </View>
        </ScrollView>
      ) : null}
    </View>
  );
}

const createStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.bg },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: SIZES.padding,
      paddingBottom: SPACING.sm,
    },
    headerTitle: { ...TYPE.screenTitle, color: colors.textPrimary },
    headerSpacer: { width: SPACING.xl },
    content: { padding: SIZES.padding, paddingBottom: SPACING.xxxl, gap: SPACING.md },
    skeletonBlock: { marginTop: SPACING.sm },
    heroCard: {
      alignItems: 'center',
      padding: SPACING.xl,
      borderRadius: RADIUS.xl,
      backgroundColor: colors.textPrimary,
      gap: SPACING.xs,
    },
    heroIconWrap: {
      width: 56,
      height: 56,
      borderRadius: 28,
      backgroundColor: colors.primaryGreen,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: SPACING.xs,
    },
    heroTitle: { ...TYPE.title, color: colors.textOnTint, textAlign: 'center' },
    heroSubtitle: { ...TYPE.body, color: colors.textOnTint, textAlign: 'center', opacity: 0.85 },
    sectionLabel: { ...TYPE.captionStrong, color: colors.textSecondary },
    codeRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.xs },
    codeBox: {
      flex: 1,
      paddingVertical: SPACING.sm,
      paddingHorizontal: SPACING.md,
      borderRadius: RADIUS.lg,
      backgroundColor: colors.bgElevated,
      borderWidth: 1,
      borderColor: colors.border,
    },
    codeText: { ...TYPE.headlineStrong, color: colors.textPrimary, letterSpacing: 2 },
    copyCodeButton: { paddingHorizontal: SPACING.sm },
    linkRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.xs },
    linkText: {
      flex: 1,
      ...TYPE.body,
      color: colors.textSecondary,
      paddingVertical: SPACING.sm,
      paddingHorizontal: SPACING.md,
      borderRadius: RADIUS.lg,
      backgroundColor: colors.bgElevated,
      borderWidth: 1,
      borderColor: colors.border,
    },
    copyLinkButton: { paddingHorizontal: SPACING.sm },
    shareButton: { marginTop: SPACING.xs },
    errorText: { ...TYPE.caption, color: colors.danger, textAlign: 'center' },
    stepsCard: {
      marginTop: SPACING.sm,
      padding: SPACING.md,
      borderRadius: RADIUS.lg,
      backgroundColor: colors.bgElevated,
      borderWidth: 1,
      borderColor: colors.border,
      gap: SPACING.sm,
    },
    stepRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
    stepNumberWrap: {
      width: 24,
      height: 24,
      borderRadius: 12,
      backgroundColor: colors.primaryGreenLight,
      alignItems: 'center',
      justifyContent: 'center',
    },
    stepNumber: { ...TYPE.captionStrong, color: colors.primaryGreen },
    stepText: { ...TYPE.body, color: colors.textPrimary },
  });
