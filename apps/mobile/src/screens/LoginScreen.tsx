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
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';
import { SIZES, SPACING, TYPE } from '../theme/tokens';
import type { ColorScheme } from '../theme/colors';
import { useTheme } from '../theme/ThemeProvider';
import { requestOtp } from '../api/auth';
import { ApiError } from '../lib/api';
import Button from '../components/Button';

type Props = NativeStackScreenProps<RootStackParamList, 'Login'>;

// docs/mobile/03-login-screen.md gap #4: the documented prototype validates length
// only, which accepts 0000000000. Real Indian mobile numbers start 6-9.
const PHONE_REGEX = /^[6-9]\d{9}$/;

export default function LoginScreen({ navigation }: Props) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors, insets), [colors, insets]);
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
      setError(e instanceof ApiError ? e.message : 'Could not send code. Try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.container}>
        <View style={styles.header}>
          <HeartHandshake size={28} color={colors.primaryGreen} strokeWidth={1.5} />
          <Text style={styles.wordmark}>உதவு</Text>
        </View>

        <Image
          source={require('../../assets/login_hero.png')}
          style={styles.hero}
          resizeMode="cover"
        />

        <Text style={styles.title}>Enter your number to continue</Text>
        <Text style={styles.subtitle}>We'll text you a one-time code to verify it's you.</Text>

        <View style={styles.inputRow}>
          <View style={styles.prefix}>
            <Text style={styles.prefixText}>+91</Text>
          </View>
          <TextInput
            style={styles.input}
            placeholder="Phone number"
            placeholderTextColor={colors.textSecondary}
            keyboardType="phone-pad"
            maxLength={10}
            value={phone}
            onChangeText={onChangePhone}
            accessibilityLabel="Phone number"
          />
        </View>
        {error ? <Text style={styles.error}>{error}</Text> : null}

        <View style={styles.spacer} />

        <Text style={styles.terms}>By continuing, you agree to our Terms and Privacy Policy.</Text>
        <Button label="Continue" onPress={onContinue} disabled={!isValid} loading={submitting} />
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
    header: { flexDirection: 'row', alignItems: 'center', marginBottom: 20 },
    wordmark: { ...TYPE.title, color: colors.primaryGreen, marginLeft: 8 },
    hero: { width: '100%', height: 160, borderRadius: SIZES.radiusMd, marginBottom: 24 },
    title: { ...TYPE.heroTitle, color: colors.textPrimary, marginBottom: 8 },
    subtitle: { ...TYPE.headline, color: colors.textSecondary, marginBottom: 32 },
    inputRow: { flexDirection: 'row', gap: 12 },
    prefix: {
      backgroundColor: colors.bgElevated,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: SIZES.radiusLg,
      padding: 16,
      justifyContent: 'center',
    },
    prefixText: { ...TYPE.title, color: colors.textPrimary },
    input: {
      flex: 1,
      backgroundColor: colors.bgElevated,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: SIZES.radiusLg,
      padding: 16,
      ...TYPE.title,
      fontWeight: '400',
      color: colors.textPrimary,
    },
    error: { ...TYPE.body, color: colors.danger, marginTop: 8 },
    spacer: { marginTop: 'auto' },
    terms: {
      ...TYPE.footnoteRegular,
      textAlign: 'center',
      color: colors.textSecondary,
      marginBottom: SPACING.md,
    },
  });
