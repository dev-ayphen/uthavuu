import { useMemo, useState } from 'react';
import {
  Image,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { HeartHandshake } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';
import { ICON_SIZE, SIZES, SPACING, TYPE } from '@uthavu/libs-mobile/theme/tokens';
import type { ColorScheme } from '@uthavu/libs-mobile/theme/colors';
import { useTheme } from '@uthavu/libs-mobile/theme/ThemeProvider';
import { requestOtp } from '@uthavu/libs-mobile/api/auth';
import { ApiError } from '@uthavu/libs-mobile/lib/api';
import Button from '@uthavu/libs-mobile/components/Button';

type Props = NativeStackScreenProps<RootStackParamList, 'Login'>;

// docs/mobile/03-login-screen.md gap #4: the documented prototype validates length
// only, which accepts 0000000000. Real Indian mobile numbers start 6-9.
const PHONE_REGEX = /^[6-9]\d{9}$/;

export default function LoginScreen({ navigation }: Props) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors, insets), [colors, insets]);
  const { t } = useTranslation('auth');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const isValid = PHONE_REGEX.test(phone);

  const onChangePhone = (text: string) => {
    setPhone(text.replace(/[^0-9]/g, '').substring(0, 10));
    if (error) setError('');
  };

  const onContinue = async () => {
    if (!isValid || submitting) return;
    setSubmitting(true);
    setError('');
    try {
      await requestOtp(phone);
      navigation.navigate('Otp', { phone });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t('sendCodeError'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.container}>
        <View style={styles.header}>
          <HeartHandshake size={ICON_SIZE.xl} color={colors.primaryGreen} strokeWidth={1.5} />
          <Text style={styles.wordmark}>உதவு</Text>
        </View>

        <Image
          source={require('../../assets/login_hero.png')}
          style={styles.hero}
          resizeMode="cover"
        />

        <Text style={styles.title}>{t('loginTitle')}</Text>
        <Text style={styles.subtitle}>{t('loginSubtitle')}</Text>

        <View style={styles.inputRow}>
          <View style={styles.prefix}>
            <Text style={styles.prefixText}>+91</Text>
          </View>
          <TextInput
            style={styles.input}
            placeholder={t('phoneNumberPlaceholder')}
            placeholderTextColor={colors.textSecondary}
            keyboardType="phone-pad"
            maxLength={10}
            value={phone}
            onChangeText={onChangePhone}
            accessibilityLabel={t('phoneNumberLabel')}
          />
        </View>
        {error ? <Text style={styles.error}>{error}</Text> : null}

        <View style={styles.spacer} />

        <Text style={styles.terms}>{t('terms')}</Text>
        <Button label={t('continue')} onPress={onContinue} disabled={!isValid} loading={submitting} />
      </View>
    </KeyboardAvoidingView>
  );
}

const createStyles = (colors: ColorScheme, insets: { top: number; bottom: number }) =>
  StyleSheet.create({
    flex: { flex: 1, backgroundColor: colors.bg },
    container: {
      flex: 1,
      backgroundColor: colors.bg,
      padding: SIZES.padding,
      paddingTop: insets.top + SIZES.padding,
      paddingBottom: insets.bottom + SIZES.padding,
    },
    header: { flexDirection: 'row', alignItems: 'center', marginBottom: SPACING.lg },
    wordmark: { ...TYPE.title, color: colors.primaryGreen, marginLeft: SPACING.xs },
    hero: { width: '100%', height: 160, borderRadius: SIZES.radiusMd, marginBottom: SPACING.xl },
    title: { ...TYPE.heroTitle, color: colors.textPrimary, marginBottom: SPACING.xs },
    subtitle: { ...TYPE.headline, color: colors.textSecondary, marginBottom: SPACING.xxl },
    inputRow: { flexDirection: 'row', gap: SPACING.sm },
    prefix: {
      backgroundColor: colors.bgElevated,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: SIZES.radiusLg,
      padding: SPACING.md,
      justifyContent: 'center',
    },
    prefixText: { ...TYPE.title, color: colors.textPrimary },
    input: {
      flex: 1,
      backgroundColor: colors.bgElevated,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: SIZES.radiusLg,
      padding: SPACING.md,
      ...TYPE.title,
      fontWeight: '400',
      color: colors.textPrimary,
    },
    error: { ...TYPE.body, color: colors.danger, marginTop: SPACING.xs },
    spacer: { marginTop: 'auto' },
    terms: {
      ...TYPE.footnoteRegular,
      textAlign: 'center',
      color: colors.textSecondary,
      marginBottom: SPACING.md,
    },
  });
