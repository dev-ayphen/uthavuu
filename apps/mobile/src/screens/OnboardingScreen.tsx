import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BackHandler,
  Dimensions,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type NativeSyntheticEvent,
  type NativeScrollEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';
import { SIZES, SPACING, TYPE } from '../theme/tokens';
import type { ColorScheme } from '../theme/colors';
import { useTheme } from '../theme/ThemeProvider';
import { markOnboardingSeen } from '../lib/session';
import Button from '../components/Button';

type Props = NativeStackScreenProps<RootStackParamList, 'Onboarding'>;

// onboarding_2.png and onboarding_3.png have a heading/subtext (and, on slide 3, a
// duplicate "GET STARTED" button) baked into the artwork itself — confirmed by
// visual inspection, matching exactly what docs/mobile/02-onboarding-screen.md
// gap #1 warned about. `hasBakedInText` suppresses our own title/description for
// those two slides so we don't stack two headings; the dots and buttons stay ours
// (real/functional) regardless, since the baked-in ones are inert artwork.
const SLIDES = [
  {
    image: require('../../assets/onboarding_1.png'),
    title: 'See Something That Needs Help?',
    description:
      'If you see an injured animal, someone in need, excess food, or a roadside emergency, report it in less than 30 seconds.',
    hasBakedInText: false,
  },
  {
    image: require('../../assets/onboarding_2.png'),
    title: 'Nearby Volunteers Respond',
    description:
      'Your report is shared only with nearby people who are willing to help, making responses fast and relevant.',
    hasBakedInText: true,
  },
  {
    image: require('../../assets/onboarding_3.png'),
    title: 'Every Small Act Matters',
    description:
      'Together we can build safer streets, reduce waste, rescue animals, and support one another through everyday acts of kindness.',
    hasBakedInText: true,
  },
] as const;

const { width } = Dimensions.get('window');

export default function OnboardingScreen({ navigation }: Props) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors, insets), [colors, insets]);
  const [currentSlide, setCurrentSlide] = useState(0);
  const scrollRef = useRef<ScrollView>(null);

  const finish = useCallback(async () => {
    await markOnboardingSeen();
    navigation.replace('Login');
  }, [navigation]);

  const goToSlide = useCallback((index: number) => {
    scrollRef.current?.scrollTo({ x: index * width, animated: true });
    setCurrentSlide(index);
  }, []);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (currentSlide > 0) {
        goToSlide(currentSlide - 1);
        return true;
      }
      return false; // let the OS handle it (exits the app) on the first slide
    });
    return () => sub.remove();
  }, [currentSlide, goToSlide]);

  const onMomentumScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const index = Math.round(e.nativeEvent.contentOffset.x / width);
    setCurrentSlide(index);
  };

  const isLast = currentSlide === SLIDES.length - 1;

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={styles.skipCorner}
        onPress={finish}
        accessibilityRole="button"
        accessibilityLabel="Skip onboarding"
      >
        <Text style={styles.skipCornerText}>Skip</Text>
      </TouchableOpacity>

      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onMomentumScrollEnd}
        style={styles.scroll}
      >
        {SLIDES.map(({ image, title, description, hasBakedInText }, index) => (
          <View key={index} style={[styles.slide, { width }]}>
            <View style={styles.topSection}>
              <Image source={image} style={styles.heroImage} resizeMode="cover" />
            </View>
            <View style={styles.bottomSection}>
              {!hasBakedInText && (
                <>
                  <Text style={styles.title}>{title}</Text>
                  <Text style={styles.description}>{description}</Text>
                </>
              )}

              <View style={styles.dots}>
                {SLIDES.map((_, dotIndex) => (
                  <View
                    key={dotIndex}
                    style={[styles.dot, dotIndex === currentSlide && styles.activeDot]}
                  />
                ))}
              </View>

              <View style={styles.buttons}>
                <Button
                  label={isLast ? 'Get Started' : 'Next'}
                  onPress={() => (isLast ? finish() : goToSlide(currentSlide + 1))}
                />
                {currentSlide > 0 && (
                  <Button label="Back" variant="ghost" onPress={() => goToSlide(currentSlide - 1)} />
                )}
              </View>
            </View>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const createStyles = (colors: ColorScheme, insets: { top: number; bottom: number }) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.bg },
    scroll: { flex: 1 },
    skipCorner: { position: 'absolute', top: insets.top + 12, right: 20, zIndex: 1, padding: 8 },
    skipCornerText: { ...TYPE.subheadStrong, color: colors.textSecondary },
    slide: { flex: 1 },
    topSection: {
      flex: 1.2,
      backgroundColor: colors.bgElevated,
      borderBottomLeftRadius: 36,
      borderBottomRightRadius: 36,
      overflow: 'hidden',
    },
    heroImage: { width: '100%', height: '100%' },
    bottomSection: {
      flex: 1,
      padding: SIZES.padding,
      paddingBottom: insets.bottom + SIZES.padding,
      alignItems: 'center',
    },
    title: {
      ...TYPE.pageTitle,
      color: colors.textPrimary,
      textAlign: 'center',
      marginTop: 10,
      marginBottom: 10,
    },
    description: {
      ...TYPE.subhead,
      color: colors.textSecondary,
      textAlign: 'center',
      lineHeight: 20,
    },
    dots: { flexDirection: 'row', gap: 8, marginTop: 20 },
    dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.border },
    activeDot: { width: 24, backgroundColor: colors.primaryGreen },
    buttons: { marginTop: 'auto', width: '100%', gap: SPACING.xs, paddingTop: SPACING.xl },
  });
