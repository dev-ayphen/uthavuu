import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@uthavu/libs-mobile/theme/ThemeProvider';
import { RADIUS, SPACING, TYPE } from '@uthavu/libs-mobile/theme/tokens';
import type { TicketStatus } from '@uthavu/libs-mobile/api/tickets';
import { statusLabel, statusTone } from './ticket-display';

type Props = {
  status: TicketStatus;
  /** The thread header shows the status larger than a list row does. */
  size?: 'sm' | 'md';
};

// One pill for every place a ticket's status appears, so the list, the thread
// header, and any future surface can never drift apart on what "Resolved" or
// "Needs your reply" looks like.
export default function TicketStatusPill({ status, size = 'sm' }: Props) {
  const { colors } = useTheme();
  const { t } = useTranslation('tickets');
  const tone = useMemo(() => statusTone(status.key, colors), [status.key, colors]);
  const label = statusLabel(status, t);

  if (!label) return null;

  return (
    <View
      style={[
        styles.pill,
        size === 'md' && styles.pillMd,
        { backgroundColor: tone.fill, borderColor: tone.border },
      ]}
    >
      <Text style={[size === 'md' ? styles.labelMd : styles.label, { color: tone.fg }]}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: RADIUS.pill,
    paddingHorizontal: SPACING.xs,
    paddingVertical: 2,
  },
  pillMd: { paddingHorizontal: SPACING.sm, paddingVertical: SPACING.xxs },
  label: { ...TYPE.microLabel },
  labelMd: { ...TYPE.footnote },
});
