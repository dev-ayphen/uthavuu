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
import { useTranslation } from 'react-i18next';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';
import { RADIUS, SIZES, SPACING, TYPE } from '@uthavu/libs-mobile/theme/tokens';
import type { ColorScheme } from '@uthavu/libs-mobile/theme/colors';
import { useTheme } from '@uthavu/libs-mobile/theme/ThemeProvider';
import { markOnboardingSeen } from '@uthavu/libs-mobile/lib/session';
import Button from '@uthavu/libs-mobile/components/Button';

type Props = NativeStackScreenProps<RootStackParamList, 'Onboarding'>;

const { width } = Dimensions.get('window');

const SLIDES_DATA = [
  {
    // TODO(onboarding redesign): clean_onboarding_1.png doesn't exist in
    // apps/mobile/assets yet — this was crashing the app on first launch for
    // every new user (Metro can't resolve a require() to a missing file).
    // Pointing at the existing asset as a stopgap; swap back once the real
    // cropped/re-exported image is actually added.
    image: require('../../assets/onboarding_1.png'),
    title: 'Community Help Needed',
    description: 'Post help requests for animal rescues, food drives, roadside help, or elderly support near you.',
  },
  {
    image: require('../../assets/onboarding_2.png'),
    title: 'Help Is On The Way',
    description: 'Nearby volunteers get alerted instantly and arrive to support your cause.',
  },
  {
    image: require('../../assets/onboarding_3.png'),
    title: 'Building Community, Saving Lives',
    description: 'Join hands with local heroes and NGOs to create real, lasting impact in your city.',
  },
];

export default function OnboardingScreen({ navigation }: Props) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors, insets), [colors, insets]);
  const [currentSlide, setCurrentSlide] = useState(0);
  const scrollRef = useRef<ScrollView>(null);
  const { t } = useTranslation('auth');

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
      return false;
    });
    return () => sub.remove();
  }, [currentSlide, goToSlide]);

  const onMomentumScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const index = Math.round(e.nativeEvent.contentOffset.x / width);
    setCurrentSlide(index);
  };

  const isLast = currentSlide === SLIDES_DATA.length - 1;

  return (
    <View style={styles.container}>
      {/* Top Bar with clear Skip button */}
      <View style={[styles.topBar, { paddingTop: insets.top + SPACING.xs }]}>
        <View style={styles.flex1} />
        {!isLast && (
          <TouchableOpacity
            style={styles.skipBtn}
            onPress={finish}
            accessibilityRole="button"
            accessibilityLabel="Skip onboarding"
          >
            <Text style={styles.skipText}>{t('skip') || 'Skip'}</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Swipeable Slides */}
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onMomentumScrollEnd}
        style={styles.scroll}
      >
        {SLIDES_DATA.map((slide, index) => (
          <View key={index} style={[styles.slide, { width }]}>
            {/* Upper Section: Artwork */}
            <View style={styles.heroSection}>
              <Image source={slide.image} style={styles.heroImage} resizeMode="contain" />
            </View>

            {/* Lower Section: Title & Subtext */}
            <View style={styles.textSection}>
              <Text style={styles.title}>{slide.title}</Text>
              <Text style={styles.description}>{slide.description}</Text>
            </View>
          </View>
        ))}
      </ScrollView>

      {/* Bottom Sticky Controls */}
      <View style={[styles.bottomBar, { paddingBottom: Math.max(insets.bottom, SPACING.md) }]}>
        {/* Pagination Dots */}
        <View style={styles.dots}>
          {SLIDES_DATA.map((_, dotIndex) => (
            <View
              key={dotIndex}
              style={[styles.dot, dotIndex === currentSlide && styles.activeDot]}
            />
          ))}
        </View>

        {/* Buttons */}
        <View style={styles.buttonStack}>
          <Button
            label={isLast ? t('getStarted') || 'Get Started →' : t('next') || 'Next →'}
            onPress={() => (isLast ? finish() : goToSlide(currentSlide + 1))}
          />
        </View>
      </View>
    </View>
  );
}

const createStyles = (colors: ColorScheme, insets: { top: number; bottom: number }) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.bg },
    flex1: { flex: 1 },

    topBar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: SPACING.lg,
      zIndex: 10,
    },
    skipBtn: {
      paddingHorizontal: SPACING.md,
      paddingVertical: SPACING.xs,
      borderRadius: RADIUS.pill,
      backgroundColor: colors.bgElevated,
      borderWidth: 1,
      borderColor: colors.border,
    },
    skipText: { ...TYPE.footnote, color: colors.primaryGreen, fontWeight: '700' },

    scroll: { flex: 1 },
    slide: { flex: 1, justifyContent: 'space-between' },

    heroSection: {
      flex: 1.3,
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: SPACING.lg,
      paddingTop: SPACING.md,
    },
    heroImage: { width: '100%', height: '90%' },

    textSection: {
      paddingHorizontal: SPACING.xl,
      alignItems: 'center',
      marginBottom: SPACING.md,
    },
    title: {
      ...TYPE.pageTitle,
      fontSize: 22,
      color: colors.textPrimary,
      textAlign: 'center',
      fontWeight: '800',
      marginBottom: SPACING.xs,
    },
    description: {
      ...TYPE.subhead,
      color: colors.textSecondary,
      textAlign: 'center',
      lineHeight: 20,
    },

    bottomBar: {
      paddingHorizontal: SPACING.xl,
      alignItems: 'center',
      gap: SPACING.md,
    },
    dots: { flexDirection: 'row', gap: 8, alignItems: 'center' },
    dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.border },
    activeDot: { width: 24, borderRadius: 4, backgroundColor: colors.primaryGreen },

    buttonStack: { width: '100%' },
  });
