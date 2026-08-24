import { useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AlertTriangle } from 'lucide-react-native';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CommonActions, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import type { RootStackParamList } from '../navigation/types';
import type { ColorScheme } from '@uthavu/libs-mobile/theme/colors';
import { useTheme } from '@uthavu/libs-mobile/theme/ThemeProvider';
import { ICON_SIZE, RADIUS, SIZES, SPACING, TONES, TYPE } from '@uthavu/libs-mobile/theme/tokens';
import { deleteAccount } from '@uthavu/libs-mobile/api/users';
import { clearToken } from '@uthavu/libs-mobile/lib/session';
import { ApiError } from '@uthavu/libs-mobile/lib/api';
import Button from '@uthavu/libs-mobile/components/Button';
import TextField from '@uthavu/libs-mobile/components/TextField';
import BackHeader from '@uthavu/libs-mobile/components/BackHeader';

const CONFIRM_PHRASE = 'DELETE';

// Settings → Delete Account. A real, permanent action — unlike report
// deletion (soft, reversible-in-the-database), this genuinely removes the
// account and everything that references it. Requires typing "DELETE"
// before the button even enables, on top of the destructive-style button
// itself — no single accidental tap can trigger this.
export default function DeleteAccountScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { t } = useTranslation(['deleteAccount', 'common']);
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const queryClient = useQueryClient();

  const [confirmText, setConfirmText] = useState('');
  const [error, setError] = useState('');
  const canDelete = confirmText.trim().toUpperCase() === CONFIRM_PHRASE;

  const deleteMutation = useMutation({
    mutationFn: deleteAccount,
    onSuccess: async () => {
      await clearToken();
      queryClient.clear();
      navigation.dispatch(CommonActions.reset({ index: 0, routes: [{ name: 'Login' as never }] }));
    },
    onError: (e) => {
      setError(e instanceof ApiError ? e.message : t('deleteFailed'));
    },
  });

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[styles.root, { paddingTop: insets.top + SPACING.xs }]}>
        <BackHeader title={t('title')} />
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.warningCard}>
            <AlertTriangle size={ICON_SIZE.lg} color={TONES.critical.fg} />
            <Text style={styles.warningTitle}>{t('warningTitle')}</Text>
            <Text style={styles.warningBody}>{t('warningBody')}</Text>
          </View>

          <View style={styles.listCard}>
            <Text style={styles.listItem}>{t('loseReports')}</Text>
            <Text style={styles.listItem}>{t('loseMissions')}</Text>
            <Text style={styles.listItem}>{t('loseImpactStories')}</Text>
            <Text style={styles.listItem}>{t('loseTickets')}</Text>
            <Text style={styles.listItem}>{t('loseAccountData')}</Text>
          </View>

          <Text style={styles.confirmLabel}>{t('confirmLabel', { phrase: CONFIRM_PHRASE })}</Text>
          <TextField
            value={confirmText}
            onChangeText={(v) => {
              setConfirmText(v);
              if (error) setError('');
            }}
            placeholder={CONFIRM_PHRASE}
            autoCapitalize="characters"
            accessibilityLabel={t('confirmLabel', { phrase: CONFIRM_PHRASE })}
            style={styles.field}
          />

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Button
            label={t('deleteButton')}
            variant="dangerOutline"
            onPress={() => deleteMutation.mutate()}
            disabled={!canDelete || deleteMutation.isPending}
            loading={deleteMutation.isPending}
            style={styles.deleteButton}
          />
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
}

const createStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    flex: { flex: 1, backgroundColor: colors.bg },
    root: { flex: 1, backgroundColor: colors.bg },
    content: { padding: SIZES.padding, paddingBottom: SPACING.xxxl, gap: SPACING.md },
    warningCard: {
      alignItems: 'center',
      padding: SPACING.lg,
      borderRadius: RADIUS.lg,
      backgroundColor: TONES.critical.fill,
      borderWidth: 1,
      borderColor: TONES.critical.border,
      gap: SPACING.xs,
    },
    warningTitle: { ...TYPE.title, color: TONES.critical.fg, textAlign: 'center' },
    warningBody: { ...TYPE.body, color: colors.textPrimary, textAlign: 'center', lineHeight: 20 },
    listCard: {
      padding: SPACING.md,
      borderRadius: RADIUS.lg,
      backgroundColor: colors.bgElevated,
      borderWidth: 1,
      borderColor: colors.border,
      gap: SPACING.xs,
    },
    listItem: { ...TYPE.body, color: colors.textPrimary },
    confirmLabel: { ...TYPE.subheadStrong, color: colors.textPrimary },
    field: {},
    error: { ...TYPE.body, color: colors.danger },
    deleteButton: { marginTop: SPACING.xs },
  });
