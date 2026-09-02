import { useMemo, useState } from 'react';
import {
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ImagePlus, X } from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp, NativeStackScreenProps } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import type { RootStackParamList } from '../../navigation/types';
import type { ColorScheme } from '@uthavu/libs-mobile/theme/colors';
import { useTheme } from '@uthavu/libs-mobile/theme/ThemeProvider';
import { ICON_SIZE, RADIUS, SIZES, SPACING, TYPE } from '@uthavu/libs-mobile/theme/tokens';
import {
  createTicket,
  listTicketCategories,
  TICKETS_QUERY_KEY,
  TICKET_CATEGORIES_QUERY_KEY,
  TICKET_DESCRIPTION_MAX,
  TICKET_SUBJECT_MAX,
} from '@uthavu/libs-mobile/api/tickets';
import { uploadImage } from '@uthavu/libs-mobile/api/users';
import { ApiError } from '@uthavu/libs-mobile/lib/api';
import BackHeader from '@uthavu/libs-mobile/components/BackHeader';
import Button from '@uthavu/libs-mobile/components/Button';
import Skeleton from '@uthavu/libs-mobile/components/Skeleton';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type Props = NativeStackScreenProps<RootStackParamList, 'SubmitTicket'>;

// Support Home → Submit a Ticket. A full screen, not a sheet: this is the start
// of a conversation, and on success the user is put straight into that
// conversation rather than handed a toast and left where they were.
export default function SubmitTicketScreen({ route }: Props) {
  const { colors } = useTheme();
  const { t } = useTranslation(['tickets', 'common']);
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const navigation = useNavigation<Nav>();
  const queryClient = useQueryClient();

  const relatedReportId = route.params?.relatedReportId;

  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [attachmentUrl, setAttachmentUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [attachmentError, setAttachmentError] = useState('');
  const [errors, setErrors] = useState<{ category?: string; subject?: string; description?: string }>({});
  const [submitError, setSubmitError] = useState('');

  // Categories are a server lookup table, so the options come from the server.
  // Nothing is hardcoded here: if this list can't be fetched, the screen says so
  // and blocks submission rather than offering categories it made up.
  const categoriesQuery = useQuery({
    queryKey: TICKET_CATEGORIES_QUERY_KEY,
    queryFn: listTicketCategories,
  });
  const categories = categoriesQuery.data ?? [];

  // The uploaded photo travels as a labelled line at the end of the description:
  // POST /support/tickets has no attachment field in the frozen contract, and
  // inventing one would send the photo nowhere. The line is shown to the user
  // (attachmentNote) so nothing happens to their ticket that they didn't see.
  const attachmentSuffix = attachmentUrl ? `\n\n${t('attachmentLine', { url: attachmentUrl })}` : '';
  const descriptionLength = description.length + attachmentSuffix.length;

  // The category id is a mutation variable rather than a read of state, so the
  // "a category was chosen" check that validate() performs is what types the
  // call — no cast standing in for a guarantee.
  const submitMutation = useMutation({
    mutationFn: (chosenCategoryId: string) =>
      createTicket({
        categoryId: chosenCategoryId,
        subject: subject.trim(),
        description: description.trim() + attachmentSuffix,
        ...(relatedReportId ? { relatedReportId } : {}),
      }),
    onSuccess: (ticket) => {
      queryClient.invalidateQueries({ queryKey: TICKETS_QUERY_KEY });
      // `replace`, not `navigate`: the form is finished, so Back from the new
      // ticket goes to Support Home rather than to a form that would file a
      // duplicate.
      navigation.replace('TicketDetail', {
        ticketId: ticket.id,
        ticketNumber: ticket.ticketNumber,
      });
    },
    onError: (e) => {
      setSubmitError(e instanceof ApiError ? e.message : t('submitFailed'));
    },
  });

  const pickAttachment = async () => {
    setAttachmentError('');
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (permission.status !== 'granted') {
      setAttachmentError(t('photosPermissionNeeded'));
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.7,
    });
    if (result.canceled || !result.assets?.[0]) return;

    const uri = result.assets[0].uri;
    setPhotoUri(uri);
    setUploading(true);
    try {
      const uploaded = await uploadImage(uri);
      setAttachmentUrl(uploaded.url);
    } catch (e) {
      // The ticket is still submittable without the photo — an attachment that
      // failed to upload must not hold the whole report hostage.
      setPhotoUri(null);
      setAttachmentUrl(null);
      setAttachmentError(e instanceof ApiError ? e.message : t('attachmentFailed'));
    } finally {
      setUploading(false);
    }
  };

  const removeAttachment = () => {
    setPhotoUri(null);
    setAttachmentUrl(null);
    setAttachmentError('');
  };

  // Mirrors apps/api's CreateTicketSchema. The server check is still the real
  // one — its 400 lands in submitError below.
  const validate = () => {
    const next: typeof errors = {};
    if (!categoryId) next.category = t('categoryRequired');
    if (!subject.trim()) next.subject = t('subjectRequired');
    else if (subject.trim().length > TICKET_SUBJECT_MAX)
      next.subject = t('subjectTooLong', { max: TICKET_SUBJECT_MAX });
    if (!description.trim()) next.description = t('descriptionRequired');
    else if (description.trim().length + attachmentSuffix.length > TICKET_DESCRIPTION_MAX)
      next.description = t('descriptionTooLong', { max: TICKET_DESCRIPTION_MAX });
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const onSubmit = () => {
    setSubmitError('');
    if (!validate() || !categoryId) return;
    submitMutation.mutate(categoryId);
  };

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={{ paddingTop: insets.top + SPACING.xs }}>
        <BackHeader title={t('submitTitle')} />
      </View>

      {/* The one scroll container; the submit bar below sits outside it. */}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.label}>
          {t('categoryLabel')} <Text style={styles.required}>*</Text>
        </Text>
        {categoriesQuery.isLoading ? (
          <View style={styles.chipRow}>
            <Skeleton width={120} height={32} borderRadius={RADIUS.pill} />
            <Skeleton width={96} height={32} borderRadius={RADIUS.pill} />
            <Skeleton width={140} height={32} borderRadius={RADIUS.pill} />
          </View>
        ) : categoriesQuery.isError ? (
          <View style={styles.inlineErrorBox}>
            <Text style={styles.inlineErrorText}>{t('categoryLoadFailed')}</Text>
            <Button
              label={t('common:retry')}
              variant="secondary"
              onPress={() => categoriesQuery.refetch()}
              loading={categoriesQuery.isFetching}
            />
          </View>
        ) : categories.length === 0 ? (
          <Text style={styles.helper}>{t('categoryNone')}</Text>
        ) : (
          <View style={styles.chipRow}>
            {categories.map((category) => {
              const active = categoryId === category.id;
              return (
                <TouchableOpacity
                  key={category.id}
                  style={[styles.chip, active && styles.chipActive]}
                  onPress={() => {
                    setCategoryId(category.id);
                    setErrors((prev) => ({ ...prev, category: undefined }));
                  }}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                >
                  <Text style={[styles.chipText, active && styles.chipTextActive]}>
                    {category.label || category.key}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        )}
        {errors.category ? <Text style={styles.fieldError}>{errors.category}</Text> : null}

        <View style={styles.labelRow}>
          <Text style={styles.label}>
            {t('subjectLabel')} <Text style={styles.required}>*</Text>
          </Text>
          <Text style={styles.counter}>
            {t('charCount', { current: subject.length, max: TICKET_SUBJECT_MAX })}
          </Text>
        </View>
        <TextInput
          style={[styles.input, errors.subject ? styles.inputError : null]}
          value={subject}
          onChangeText={(value) => {
            setSubject(value);
            setErrors((prev) => ({ ...prev, subject: undefined }));
          }}
          placeholder={t('subjectPlaceholder')}
          placeholderTextColor={colors.textSecondary}
          autoCapitalize="sentences"
          maxLength={TICKET_SUBJECT_MAX}
          accessibilityLabel={t('subjectLabel')}
        />
        {errors.subject ? <Text style={styles.fieldError}>{errors.subject}</Text> : null}

        <View style={styles.labelRow}>
          <Text style={styles.label}>
            {t('descriptionLabel')} <Text style={styles.required}>*</Text>
          </Text>
          <Text style={styles.counter}>
            {t('charCount', { current: descriptionLength, max: TICKET_DESCRIPTION_MAX })}
          </Text>
        </View>
        <TextInput
          style={[styles.input, styles.textArea, errors.description ? styles.inputError : null]}
          value={description}
          onChangeText={(value) => {
            setDescription(value);
            setErrors((prev) => ({ ...prev, description: undefined }));
          }}
          placeholder={t('descriptionPlaceholder')}
          placeholderTextColor={colors.textSecondary}
          multiline
          textAlignVertical="top"
          maxLength={TICKET_DESCRIPTION_MAX}
          accessibilityLabel={t('descriptionLabel')}
        />
        {errors.description ? <Text style={styles.fieldError}>{errors.description}</Text> : null}

        <Text style={styles.label}>{t('attachmentLabel')}</Text>
        {photoUri ? (
          <View style={styles.attachmentRow}>
            <Image source={{ uri: photoUri }} style={styles.attachmentPreview} />
            <View style={styles.attachmentBody}>
              <Text style={styles.helper}>
                {uploading ? t('attachmentUploading') : t('attachmentNote')}
              </Text>
            </View>
            <TouchableOpacity
              style={styles.attachmentRemove}
              onPress={removeAttachment}
              accessibilityRole="button"
              accessibilityLabel={t('attachmentRemove')}
              hitSlop={SPACING.xs}
            >
              <X size={ICON_SIZE.sm} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity
            style={styles.attachmentAdd}
            onPress={pickAttachment}
            activeOpacity={0.8}
            accessibilityRole="button"
          >
            <ImagePlus size={ICON_SIZE.md} color={colors.primaryGreen} />
            <Text style={styles.attachmentAddText}>{t('attachmentAdd')}</Text>
          </TouchableOpacity>
        )}
        {attachmentError ? <Text style={styles.fieldError}>{attachmentError}</Text> : null}

        {submitError ? <Text style={styles.submitError}>{submitError}</Text> : null}
      </ScrollView>

      <View style={[styles.actionBar, { paddingBottom: insets.bottom + SPACING.sm }]}>
        <Button
          label={t('submitAction')}
          onPress={onSubmit}
          loading={submitMutation.isPending || uploading}
          disabled={categories.length === 0}
        />
      </View>
    </KeyboardAvoidingView>
  );
}

const createStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.bg },
    scroll: { flex: 1 },
    scrollContent: { paddingHorizontal: SIZES.padding, paddingBottom: SPACING.xl },

    label: { ...TYPE.subheadStrong, color: colors.textPrimary, marginTop: SPACING.md, marginBottom: SPACING.xs },
    labelRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
    counter: { ...TYPE.caption, color: colors.textSecondary, marginBottom: SPACING.xs },
    required: { color: colors.danger },
    helper: { ...TYPE.caption, color: colors.textSecondary, lineHeight: 16 },
    fieldError: { ...TYPE.caption, color: colors.danger, marginTop: SPACING.xxs },

    chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.xs },
    chip: {
      paddingHorizontal: SPACING.sm,
      paddingVertical: SPACING.xs,
      borderRadius: RADIUS.pill,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.bgElevated,
    },
    chipActive: { backgroundColor: colors.primaryGreenLight, borderColor: colors.primaryGreen },
    chipText: { ...TYPE.footnote, color: colors.textSecondary },
    chipTextActive: { color: colors.primaryGreen },

    inlineErrorBox: {
      gap: SPACING.xs,
      padding: SPACING.sm,
      borderRadius: RADIUS.lg,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.bgElevated,
    },
    inlineErrorText: { ...TYPE.body, color: colors.textSecondary },

    input: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: RADIUS.lg,
      paddingHorizontal: SPACING.sm,
      paddingVertical: SPACING.sm,
      ...TYPE.subhead,
      color: colors.textPrimary,
      backgroundColor: colors.bgElevated,
    },
    inputError: { borderColor: colors.danger },
    textArea: { minHeight: 132, textAlignVertical: 'top', lineHeight: 20 },

    attachmentAdd: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: SPACING.xs,
      paddingVertical: SPACING.md,
      borderRadius: RADIUS.lg,
      borderWidth: 1,
      borderStyle: 'dashed',
      borderColor: colors.border,
      backgroundColor: colors.bgElevated,
    },
    attachmentAddText: { ...TYPE.subheadStrong, color: colors.primaryGreen },
    attachmentRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.sm,
      padding: SPACING.xs,
      borderRadius: RADIUS.lg,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.bgElevated,
    },
    attachmentPreview: { width: 56, height: 56, borderRadius: RADIUS.md },
    attachmentBody: { flex: 1 },
    attachmentRemove: { padding: SPACING.xs },

    submitError: { ...TYPE.body, color: colors.danger, marginTop: SPACING.md },

    actionBar: {
      paddingHorizontal: SIZES.padding,
      paddingTop: SPACING.sm,
      borderTopWidth: 1,
      borderTopColor: colors.border,
      backgroundColor: colors.bg,
    },
  });
