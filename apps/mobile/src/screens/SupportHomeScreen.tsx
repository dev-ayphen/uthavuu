import { useMemo, useState } from 'react';
import {
  Alert,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  AlertCircle,
  Camera,
  CheckCircle2,
  ChevronRight,
  Clock,
  HelpCircle,
  LifeBuoy,
  PlusCircle,
  ShieldAlert,
  User,
  X,
} from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as ImagePicker from 'expo-image-picker';
import type { RootStackParamList } from '../navigation/types';
import type { ColorScheme } from '@uthavu/libs-mobile/theme/colors';
import { useTheme } from '@uthavu/libs-mobile/theme/ThemeProvider';
import { RADIUS, SIZES, SPACING, TONES, TYPE } from '@uthavu/libs-mobile/theme/tokens';
import { createTicket, listMyTickets } from '@uthavu/libs-mobile/api/tickets';
import { ApiError } from '@uthavu/libs-mobile/lib/api';
import { formatRelativeTime } from '@uthavu/libs-mobile/lib/time';
import BackHeader from '@uthavu/libs-mobile/components/BackHeader';
import Button from '@uthavu/libs-mobile/components/Button';
import Skeleton from '@uthavu/libs-mobile/components/Skeleton';

type Nav = NativeStackNavigationProp<RootStackParamList>;

type FAQItem = { id: string; category: string; icon: typeof HelpCircle; question: string; answer: string };

const FAQ_ITEMS: FAQItem[] = [
  { id: 'faq-1', category: 'Report / Help Request', icon: AlertCircle, question: 'How do I create a help request?', answer: 'Tap the green "+" FAB button in the middle of the bottom navigation bar. Select a category, take a live photo, add details, and confirm location to publish.' },
  { id: 'faq-2', category: 'Mission / Volunteer', icon: LifeBuoy, question: 'How do I accept a mission?', answer: 'Browse nearby requests on Home or Category lists. Tap "I\'ll Help" on any request. You have a 15-minute response window to confirm your arrival.' },
  { id: 'faq-3', category: 'Mission / Volunteer', icon: Clock, question: 'Why did my mission expire?', answer: 'When you tap "I\'ll Help", you receive a 15-minute window. If you don\'t tap "Start Helping" within 15 minutes, your slot is released so other volunteers can help.' },
  { id: 'faq-4', category: 'Account & Profile', icon: User, question: 'How do I edit my profile?', answer: 'Go to Profile tab → tap "Edit Profile". You can update your name, city, district, bio, and volunteer categories.' },
  { id: 'faq-5', category: 'Safety & Privacy', icon: ShieldAlert, question: 'How do I report inappropriate content?', answer: 'Tap the "..." options menu on any comment or report, then tap "Report Comment". Choose a reason like Spam or Harassment to send it for admin review.' },
];

const ISSUE_CATEGORIES = [
  { key: 'account_profile', label: 'Account & Profile', emoji: '👤' },
  { key: 'report_request', label: 'Report / Help Request', emoji: '🚨' },
  { key: 'mission_volunteer', label: 'Mission / Volunteer', emoji: '🤝' },
  { key: 'notifications', label: 'Notifications', emoji: '🔔' },
  { key: 'location_gps', label: 'Location / GPS', emoji: '📍' },
  { key: 'app_bug', label: 'App Problem / Bug', emoji: '🐛' },
  { key: 'safety_abuse', label: 'Safety & Abuse', emoji: '🛡️' },
  { key: 'other', label: 'Other', emoji: '💬' },
];

