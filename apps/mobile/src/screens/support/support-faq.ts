// The Common Questions list. Copy lives in the i18n catalogs (tickets.faq.*),
// not here — this file only fixes the order and the icon each entry gets.
//
// These five carry over verbatim from the previous Help & Support screen, which
// had them hardcoded in English. They describe how the app actually behaves
// (the 15-minute confirmation window, the FAB, the comment-flag menu), so they
// are the app's own help copy rather than invented support content.
import { AlertCircle, Clock, HelpCircle, LifeBuoy, ShieldAlert, User } from 'lucide-react-native';

export type FaqId =
  | 'createRequest'
  | 'acceptMission'
  | 'missionExpired'
  | 'editProfile'
  | 'reportContent';

export const FAQ_IDS: readonly FaqId[] = [
  'createRequest',
  'acceptMission',
  'missionExpired',
  'editProfile',
  'reportContent',
];

export const FAQ_ICONS: Record<FaqId, typeof HelpCircle> = {
  createRequest: AlertCircle,
  acceptMission: LifeBuoy,
  missionExpired: Clock,
  editProfile: User,
  reportContent: ShieldAlert,
};
