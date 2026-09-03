import { useEffect, useMemo, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import type { RootStackParamList } from '../../navigation/types';
import type { ColorScheme } from '@uthavu/libs-mobile/theme/colors';
import { useTheme } from '@uthavu/libs-mobile/theme/ThemeProvider';
import { RADIUS, SIZES, SPACING, TYPE } from '@uthavu/libs-mobile/theme/tokens';
import { getReport, updateReport } from '@uthavu/libs-mobile/api/reports';
import { TextField } from '@uthavu/libs-mobile/components';
import BackButton from '@uthavu/libs-mobile/components/BackButton';
import Button from '@uthavu/libs-mobile/components/Button';
import RequestDetailsSkeleton from '../request-details/RequestDetailsSkeleton';
import ErrorState from '@uthavu/libs-mobile/components/ErrorState';

type Props = NativeStackScreenProps<RootStackParamList, 'EditReport'>;

export default function EditReportScreen({ navigation, route }: Props) {
  const { colors } = useTheme();
  const { t } = useTranslation(['report', 'common']);
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { reportId } = route.params;
  const queryClient = useQueryClient();

  const { data: report, isLoading, isError, refetch } = useQuery({
    queryKey: ['report', reportId],
    queryFn: () => getReport(reportId),
  });

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [landmark, setLandmark] = useState('');
  const [neededVolunteers, setNeededVolunteers] = useState(1);

  useEffect(() => {
    if (report) {
      setTitle(report.title);
      setDescription(report.description);
      setLandmark(report.landmark || '');
      setNeededVolunteers(report.neededVolunteers || 1);

      // Rule 16: Once someone joins, edit is locked
      if (report.assignedVolunteersCount && report.assignedVolunteersCount > 0) {
        Alert.alert(t('edit.lockedTitle'), t('edit.lockedMessage'), [
          { text: t('common:ok'), onPress: () => navigation.goBack() },
        ]);
      }
    }
    // `t` is deliberately not a dependency: it changes identity when the user
    // switches language, and re-running this would re-fire the alert (and reset
    // the form) on a language switch rather than only when the report loads.
  }, [report, navigation]); // eslint-disable-line react-hooks/exhaustive-deps

  const updateMutation = useMutation({
    mutationFn: () =>
      updateReport(reportId, {
        title: title.trim(),
        description: description.trim(),
        landmark: landmark.trim() || undefined,
        neededVolunteers,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['report', reportId] });
      queryClient.invalidateQueries({ queryKey: ['myReports'] });
      Alert.alert(t('edit.updatedTitle'), t('edit.updatedMessage'), [
        { text: t('common:ok'), onPress: () => navigation.goBack() },
      ]);
    },
    onError: (err: any) => {
      Alert.alert(t('edit.updateFailedTitle'), err?.message || t('edit.updateFailedMessage'));
    },
  });

  if (isLoading) return <RequestDetailsSkeleton />;
  if (isError || !report) return <ErrorState onRetry={refetch} />;

  const isLocked = Boolean(report.assignedVolunteersCount && report.assignedVolunteersCount > 0);
  const isValid = title.trim().length > 0 && description.trim().length > 0;

  // TextField's `form` size dims a non-editable field to opacity 0.6; the inline
  // TextInputs these three replaced did not dim. Cancelled here so the locked
  // state renders exactly as it did before — drop this once we've decided which
  // of the two treatments the design system wants.
  const lockedInputStyle = isLocked ? styles.inputNotDimmed : undefined;

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[styles.headerRow, { paddingTop: insets.top + SPACING.xs }]}>
        <BackButton />
        <Text style={styles.headerTitle}>{t('edit.title')}</Text>
        <View style={{ width: 44 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {/* Category banner (read-only) */}
        <View style={styles.categoryBanner}>
          <Text style={styles.categoryEmoji}>{report.category.emoji}</Text>
          <View style={styles.categoryBody}>
            <Text style={styles.categoryTitle}>{report.category.label}</Text>
            <Text style={styles.categorySub}>{t('edit.categoryLocked')}</Text>
          </View>
        </View>

        {/* Title */}
        <TextField
          style={styles.field}
          inputStyle={lockedInputStyle}
          size="form"
          label={t('edit.titleLabel')}
          value={title}
          onChangeText={setTitle}
          placeholder={t('edit.titlePlaceholder')}
          editable={!isLocked}
        />

        {/* Description */}
        <TextField
          style={styles.field}
          inputStyle={lockedInputStyle}
          size="form"
          label={t('edit.descriptionLabel')}
          value={description}
          onChangeText={setDescription}
          placeholder={t('edit.descriptionPlaceholder')}
          multiline
          editable={!isLocked}
        />

        {/* Landmark */}
        <TextField
          style={styles.field}
          inputStyle={lockedInputStyle}
          size="form"
          label={t('edit.landmarkLabel')}
          value={landmark}
          onChangeText={setLandmark}
          placeholder={t('edit.landmarkPlaceholder')}
          editable={!isLocked}
        />

        {/* Volunteer Count */}
        <Text style={styles.label}>{t('edit.volunteersLabel')}</Text>
        <View style={styles.urgencyRow}>
          {[1, 2, 3, 4, 5, 6, 8, 10].map((n) => {
            const active = neededVolunteers === n;
            return (
              <TouchableOpacity
                key={n}
                style={[styles.urgencyChip, active && styles.urgencyChipActive]}
                onPress={() => setNeededVolunteers(n)}
                disabled={isLocked}
              >
                <Text style={[styles.urgencyChipText, active && styles.urgencyChipTextActive]}>{n}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + SPACING.md }]}>
        <Button
          label={t('edit.save')}
          onPress={() => updateMutation.mutate()}
          loading={updateMutation.isPending}
          disabled={!isValid || isLocked}
        />
      </View>
    </KeyboardAvoidingView>
  );
}

const createStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.bg },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: SIZES.padding,
      paddingBottom: SPACING.xs,
    },
    headerTitle: { ...TYPE.title, fontSize: 18, color: colors.textPrimary, fontWeight: '800', flex: 1, textAlign: 'center' },
    content: { paddingHorizontal: SIZES.padding, paddingBottom: SPACING.xl },
    categoryBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.xs,
      padding: SPACING.sm,
      borderRadius: RADIUS.lg,
      backgroundColor: colors.bgElevated,
      borderWidth: 1,
      borderColor: colors.border,
      marginBottom: SPACING.md,
    },
    categoryEmoji: { fontSize: 24 },
    categoryBody: { flex: 1 },
    categoryTitle: { ...TYPE.subheadStrong, color: colors.textPrimary },
    categorySub: { ...TYPE.caption, color: colors.textSecondary, marginTop: 1 },
    // The gap that used to live on `label`'s marginTop, now that the label and
    // its input are one TextField.
    field: { marginTop: SPACING.sm },
    inputNotDimmed: { opacity: 1 },
    label: { ...TYPE.subheadStrong, color: colors.textPrimary, marginBottom: SPACING.xs, marginTop: SPACING.sm },
    urgencyRow: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.xs },
    urgencyChip: {
      paddingHorizontal: SPACING.md,
      paddingVertical: SPACING.xs,
      borderRadius: RADIUS.lg,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.bgElevated,
    },
    urgencyChipActive: { borderColor: colors.primaryGreen, backgroundColor: colors.primaryGreenLight },
    urgencyChipText: { ...TYPE.bodyStrong, color: colors.textSecondary },
    urgencyChipTextActive: { color: colors.primaryGreen },
    footer: {
      paddingHorizontal: SIZES.padding,
      paddingTop: SPACING.xs,
      borderTopWidth: 1,
      borderTopColor: colors.border,
      backgroundColor: colors.bg,
    },
  });
