import { useMemo, useRef, useState, useEffect } from 'react';
import { Pressable, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';
import { RADIUS, SIZES, SPACING, TYPE } from '@uthavu/libs-mobile/theme/tokens';
import type { ColorScheme } from '@uthavu/libs-mobile/theme/colors';
import { useTheme } from '@uthavu/libs-mobile/theme/ThemeProvider';
import BackButton from '@uthavu/libs-mobile/components/BackButton';
import Button from '@uthavu/libs-mobile/components/Button';
import { requestOtp, verifyOtp, isProfileIncomplete } from '@uthavu/libs-mobile/api/auth';
import { setToken } from '@uthavu/libs-mobile/lib/session';
import { ApiError } from '@uthavu/libs-mobile/lib/api';

type Props = NativeStackScreenProps<RootStackParamList, 'Otp'>;

const CODE_LENGTH = 6;
const RESEND_COOLDOWN_S = 30;

function formatPhone(phone: string) {
  return `+91 ${phone.slice(0, 5)} ${phone.slice(5)}`;
}

export default function OtpScreen({ navigation, route }: Props) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors, insets), [colors, insets]);
  const { phone } = route.params;
  const [code, setCode] = useState('');
  const [focused, setFocused] = useState(false);
  const [error, setError] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);
  const [timer, setTimer] = useState(RESEND_COOLDOWN_S);
  const inputRef = useRef<TextInput | null>(null);

  useEffect(() => {
    if (timer <= 0) return;
    const id = setInterval(() => setTimer((t) => t - 1), 1000);
    return () => clearInterval(id);
  }, [timer > 0]); // eslint-disable-line react-hooks/exhaustive-deps

  const isComplete = code.length === CODE_LENGTH;

  const submit = async (code: string) => {
    setVerifying(true);
    setError('');
    try {
      const { token, user } = await verifyOtp(phone, code);
      if (token) await setToken(token);
      if (isProfileIncomplete(user)) {
        navigation.navigate('Permissions');
      } else {
        navigation.replace('MainTabs');
      }
    } catch (e) {
      // Codes are Better Auth's own (PHONE_NUMBER_ERROR_CODES) — verified against
      // source, not guessed. All but TOO_MANY_ATTEMPTS come back as HTTP 400, so
      // branch on `code`, not status.
      if (e instanceof ApiError && e.code === 'OTP_EXPIRED') {
        setError('OTP expired. Request a new one.');
      } else if (e instanceof ApiError && e.code === 'TOO_MANY_ATTEMPTS') {
        setError('Too many attempts. Request a new code.');
      } else if (e instanceof ApiError && (e.code === 'INVALID_OTP' || e.code === 'OTP_NOT_FOUND')) {
        setError('Invalid OTP. Please try again.');
      } else {
          setError('Something went wrong. Please try again.');
      }
      setCode('');
      inputRef.current?.focus();
    } finally {
      setVerifying(false);
    }
  };

  // A single real TextInput backs all 6 boxes (rendered as plain Views below,
  // driven off `code`) instead of one TextInput per digit. That used to make
  // paste unreliable — iOS's paste menu on a 45pt-wide field is finicky, and
  // splitting a pasted string across boxes needed its own hand-rolled logic.
  // One field also single-handedly gets both platforms' "autofill from
  // Messages" behavior for free via textContentType/autoComplete below.
  const handleChange = (raw: string) => {
    const value = raw.replace(/[^0-9]/g, '').slice(0, CODE_LENGTH);
    if (error) setError('');
    setCode(value);
    if (value.length === CODE_LENGTH) submit(value);
  };

  const onResend = async () => {
    if (timer > 0 || resending) return;
    setResending(true);
    setError('');
    try {
      await requestOtp(phone);
      setTimer(RESEND_COOLDOWN_S);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not resend code.');
    } finally {
      setResending(false);
    }
  };

  return (
    <View style={styles.container}>
      <BackButton style={styles.backButton} />

      <Text style={styles.title}>Verify number</Text>
      <Text style={styles.subtitle}>
        Enter the 6-digit code sent to {formatPhone(phone)}.
      </Text>

      <Pressable style={styles.boxRow} onPress={() => inputRef.current?.focus()}>
        <View
          style={styles.boxesLayer}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          {Array.from({ length: CODE_LENGTH }).map((_, index) => {
            const isNextToFill = focused && index === code.length;
            return (
              <View key={index} style={[styles.box, isNextToFill && styles.boxFocused]}>
                <Text style={styles.boxText}>{code[index] ?? ''}</Text>
              </View>
            );
          })}
        </View>
        <TextInput
          ref={inputRef}
          style={styles.hiddenInput}
          value={code}
          onChangeText={handleChange}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          keyboardType="number-pad"
          maxLength={CODE_LENGTH}
          textContentType="oneTimeCode"
          autoComplete="one-time-code"
          caretHidden
          autoFocus
          accessibilityLabel="6-digit verification code"
        />
      </Pressable>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <View style={styles.timerRow}>
        {timer > 0 ? (
          <Text style={styles.timerText}>
            Resend code in{' '}
            <Text style={styles.timerDigits}>00:{timer.toString().padStart(2, '0')}</Text>
          </Text>
        ) : (
          <TouchableOpacity
            onPress={onResend}
            disabled={resending}
            accessibilityRole="button"
            accessibilityLabel="Resend code"
            accessibilityState={{ disabled: resending }}
          >
            <Text style={styles.resendLink}>{resending ? 'Sending…' : 'Resend Code'}</Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.spacer} />

      <Button label="Verify" onPress={() => submit(code)} disabled={!isComplete} loading={verifying} />
    </View>
  );
}

const createStyles = (colors: ColorScheme, insets: { top: number; bottom: number }) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.bg,
      padding: SIZES.padding,
      paddingTop: insets.top + SIZES.padding,
      paddingBottom: insets.bottom + SIZES.padding,
    },
    backButton: { marginBottom: SPACING.md },
    title: { ...TYPE.heroTitle, color: colors.textPrimary, marginBottom: SPACING.xs },
    subtitle: { ...TYPE.headline, color: colors.textSecondary, marginBottom: SPACING.xxl },
    boxRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: SPACING.md, position: 'relative' },
    boxesLayer: { flexDirection: 'row', justifyContent: 'space-between', flex: 1 },
    box: {
      width: 45,
      height: 56,
      backgroundColor: colors.bgElevated,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: RADIUS.lg,
      justifyContent: 'center',
      alignItems: 'center',
    },
    boxText: { fontSize: 24, color: colors.textPrimary },
    boxFocused: { borderColor: colors.primaryGreen, borderWidth: 2 },
    // Covers the whole box row. Fully transparent but not display:none — it
    // has to stay a real, focusable/paste-able TextInput for both the paste
    // menu and the OS's SMS-code autofill suggestion to have something to
    // target; the boxes above are purely visual.
    hiddenInput: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, opacity: 0 },
    error: { ...TYPE.body, color: colors.danger, marginBottom: SPACING.xs },
    timerRow: { alignItems: 'center', marginBottom: SPACING.md },
    timerText: { ...TYPE.subhead, color: colors.textSecondary },
    timerDigits: { ...TYPE.subheadStrong, color: colors.textPrimary },
    resendLink: { ...TYPE.subheadStrong, color: colors.primaryGreen },
    spacer: { marginTop: 'auto' },
  });
