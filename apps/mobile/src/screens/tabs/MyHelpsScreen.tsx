import { Heart } from 'lucide-react-native';
import { ComingSoon } from '../../components/ComingSoon';

export default function MyHelpsScreen() {
  return (
    <ComingSoon
      icon={Heart}
      title="My Helps"
      subtitle="Your active and completed missions will show up here once the accept-a-request feature is built."
    />
  );
}