export default function SupportHomeScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const navigation = useNavigation<Nav>();
  const queryClient = useQueryClient();

  // FAQ modal state
  const [selectedFaq, setSelectedFaq] = useState<FAQItem | null>(null);

  // Submit form modal state
  const [submitOpen, setSubmitOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState('app_bug');
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [submittedId, setSubmittedId] = useState<string | null>(null);

  const openSubmit = () => {
    setSelectedCategory('app_bug');
    setSubject('');
    setDescription('');
    setPhotoUri(null);
    setSubmittedId(null);
    setSubmitOpen(true);
  };

  const closeSubmit = () => {
    setSubmitOpen(false);
    setSubmittedId(null);
  };

  const submitMutation = useMutation({
    mutationFn: createTicket,
    onSuccess: (ticket) => {
      queryClient.invalidateQueries({ queryKey: ['myTickets'] });
      setSubmittedId(ticket.id);
    },
    onError: (e) => {
      Alert.alert('Error', e instanceof ApiError ? e.message : 'Could not submit ticket. Please try again.');
    },
  });

  const onAddPhoto = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (perm.status !== 'granted') { Alert.alert('Camera Needed', 'Camera permission is required.'); return; }
    const result = await ImagePicker.launchCameraAsync({ quality: 0.7 });
    if (!result.canceled && result.assets?.[0]) setPhotoUri(result.assets[0].uri);
  };

  const onSubmit = () => {
    if (!subject.trim()) { Alert.alert('Subject Required', 'Please enter a brief subject.'); return; }
    if (!description.trim()) { Alert.alert('Description Required', 'Please describe your issue.'); return; }
    submitMutation.mutate({ categoryKey: selectedCategory, subject: subject.trim(), description: description.trim() });
  };

  const { data: tickets, isLoading: ticketsLoading } = useQuery({ queryKey: ['myTickets'], queryFn: listMyTickets });
  const recentTickets = useMemo(() => (tickets ?? []).slice(0, 3), [tickets]);
  const statusTone = (key: string) => key === 'in_review' ? TONES.soon : key === 'resolved' ? null : TONES.adminManaged;

  return (
    <View style={[styles.root, { paddingTop: insets.top + SPACING.xs }]}>
      <BackHeader title="Help & Support" />

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* CTA: Submit a Support Request — opens modal inline */}
        <TouchableOpacity style={styles.submitCtaCard} onPress={openSubmit} activeOpacity={0.9}>
          <View style={styles.ctaIconBadge}>
            <PlusCircle size={22} color="#FFFFFF" />
          </View>
          <View style={styles.ctaBody}>
            <Text style={styles.ctaTitle}>Submit a Support Request</Text>
            <Text style={styles.ctaSub}>Need technical aid or want to report an app issue?</Text>
          </View>
          <ChevronRight size={18} color="#FFFFFF" />
        </TouchableOpacity>

        {/* Common Questions (FAQ) */}
        <Text style={styles.sectionTitle}>Common Questions (FAQ)</Text>
        <View style={styles.faqCard}>
          {FAQ_ITEMS.map((item, idx) => {
            const IconComponent = item.icon;
            return (
              <View key={item.id}>
                <TouchableOpacity style={styles.faqRow} onPress={() => setSelectedFaq(item)} activeOpacity={0.7}>
                  <View style={styles.faqIconBox}><IconComponent size={16} color={colors.primaryGreen} /></View>
                  <Text style={styles.faqQuestion}>{item.question}</Text>
                  <ChevronRight size={14} color={colors.textSecondary} />
                </TouchableOpacity>
                {idx < FAQ_ITEMS.length - 1 && <View style={styles.divider} />}
              </View>
            );
          })}
        </View>

        {/* My Support Tickets */}
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>My Support Tickets</Text>
          <TouchableOpacity onPress={() => navigation.navigate('MyTickets')}>
            <Text style={styles.viewAllText}>View All ({tickets?.length ?? 0})</Text>
          </TouchableOpacity>
        </View>

        {ticketsLoading ? (
          <View style={styles.ticketsStack}>
            <Skeleton width="100%" height={64} borderRadius={RADIUS.lg} />
            <Skeleton width="100%" height={64} borderRadius={RADIUS.lg} />
          </View>
        ) : recentTickets.length > 0 ? (
          <View style={styles.ticketsStack}>
            {recentTickets.map((t) => {
              const tone = statusTone(t.status.key);
              return (
                <View key={t.id} style={styles.ticketCard}>
                  <View style={styles.ticketCardHeader}>
                    <Text style={styles.ticketId}>#{t.id.slice(0, 8)}</Text>
                    <View style={[styles.statusPill, tone ? { backgroundColor: tone.fill, borderColor: tone.border } : { backgroundColor: colors.primaryGreenLight, borderColor: colors.primaryGreen }]}>
                      <Text style={[styles.statusText, { color: tone ? tone.fg : colors.primaryGreen }]}>{t.status.label}</Text>
                    </View>
                  </View>
                  <Text style={styles.ticketSubject} numberOfLines={1}>{t.subject}</Text>
                  <Text style={styles.ticketTime}>{t.category.label} · {formatRelativeTime(t.createdAt)}</Text>
                </View>
              );
            })}
          </View>
        ) : (
          <View style={styles.emptyTicketCard}>
            <HelpCircle size={28} color={colors.textSecondary} strokeWidth={1.5} />
            <Text style={styles.emptyTitle}>No support tickets yet</Text>
            <Text style={styles.emptySub}>Submit a request above — track status & replies here.</Text>
          </View>
        )}
      </ScrollView>

      {/* ── FAQ Detail Modal ── */}
      <Modal visible={Boolean(selectedFaq)} transparent animationType="fade" onRequestClose={() => setSelectedFaq(null)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setSelectedFaq(null)}>
          <View style={styles.modalCard}>
            <Text style={styles.modalCategory}>{selectedFaq?.category}</Text>
            <Text style={styles.modalQuestion}>{selectedFaq?.question}</Text>
            <Text style={styles.modalAnswer}>{selectedFaq?.answer}</Text>
            <Button label="Got it" onPress={() => setSelectedFaq(null)} />
          </View>
        </TouchableOpacity>
      </Modal>

      {/* ── Submit Ticket Bottom-Sheet Modal ── */}
      <Modal visible={submitOpen} transparent animationType="slide" onRequestClose={closeSubmit}>
        <View style={styles.sheetOverlay}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.sheet}>
            {/* Sheet drag handle */}
            <View style={styles.sheetHandle} />

            {/* Header */}
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Submit Support Request</Text>
              <TouchableOpacity onPress={closeSubmit} style={styles.sheetCloseBtn}>
                <X size={18} color={colors.textSecondary} strokeWidth={2.5} />
              </TouchableOpacity>
            </View>

            {submittedId ? (
              /* ── Success state ── */
              <View style={styles.successBox}>
                <CheckCircle2 size={44} color={colors.primaryGreen} />
                <Text style={styles.successTitle}>Request Submitted ✅</Text>
                <View style={styles.ticketIdPill}>
                  <Text style={styles.ticketIdText}>Ticket #{submittedId.slice(0, 8)}</Text>
                </View>
                <Text style={styles.successNote}>Our team will review and reply to your ticket shortly.</Text>
                <Button label="View My Tickets" onPress={() => { closeSubmit(); navigation.navigate('MyTickets'); }} />
                <TouchableOpacity style={styles.closeLinkBtn} onPress={closeSubmit}>
                  <Text style={styles.closeLinkText}>Close</Text>
                </TouchableOpacity>
              </View>
            ) : (
              /* ── Form ── */
              <ScrollView contentContainerStyle={styles.sheetContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                {/* Category */}
                <Text style={styles.fieldLabel}>What do you need help with?</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryRow}>
                  {ISSUE_CATEGORIES.map((cat) => {
                    const active = selectedCategory === cat.key;
                    return (
                      <TouchableOpacity key={cat.key} style={[styles.categoryChip, active && styles.categoryChipActive]} onPress={() => setSelectedCategory(cat.key)}>
                        <Text style={styles.categoryEmoji}>{cat.emoji}</Text>
                        <Text style={[styles.categoryText, active && styles.categoryTextActive]}>{cat.label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>

                {/* Subject */}
                <Text style={styles.fieldLabel}>Subject <Text style={styles.required}>*</Text></Text>
                <TextInput
                  style={styles.input}
                  value={subject}
                  onChangeText={setSubject}
                  placeholder="e.g. Unable to upload photo"
                  placeholderTextColor={colors.textSecondary}
                  autoCapitalize="sentences"
                />

                {/* Description */}
                <Text style={styles.fieldLabel}>Describe your issue <Text style={styles.required}>*</Text></Text>
                <TextInput
                  style={[styles.input, styles.textArea]}
                  value={description}
                  onChangeText={setDescription}
                  placeholder="Describe what happened and steps to reproduce..."
                  placeholderTextColor={colors.textSecondary}
                  multiline
                  textAlignVertical="top"
                />

                {/* Photo */}
                <Text style={styles.fieldLabel}>Attachment (Optional)</Text>
                {photoUri ? (
                  <View style={styles.photoPreviewBox}>
                    <Image source={{ uri: photoUri }} style={styles.photoPreviewImg} />
                    <TouchableOpacity style={styles.removePhotoBtn} onPress={() => setPhotoUri(null)}>
                      <X size={10} color="#FFFFFF" strokeWidth={3} />
                    </TouchableOpacity>
                  </View>
                ) : (
                  <TouchableOpacity style={styles.addPhotoBtn} onPress={onAddPhoto}>
                    <Camera size={18} color={colors.primaryGreen} />
                    <Text style={styles.addPhotoText}>Add Photo / Screenshot</Text>
                  </TouchableOpacity>
                )}

                <Button label="Submit Request" onPress={onSubmit} loading={submitMutation.isPending} style={styles.submitBtn} />
              </ScrollView>
            )}
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </View>
  );
}

const createStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.bg },
    scrollContent: { paddingHorizontal: SIZES.padding, paddingBottom: SPACING.xxxl },

    submitCtaCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.sm,
      backgroundColor: colors.primaryGreen,
      borderRadius: RADIUS.xl,
      padding: SPACING.sm + 4,
      marginBottom: SPACING.md,
      marginTop: SPACING.xs,
    },
    ctaIconBadge: { width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(255,255,255,0.22)', alignItems: 'center', justifyContent: 'center' },
    ctaBody: { flex: 1 },
    ctaTitle: { ...TYPE.bodyStrong, fontSize: 14, color: '#FFFFFF', fontWeight: '800' },
    ctaSub: { ...TYPE.caption, fontSize: 12, color: 'rgba(255,255,255,0.85)', marginTop: 1 },

    sectionTitle: { ...TYPE.subheadStrong, fontSize: 13, color: colors.textPrimary, marginBottom: SPACING.xs },
    sectionHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: SPACING.md, marginBottom: SPACING.xs },
    viewAllText: { ...TYPE.footnote, color: colors.primaryGreen, fontWeight: '700' },

    faqCard: { backgroundColor: colors.bgElevated, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
    faqRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.xs, paddingHorizontal: SPACING.sm, paddingVertical: SPACING.xs + 2 },
    faqIconBox: { width: 28, height: 28, borderRadius: RADIUS.sm, backgroundColor: colors.primaryGreenLight, alignItems: 'center', justifyContent: 'center' },
    faqQuestion: { flex: 1, ...TYPE.footnote, fontSize: 12.5, color: colors.textPrimary, fontWeight: '600' },
    divider: { height: 1, backgroundColor: colors.border, marginHorizontal: SPACING.sm },

    ticketsStack: { gap: SPACING.xs },
    ticketCard: { backgroundColor: colors.bgElevated, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: colors.border, padding: SPACING.sm },
    ticketCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    ticketId: { ...TYPE.microLabel, color: colors.textSecondary },
    statusPill: { borderWidth: 1, borderRadius: RADIUS.pill, paddingHorizontal: 7, paddingVertical: 2 },
    statusText: { ...TYPE.microLabel, fontSize: 10, fontWeight: '700' },
    ticketSubject: { ...TYPE.footnote, fontSize: 13, fontWeight: '700', color: colors.textPrimary, marginTop: 3 },
    ticketTime: { ...TYPE.microLabel, color: colors.textSecondary, marginTop: 2 },

    emptyTicketCard: { alignItems: 'center', backgroundColor: colors.bgElevated, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: colors.border, padding: SPACING.md, gap: 4 },
    emptyTitle: { ...TYPE.footnote, fontWeight: '700', color: colors.textPrimary },
    emptySub: { ...TYPE.microLabel, color: colors.textSecondary, textAlign: 'center' },

    // FAQ modal
    modalOverlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.6)', justifyContent: 'center', padding: SPACING.lg },
    modalCard: { backgroundColor: colors.bg, borderRadius: RADIUS.xxl, padding: SPACING.lg },
    modalCategory: { ...TYPE.microLabel, color: colors.primaryGreen, fontWeight: '800', textTransform: 'uppercase' },
    modalQuestion: { ...TYPE.title, fontSize: 16, color: colors.textPrimary, fontWeight: '800', marginTop: 4, marginBottom: SPACING.xs },
    modalAnswer: { ...TYPE.body, fontSize: 13.5, color: colors.textSecondary, lineHeight: 19, marginBottom: SPACING.md },

    // Bottom-sheet modal
    sheetOverlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.55)', justifyContent: 'flex-end' },
    sheet: { backgroundColor: colors.bg, borderTopLeftRadius: RADIUS.xxl, borderTopRightRadius: RADIUS.xxl, maxHeight: '88%' },
    sheetHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: 'center', marginTop: SPACING.sm },
    sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: SPACING.md, paddingVertical: SPACING.xs + 2 },
    sheetTitle: { ...TYPE.subheadStrong, fontSize: 15, color: colors.textPrimary, fontWeight: '800' },
    sheetCloseBtn: { width: 30, height: 30, borderRadius: 15, backgroundColor: colors.bgElevated, alignItems: 'center', justifyContent: 'center' },
    sheetContent: { paddingHorizontal: SPACING.md, paddingBottom: SPACING.xl },

    fieldLabel: { ...TYPE.captionStrong, fontSize: 12, color: colors.textPrimary, fontWeight: '700', marginTop: SPACING.sm, marginBottom: 4 },
    required: { color: colors.danger },
    categoryRow: { gap: SPACING.xs, paddingBottom: SPACING.xs },
    categoryChip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: SPACING.xs + 4, paddingVertical: 5, borderRadius: RADIUS.pill, backgroundColor: colors.bgElevated, borderWidth: 1, borderColor: colors.border },
    categoryChipActive: { backgroundColor: colors.primaryGreenLight, borderColor: colors.primaryGreen },
    categoryEmoji: { fontSize: 14 },
    categoryText: { ...TYPE.microLabel, fontSize: 11, color: colors.textSecondary, fontWeight: '600' },
    categoryTextActive: { color: colors.primaryGreen, fontWeight: '800' },

    input: { borderWidth: 1, borderColor: colors.border, borderRadius: RADIUS.md, paddingHorizontal: SPACING.sm, paddingVertical: SPACING.xs + 2, ...TYPE.body, fontSize: 13, color: colors.textPrimary, backgroundColor: colors.bgElevated },
    textArea: { height: 90, textAlignVertical: 'top' },

    addPhotoBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.xs, paddingVertical: SPACING.sm, borderRadius: RADIUS.md, borderWidth: 1.5, borderColor: colors.border, borderStyle: 'dashed', backgroundColor: colors.bgElevated },
    addPhotoText: { ...TYPE.footnote, fontSize: 12, fontWeight: '700', color: colors.primaryGreen },
    photoPreviewBox: { position: 'relative', width: 80, height: 80, borderRadius: RADIUS.md, overflow: 'hidden' },
    photoPreviewImg: { width: '100%', height: '100%' },
    removePhotoBtn: { position: 'absolute', top: 3, right: 3, width: 18, height: 18, borderRadius: 9, backgroundColor: 'rgba(0,0,0,0.65)', alignItems: 'center', justifyContent: 'center' },

    submitBtn: { marginTop: SPACING.md },

    // Success state inside sheet
    successBox: { alignItems: 'center', paddingHorizontal: SPACING.lg, paddingVertical: SPACING.lg, gap: SPACING.xs },
    successTitle: { ...TYPE.headlineStrong, fontSize: 18, color: colors.textPrimary, fontWeight: '800' },
    ticketIdPill: { backgroundColor: colors.bgElevated, borderWidth: 1, borderColor: colors.border, borderRadius: RADIUS.pill, paddingHorizontal: SPACING.md, paddingVertical: 5 },
    ticketIdText: { ...TYPE.footnote, color: colors.primaryGreen, fontWeight: '800' },
    successNote: { ...TYPE.caption, color: colors.textSecondary, textAlign: 'center', marginBottom: SPACING.sm },
    closeLinkBtn: { paddingVertical: SPACING.xs },
    closeLinkText: { ...TYPE.footnote, color: colors.textSecondary },
  });
