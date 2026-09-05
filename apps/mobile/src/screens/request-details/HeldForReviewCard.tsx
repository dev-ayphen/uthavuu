/**
 * The reporter's side of a held report: why nobody can see it, and the way out.
 *
 * WHY THIS EXISTS. A moderator's "Request New Photo" sends the reporter an
 * alert — "Your request needs a different photo before it can be published.
 * Please add another one." — and until now the app had no way to add another
 * one. `PATCH /reports/:id` and `POST /reports/:id/photos` both go through the
 * server's `requireOwnedOpenReport()`, which refuses anything that is not
 * `open`, so a held report could not be touched. Worse, the refused upload
 * stays `rejected`, `standingFor()` counts that as refused, and
 * `publishIfReady()` is then blocked permanently: the report was a dead end for
 * the reporter AND for the moderator, with no error raised anywhere.
 *
 * WHAT IT DOES NOT CLAIM. `GET /reports/:id` returns nothing that distinguishes
 * "a moderator asked you for a new photo" from "a moderator has not looked
 * yet" — both are `pending_review`, and the replacement alert is stored without
 * a `reportId`, so it cannot be tied back to this report either. So the copy
 * here states the one thing that is true in both cases (the request is not
 * visible while a photo is being checked) and offers the replacement as
 * something the reporter MAY do, rather than asserting they were asked. The
 * server agrees with that framing: `PUT /reports/:id/photos` is legal for the
 * whole of `pending_review`, not only after a request-new.
 *
 * THE REPLACEMENT IS NOT A SOFTER PATH IN. It goes through
 * `POST /uploads/report-photo` exactly like a first capture — same camera-only
 * rule, same inspection, same verdict states — and the superseded upload is
 * never re-sent: `resolveUploads` refuses anything a moderator has already
 * decided, so recycling the refused id comes back PHOTO_NOT_VERIFIED rather
 * than being quietly held a second time.
 */

