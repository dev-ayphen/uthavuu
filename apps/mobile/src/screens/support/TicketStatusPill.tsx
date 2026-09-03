import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@uthavu/libs-mobile/theme/ThemeProvider';
import { StatusBadge } from '@uthavu/libs-mobile/components';
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
//
// The pill itself is the shared StatusBadge; what stays here is the binding
// this screen owns — which tone a ticket status earns and which catalog label
// it gets. StatusBadge already renders nothing for an empty label, so the
// "unresolved status shows no empty pill" guard survives the move.
export default function TicketStatusPill({ status, size = 'sm' }: Props) {
  const { colors } = useTheme();
  const { t } = useTranslation('tickets');
  const tone = useMemo(() => statusTone(status.key, colors), [status.key, colors]);

  return <StatusBadge label={statusLabel(status, t)} tone={tone} size={size} />;
}
