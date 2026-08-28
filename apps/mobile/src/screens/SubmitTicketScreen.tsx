import { useMemo, useState } from 'react';
import {
  Alert,
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
import { Camera, CheckCircle2, ChevronDown, X } from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';
import type { ColorScheme } from '@uthavu/libs-mobile/theme/colors';
import { useTheme } from '@uthavu/libs-mobile/theme/ThemeProvider';
import { RADIUS, SIZES, SPACING, TYPE } from '@uthavu/libs-mobile/theme/tokens';
import { createTicket } from '@uthavu/libs-mobile/api/tickets';
import { uploadImage } from '@uthavu/libs-mobile/api/users';
import { ApiError } from '@uthavu/libs-mobile/lib/api';
import BackHeader from '@uthavu/libs-mobile/components/BackHeader';
import Button from '@uthavu/libs-mobile/components/Button';

type Nav = NativeStackNavigationProp<RootStackParamList>;

type IssueCategory = {
  key: string;
  label: string;
  emoji: string;
};

const ISSUE_CATEGORIES: IssueCategory[] = [
  { key: 'account_profile', label: 'Account & Profile', emoji: '👤' },
  { key: 'report_request', label: 'Report / Help Request', emoji: '🚨' },
  { key: 'mission_volunteer', label: 'Mission / Volunteer', emoji: '🤝' },
  { key: 'notifications', label: 'Notifications', emoji: '🔔' },
  { key: 'location_gps', label: 'Location / GPS', emoji: '📍' },
  { key: 'app_bug', label: 'App Problem / Bug', emoji: '🐛' },
  { key: 'safety_abuse', label: 'Safety & Abuse', emoji: '🛡️' },
  { key: 'other', label: 'Other', emoji: '💬' },
];

export default function SubmitTicketScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const navigation = useNavigation<Nav>();
  const queryClient = useQueryClient();

  const [selectedCategory, setSelectedCategory] = useState<string>('app_bug');
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [submittedTicket, setSubmittedTicket] = useState<{ id: string } | null>(null);

  const submitMutation = useMutation({
    mutationFn: createTicket,
    onSuccess: (ticket) => {
      queryClient.invalidateQueries({ queryKey: ['myTickets'] });
      setSubmittedTicket(ticket);
    },
    onError: (e) => {
      Alert.alert('Error', e instanceof ApiError ? e.message : 'Could not submit ticket.');
    },
  });

  const onAddPhoto = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (perm.status !== 'granted') {
      Alert.alert('Camera Needed', 'Camera permission is required to capture screenshot/photo.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ quality: 0.7 });
    if (result.canceled || !result.assets?.[0]) return;
    const uri = result.assets[0].uri;
    setPhotoUri(uri);
    setUploadingPhoto(true);
    try {
      await uploadImage(uri);
    } catch (e) {
      // Ignored non-fatal image upload error for tickets
    } finally {
      setUploadingPhoto(false);
    }
  };

  const onSubmit = () => {
    if (!subject.trim()) {
      Alert.alert('Subject Required', 'Please enter a brief subject for your issue.');
      return;
    }
    if (!description.trim()) {
      Alert.alert('Description Required', 'Please describe what problem you encountered.');
      return;
    }
    submitMutation.mutate({
      categoryKey: selectedCategory,
      subject: subject.trim(),
      description: description.trim(),
    });
  };

  // Success Confirmation Screen
  if (submittedTicket) {
    return (
      <View style={[styles.root, styles.centerContent, { paddingTop: insets.top + SPACING.lg }]}>
        <View style={styles.successIconBadge}>
          <CheckCircle2 size={44} color={colors.primaryGreen} />
        </View>
        <Text style={styles.successTitle}>Request Submitted ✅</Text>
        <Text style={styles.successSub}>
          Your support request has been submitted successfully.
        </Text>
        <View style={styles.ticketIdPill}>
          <Text style={styles.ticketIdText}>Ticket #{submittedTicket.id.slice(0, 8)}</Text>
        </View>
        <Text style={styles.successNote}>
          Our support team will review your ticket and notify you once updated.
        </Text>
        <View style={styles.successBtnStack}>
          <Button label="View My Tickets" onPress={() => navigation.replace('MyTickets')} />
          <TouchableOpacity style={styles.backHomeBtn} onPress={() => navigation.goBack()}>
            <Text style={styles.backHomeBtnText}>Back to Support</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={{ paddingTop: insets.top + SPACING.xs }}>
        <BackHeader title="Submit Support Request" />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        {/* Step 1: Category Picker */}
        <Text style={styles.label}>What do you need help with?</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.categoryRow}
        >
          {ISSUE_CATEGORIES.map((cat) => {
            const active = selectedCategory === cat.key;
            return (
              <TouchableOpacity
                key={cat.key}
                style={[styles.categoryChip, active && styles.categoryChipActive]}
                onPress={() => setSelectedCategory(cat.key)}
              >
                <Text style={styles.categoryEmoji}>{cat.emoji}</Text>
                <Text style={[styles.categoryText, active && styles.categoryTextActive]}>
                  {cat.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* Step 2: Subject */}
        <Text style={styles.label}>
          Subject <Text style={styles.required}>*</Text>
        </Text>
        <TextInput
          style={styles.input}
          value={subject}
          onChangeText={setSubject}
          placeholder="e.g. Unable to upload photo in report"
          placeholderTextColor={colors.textSecondary}
          autoCapitalize="sentences"
        />

        {/* Step 3: Description */}
        <Text style={styles.label}>
          Describe your issue <Text style={styles.required}>*</Text>
        </Text>
        <TextInput
          style={[styles.input, styles.textArea]}
          value={description}
          onChangeText={setDescription}
          placeholder="Describe what happened and steps to reproduce..."
          placeholderTextColor={colors.textSecondary}
          multiline
          textAlignVertical="top"
        />

        {/* Step 4: Attachment */}
        <Text style={styles.label}>Attachment (Optional)</Text>
        {photoUri ? (
          <View style={styles.photoPreviewBox}>
            <Image source={{ uri: photoUri }} style={styles.photoPreviewImg} />
            <TouchableOpacity style={styles.removePhotoBtn} onPress={() => setPhotoUri(null)}>
              <X size={12} color="#FFFFFF" strokeWidth={3} />
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity style={styles.addPhotoBtn} onPress={onAddPhoto} activeOpacity={0.8}>
            <Camera size={20} color={colors.primaryGreen} />
            <Text style={styles.addPhotoText}>Add Photo / Screenshot</Text>
          </TouchableOpacity>
        )}

        {/* Action Button */}
        <Button
          label="Submit Request"
          onPress={onSubmit}
          loading={submitMutation.isPending || uploadingPhoto}
          style={styles.submitBtn}
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const createStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.bg },
    scrollContent: { paddingHorizontal: SIZES.padding, paddingBottom: SPACING.xxxl },
    centerContent: { paddingHorizontal: SIZES.padding, alignItems: 'center', justifyContent: 'center' },

    label: {
      ...TYPE.subheadStrong,
      color: colors.textPrimary,
      marginTop: SPACING.md,
      marginBottom: SPACING.xs,
    },
    required: { color: colors.danger },

    categoryRow: { gap: SPACING.xs, paddingBottom: SPACING.xxs },
    categoryChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: SPACING.sm + 2,
      paddingVertical: SPACING.xs,
      borderRadius: RADIUS.pill,
      backgroundColor: colors.bgElevated,
      borderWidth: 1,
      borderColor: colors.border,
    },
    categoryChipActive: {
      backgroundColor: colors.primaryGreenLight,
      borderColor: colors.primaryGreen,
    },
    categoryEmoji: { fontSize: 16 },
    categoryText: { ...TYPE.footnote, color: colors.textSecondary, fontWeight: '600' },
    categoryTextActive: { color: colors.primaryGreen, fontWeight: '800' },

    input: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: RADIUS.lg,
      paddingHorizontal: SPACING.md,
      paddingVertical: SPACING.sm,
      ...TYPE.body,
      color: colors.textPrimary,
      backgroundColor: colors.bgElevated,
    },
    textArea: { height: 110, textAlignVertical: 'top' },

    addPhotoBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: SPACING.xs,
      paddingVertical: SPACING.md,
      borderRadius: RADIUS.lg,
      borderWidth: 1.5,
      borderColor: colors.border,
      borderStyle: 'dashed',
      backgroundColor: colors.bgElevated,
    },
    addPhotoText: { ...TYPE.subheadStrong, color: colors.primaryGreen },

    photoPreviewBox: {
      position: 'relative',
      width: 100,
      height: 100,
      borderRadius: RADIUS.md,
      overflow: 'hidden',
    },
    photoPreviewImg: { width: '100%', height: '100%' },
    removePhotoBtn: {
      position: 'absolute',
      top: 4,
      right: 4,
      width: 20,
      height: 20,
      borderRadius: 10,
      backgroundColor: 'rgba(0,0,0,0.65)',
      alignItems: 'center',
      justifyContent: 'center',
    },

    submitBtn: { marginTop: SPACING.xl },

    successIconBadge: {
      width: 72,
      height: 72,
      borderRadius: 36,
      backgroundColor: colors.primaryGreenLight,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: SPACING.sm,
    },
    successTitle: { ...TYPE.title, fontSize: 22, color: colors.textPrimary, fontWeight: '800' },
    successSub: { ...TYPE.body, color: colors.textSecondary, textAlign: 'center', marginTop: 4 },
    ticketIdPill: {
      backgroundColor: colors.bgElevated,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: RADIUS.pill,
      paddingHorizontal: SPACING.md,
      paddingVertical: 6,
      marginVertical: SPACING.md,
    },
    ticketIdText: { ...TYPE.footnote, color: colors.primaryGreen, fontWeight: '800' },
    successNote: { ...TYPE.caption, color: colors.textSecondary, textAlign: 'center', marginBottom: SPACING.xl },
    successBtnStack: { width: '100%', gap: SPACING.xs },
    backHomeBtn: {
      alignItems: 'center',
      paddingVertical: SPACING.sm + 2,
      borderRadius: RADIUS.pill,
      backgroundColor: colors.bgElevated,
      borderWidth: 1,
      borderColor: colors.border,
    },
    backHomeBtnText: { ...TYPE.subheadStrong, color: colors.textPrimary },
  });