import { useMemo, useRef, useState } from 'react';
import { Alert, Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { AlertTriangle, Camera, Clock, X } from 'lucide-react-native';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { ColorScheme } from '@uthavu/libs-mobile/theme/colors';
import { useTheme } from '@uthavu/libs-mobile/theme/ThemeProvider';
import { RADIUS, SPACING, TONES, TYPE } from '@uthavu/libs-mobile/theme/tokens';
import { replaceHeldPhotos, type Report } from '@uthavu/libs-mobile/api/reports';
import { UPLOAD_RATE_LIMITED, uploadReportPhoto } from '@uthavu/libs-mobile/api/reportPhotos';
import { ApiError } from '@uthavu/libs-mobile/lib/api';
import Button from '@uthavu/libs-mobile/components/Button';
import Spinner from '@uthavu/libs-mobile/components/Spinner';
import { useConfig } from '../../hooks/useConfig';
import type { PhotoDraft } from '../report/reportDraft';
import PhotoVerdictRow from '../report/PhotoVerdictRow';
import { replacePhotoErrorCopyKey } from '../report/photoVerdictCopy';

export default function HeldForReviewCard({ report }: { report: Report }) {
  const { colors } = useTheme();
  const { t } = useTranslation('report');
  const styles = useMemo(() => createStyles(colors), [colors]);
  const config = useConfig();
  const queryClient = useQueryClient();

  const [photos, setPhotos] = useState<PhotoDraft[]>([]);
  const [error, setError] = useState('');

  // Same two refs, for the same two reasons, as the create flow: a state flag
  // reads stale inside a second tap's handler in the same frame, so a double-tap
  // opens two cameras; and a capture's identity cannot be its local URI, which
  // is not guaranteed unique across captures.
  const capturingRef = useRef(false);
  const photoKeySeq = useRef(0);

  const updatePhoto = (key: string, patch: Partial<PhotoDraft>) => {
    setPhotos((list) => list.map((p) => (p.key === key ? { ...p, ...patch } : p)));
  };

  const uploadErrorMessage = (e: unknown): string => {
    if (e instanceof ApiError) {
      if (e.code === UPLOAD_RATE_LIMITED) {
        return e.retryAfterSeconds
          ? t('photoVerification.rateLimitedIn', { seconds: e.retryAfterSeconds })
          : t('photoVerification.rateLimited');
      }
      if (e.code === 'NETWORK_UNREACHABLE') return t('photoVerification.offline');
    }
    // Never `e.message` — the API speaks English only and this app does not.
    return t('photoVerification.uploadFailed');
  };

  const verifyPhoto = async (key: string, localUri: string) => {
    try {
      // Judged against the report's OWN category, not a picker's current value.
      // The category is immutable after creation, and the server re-checks
      // relevance against it on attach — sending anything else here would just
      // produce a hold the reporter could not understand or act on.
      const result = await uploadReportPhoto(localUri, report.category.key);

      // A pass/review with no id is a contract violation. Treated as a failed
      // upload (which is retakeable) rather than as attachable — otherwise the
      // reporter sees a verified photo and sends a request the server refuses.
      if (result.verdict !== 'reject' && !result.uploadId) {
        updatePhoto(key, {
          uploadId: null,
          state: 'failed',
          reason: null,
          error: t('photoVerification.uploadFailed'),
        });
        return;
      }

      updatePhoto(key, {
        uploadId: result.verdict === 'reject' ? null : result.uploadId,
        state: result.verdict,
        reason: result.reason,
        error: '',
      });
    } catch (e) {
      updatePhoto(key, { uploadId: null, state: 'failed', reason: null, error: uploadErrorMessage(e) });
    }
  };

  /**
   * Camera-only capture, then verification. `replaceIndex` retakes in place so a
   * refused capture doesn't linger beside its replacement.
   *
   * Camera-only is a business rule of the whole feature, not a shortcut: a live
   * photo is what makes a request trustworthy, and offering a library picker
   * here — on the one screen where somebody has already been told their picture
   * was not good enough — is precisely where that rule would be worth breaking
   * and precisely why it must not be.
   */
  const capturePhoto = async (replaceIndex?: number) => {
    if (capturingRef.current) return;
    if (replaceIndex === undefined && photos.length >= config.maxPhotosPerReport) return;

    capturingRef.current = true;
    let localUri: string;
    try {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (perm.status !== 'granted') {
        Alert.alert(t('flow.cameraNeededTitle'), t('flow.cameraNeededMessage'));
        return;
      }
      const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.7 });
      if (result.canceled || !result.assets?.[0]) return;
      localUri = result.assets[0].uri;
    } finally {
      capturingRef.current = false;
    }

    const key = `replacement-${++photoKeySeq.current}`;
    const pending: PhotoDraft = {
      key,
      localUri,
      uploadId: null,
      state: 'verifying',
      reason: null,
      error: '',
    };
    setPhotos((list) => {
      const next = [...list];
      if (replaceIndex === undefined) next.push(pending);
      else next.splice(replaceIndex, 1, pending);
      return next;
    });
    setError('');

    void verifyPhoto(key, localUri);
  };

  // Every photo has an id the server will accept. `review` counts — it is
  // attachable, it just keeps the report held, which is the state it is already
  // in. 'verifying', 'reject' and 'failed' all block, and the rows below say
  // which and why.
  const ready =
    photos.length > 0 && photos.every((p) => (p.state === 'pass' || p.state === 'review') && p.uploadId);

  const replaceMutation = useMutation({
    mutationFn: () =>
      replaceHeldPhotos(
        report.id,
        // `ready` has already established every id is present; the filter
        // narrows the type rather than silently dropping a photo on screen.
        photos.map((p) => p.uploadId).filter((id): id is string => Boolean(id))
      ),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ['report', report.id] });
      queryClient.invalidateQueries({ queryKey: ['myReports'] });
      setPhotos([]);
      // Read off the SERVER's answer, never guessed from the local verdicts.
      // Every replacement passing releases the report; anything still needing
      // review leaves it held for another moderator pass, and telling somebody
      // their request is live when it is not is the exact failure this whole
      // screen exists to stop.
      const live = updated.status === 'open';
      Alert.alert(
        live ? t('heldReport.sentLiveTitle') : t('heldReport.sentHeldTitle'),
        live ? t('heldReport.sentLiveMessage') : t('heldReport.sentHeldMessage')
      );
    },
    onError: (e) => {
      const code = e instanceof ApiError ? e.code : undefined;
      const copyKey = replacePhotoErrorCopyKey(code);
      setError(copyKey ? t(copyKey) : t('heldReport.sendFailed'));
    },
  });

  const canAddMore = photos.length < config.maxPhotosPerReport;

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <View style={styles.iconBadge}>
          <Clock size={16} color={TONES.soon.fg} />
        </View>
        <View style={styles.headerText}>
          <Text style={styles.title}>{t('heldReport.title')}</Text>
          <Text style={styles.body}>{t('heldReport.body')}</Text>
        </View>
      </View>

      <View style={styles.divider} />

      <Text style={styles.promptTitle}>{t('heldReport.replacePrompt')}</Text>
      <Text style={styles.promptBody}>{t('heldReport.replaceHelp')}</Text>

      {photos.length > 0 && (
        <>
          <View style={styles.thumbRow}>
            {photos.map((photo, i) => (
              <View key={photo.key} style={styles.thumb}>
                {/* The on-device capture. A photo that has not published has no
                    public URL by design, so there is no server copy to show. */}
                <Image source={{ uri: photo.localUri }} style={styles.thumbImg} />
                {photo.state === 'verifying' && (
                  <View style={styles.thumbOverlay}>
                    <Spinner variant="onTint" size="small" />
                  </View>
                )}
                {(photo.state === 'reject' || photo.state === 'failed') && (
                  // Dimmed, not hidden — the reporter has to be able to tell
                  // which photo the message underneath is about.
                  <View style={styles.thumbOverlayRefused} />
                )}
                <TouchableOpacity
                  style={styles.thumbRemove}
                  onPress={() => setPhotos((list) => list.filter((_, idx) => idx !== i))}
                  accessibilityLabel={t('photo.removePhoto')}
                >
                  <X size={10} color="#FFFFFF" strokeWidth={3} />
                </TouchableOpacity>
              </View>
            ))}
          </View>

          <View style={styles.verdictList}>
            {photos.map((photo, i) => (
              <PhotoVerdictRow
                key={photo.key}
                photo={photo}
                slotLabel={t('details.photoSlot', { n: i + 1 })}
                onRetake={() => capturePhoto(i)}
              />
            ))}
          </View>
        </>
      )}

      {canAddMore && (
        <TouchableOpacity style={styles.captureBtn} onPress={() => capturePhoto()} activeOpacity={0.8}>
          <Camera size={16} color={colors.primaryGreen} />
          <Text style={styles.captureBtnText}>
            {photos.length === 0 ? t('heldReport.takePhoto') : t('heldReport.addAnother')}
          </Text>
        </TouchableOpacity>
      )}

      {error ? (
        <View style={styles.errorRow}>
          <AlertTriangle size={14} color={colors.danger} />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}

      {photos.length > 0 && (
        <>
          {/* Said before the button, not after it lands. A replacement that is
              itself held does not publish the request, and "Send" on its own
              implies it will. */}
          {photos.some((p) => p.state === 'review') && (
            <Text style={styles.holdNote}>{t('heldReport.stillHeldNote')}</Text>
          )}
          <Button
            label={t('heldReport.send', { count: photos.length })}
            onPress={() => {
              setError('');
              replaceMutation.mutate();
            }}
            loading={replaceMutation.isPending}
            disabled={!ready}
            style={styles.sendBtn}
          />
          <Text style={styles.replaceWarning}>{t('heldReport.replacesAll')}</Text>
        </>
      )}
    </View>
  );
}

const createStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    card: {
      marginTop: SPACING.sm,
      padding: SPACING.md,
      borderRadius: RADIUS.lg,
      borderWidth: 1,
      // The app's "waiting on something" tone, not its error tone. Nothing is
      // wrong with this report; it is a report in a queue.
      borderColor: TONES.soon.border,
      backgroundColor: TONES.soon.fill,
    },
    headerRow: { flexDirection: 'row', gap: SPACING.sm, alignItems: 'flex-start' },
    iconBadge: {
      width: 32,
      height: 32,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.bgElevated,
    },
    headerText: { flex: 1, gap: 2 },
    title: { ...TYPE.bodyStrong, color: TONES.soon.fg },
    body: { ...TYPE.caption, color: TONES.soon.fg, lineHeight: 16 },

    divider: {
      height: 1,
      backgroundColor: TONES.soon.border,
      marginVertical: SPACING.sm,
    },

    promptTitle: { ...TYPE.captionStrong, color: colors.textPrimary },
    promptBody: { ...TYPE.caption, color: colors.textSecondary, lineHeight: 16, marginTop: 2 },

    thumbRow: { flexDirection: 'row', gap: SPACING.xs, marginTop: SPACING.sm, flexWrap: 'wrap' },
    thumb: {
      width: 64,
      height: 64,
      borderRadius: RADIUS.md,
      overflow: 'hidden',
      position: 'relative',
      backgroundColor: colors.bgElevated,
    },
    thumbImg: { width: '100%', height: '100%' },
    thumbOverlay: {
      ...StyleSheet.absoluteFill,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(0,0,0,0.5)',
    },
    // Lighter than the verifying scrim, and the same red as the create flow's:
    // its job is to say "this one", so the picture has to stay recognisable.
    thumbOverlayRefused: {
      ...StyleSheet.absoluteFill,
      backgroundColor: 'rgba(185,28,28,0.28)',
    },
    thumbRemove: {
      position: 'absolute',
      top: 2,
      right: 2,
      width: 16,
      height: 16,
      borderRadius: 8,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(15,23,42,0.75)',
    },

    verdictList: { marginTop: SPACING.xs, gap: SPACING.xs },

    captureBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      marginTop: SPACING.sm,
      paddingVertical: SPACING.xs + 2,
      borderRadius: RADIUS.pill,
      borderWidth: 1,
      borderStyle: 'dashed',
      borderColor: colors.primaryGreen,
      backgroundColor: colors.primaryGreenLight,
    },
    captureBtnText: { ...TYPE.footnote, color: colors.primaryGreen, fontWeight: '700' },

    errorRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginTop: SPACING.sm },
    errorText: { ...TYPE.caption, color: colors.danger, flex: 1, lineHeight: 16 },

    holdNote: { ...TYPE.caption, color: TONES.soon.fg, marginTop: SPACING.sm, lineHeight: 16 },
    sendBtn: { marginTop: SPACING.sm },
    replaceWarning: {
      ...TYPE.caption,
      color: colors.textSecondary,
      marginTop: SPACING.xs,
      lineHeight: 16,
      textAlign: 'center',
    },
  });
