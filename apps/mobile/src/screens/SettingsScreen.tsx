import { StyleSheet, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';
import { useTheme } from '@uthavu/libs-mobile/theme/ThemeProvider';

type Props = NativeStackScreenProps<RootStackParamList, 'Settings'>;

// Placeholder — filled in by the Settings flow build (dark mode toggle,
// notification permission shortcut, About/version). Registered on the root
// stack now so the fork implementing it only touches this file.
export default function SettingsScreen(_props: Props) {
  const { colors } = useTheme();
  return <View style={[styles.root, { backgroundColor: colors.bg }]} />;
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
