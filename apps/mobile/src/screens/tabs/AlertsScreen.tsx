import { Bell } from 'lucide-react-native';
import { ComingSoon } from '../../components/ComingSoon';

export default function AlertsScreen() {
  return (
    <ComingSoon
      icon={Bell}
      title="Alerts"
      subtitle="Push notifications for nearby requests, broadcasts, and mission updates — built alongside the alerts feature."
    />
  );
}
