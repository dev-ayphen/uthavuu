import { useMemo } from 'react';
import { Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Check, X } from 'lucide-react-native';
import type { ColorScheme } from '../theme/colors';
import { useTheme } from '../theme/ThemeProvider';
import { ICON_SIZE, RADIUS, SPACING, TYPE } from '../theme/tokens';
import { PROFESSIONS, type ProfessionId } from '../data/professions';

type Props = {
  visible: boolean;
  selectedId: ProfessionId | null;
  onSelect: (id: ProfessionId) => void;
  onClose: () => void;
};

// The bottom-sheet profession picker from Profile Setup — its own file since
// it's a self-contained list+modal, not something ProfileSetupScreen's own
// layout logic needs to know the internals of.
export default function ProfessionPicker({ visible, selectedId, onSelect, onClose }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={styles.scrim} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity activeOpacity={1} style={styles.sheet}>
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>Profession</Text>
            <TouchableOpacity
              style={styles.closeButton}
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Close"
            >
              <X size={ICON_SIZE.sm} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>
          <ScrollView>
            {PROFESSIONS.map((option) => {
              const selected = option.id === selectedId;
              return (
                <TouchableOpacity
                  key={option.id}
                  style={styles.row}
                  onPress={() => onSelect(option.id)}
                  accessibilityRole="button"
                >
                  <Text style={styles.rowEmoji}>{option.emoji}</Text>
                  <Text style={[styles.rowLabel, selected && styles.rowLabelSelected]}>
                    {option.label}
                  </Text>
                  {selected && (
                    <View style={styles.checkCircle}>
                      <Check size={12} color={colors.textOnTint} strokeWidth={3} />
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

const createStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    scrim: { flex: 1, backgroundColor: 'rgba(15,23,42,0.65)', justifyContent: 'flex-end' },
    sheet: {
      backgroundColor: colors.bg,
      borderTopLeftRadius: RADIUS.pill,
      borderTopRightRadius: RADIUS.pill,
      maxHeight: '70%',
      paddingBottom: SPACING.lg,
    },
    sheetHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: SPACING.lg,
    },
    sheetTitle: { ...TYPE.screenTitle, color: colors.textPrimary },
    closeButton: {
      width: 28,
      height: 28,
      borderRadius: 14,
      backgroundColor: colors.bgElevated,
      justifyContent: 'center',
      alignItems: 'center',
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.sm,
      paddingHorizontal: SPACING.lg,
      paddingVertical: SPACING.sm + 1,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    rowEmoji: { fontSize: ICON_SIZE.md },
    rowLabel: { ...TYPE.subhead, color: colors.textPrimary, flex: 1 },
    rowLabelSelected: { color: colors.primaryGreen, fontWeight: '700' },
    checkCircle: {
      width: 18,
      height: 18,
      borderRadius: 9,
      backgroundColor: colors.primaryGreen,
      justifyContent: 'center',
      alignItems: 'center',
    },
  });
