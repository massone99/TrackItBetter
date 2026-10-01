import * as ImagePicker from 'expo-image-picker';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { VideoView, useVideoPlayer } from 'expo-video';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Alert, Pressable, StyleSheet, View, Platform } from 'react-native';
import { Text } from '../../src/shared/components/Text';
import { addFormCheckVideo, deleteFormCheckVideo, getFormCheckSetContext, listFormCheckVideos } from '../../src/features/media/formVideos';
import type { FormCheckSetContext, FormCheckVideo } from '../../src/features/media/formVideos';
import { ActionButton, Body, Card, Heading, PageHeading, Screen, Icon, Sheet } from '../../src/shared/components/ui';
import { useTheme } from '../../src/shared/theme/ThemeProvider';
import { useScaledStyles } from '../../src/shared/theme/useScaledStyles';
import { goBack } from '../../src/shared/navigation/goBack';

const MAX_VIDEO_BYTES = 100 * 1024 * 1024;

export default function FormCheckScreen() {
  const styles = useScaledStyles(baseStyles);
  const { setId } = useLocalSearchParams<{ setId: string }>();
  const { t, i18n } = useTranslation();
  const { palette } = useTheme();
  const [context, setContext] = useState<FormCheckSetContext | null>(null);
  const [videos, setVideos] = useState<FormCheckVideo[]>([]);
  const [compareId, setCompareId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState<FormCheckVideo | null>(null);

  const refresh = useCallback(async () => {
    const next = await getFormCheckSetContext(setId);
    setContext(next);
    setVideos(next ? await listFormCheckVideos(next.exerciseId) : []);
    setLoading(false);
  }, [setId]);
  useFocusEffect(useCallback(() => { void refresh(); }, [refresh]));

  const attachVideo = async (source: 'camera' | 'library') => {
    try {
      setBusy(true);
      const permission = source === 'camera'
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert(t('formCheck.permissionTitle'), t('formCheck.permissionBody'));
        return;
      }
      const result = source === 'camera'
        ? await ImagePicker.launchCameraAsync({ mediaTypes: ['videos'], videoMaxDuration: 60, videoQuality: ImagePicker.UIImagePickerControllerQualityType.IFrame1280x720 })
        : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['videos'], videoMaxDuration: 60, videoQuality: ImagePicker.UIImagePickerControllerQualityType.IFrame1280x720 });
      if (result.canceled) return;
      const asset = result.assets[0];
      if (!asset) return;
      if (asset.fileSize != null && asset.fileSize > MAX_VIDEO_BYTES) {
        Alert.alert(t('formCheck.videoErrorTitle'), t('formCheck.tooLarge'));
        return;
      }
      await addFormCheckVideo({ setId, sourceUri: asset.uri, durationMs: asset.duration ?? 0, fileSize: asset.fileSize });
      setCompareId(null);
      await refresh();
    } catch (error) {
      const message = error instanceof RangeError ? t('formCheck.clipLimit') : t('formCheck.saveError');
      Alert.alert(t('formCheck.videoErrorTitle'), message);
    } finally {
      setBusy(false);
    }
  };

  const confirmDelete = (video: FormCheckVideo) => setDeleting(video);
  const deleteConfirmed = () => {
    const video = deleting;
    setDeleting(null);
    if (!video) return;
    void deleteFormCheckVideo(video.id).then(() => {
      if (compareId === video.id) setCompareId(null);
      return refresh();
    });
  };

  if (loading) return <Screen><ActivityIndicator color={palette.accentStrong} /></Screen>;
  if (!context) return <Screen><PageHeading title={t('formCheck.title')} subtitle={t('formCheck.missingSet')} /><ActionButton label={t('formCheck.back')} secondary onPress={() => goBack()} /></Screen>;

  const current = videos.find((video) => video.setId === setId) ?? videos[0] ?? null;
  const comparison = compareId ? videos.find((video) => video.id === compareId) ?? null : null;
  const locale = i18n.language === 'it' ? 'it-IT' : 'en-US';
  const dateLabel = (video: FormCheckVideo) => video.recordedAt.toLocaleDateString(locale, { year: 'numeric', month: 'short', day: 'numeric' });

  return (
    <Screen>
      <PageHeading title={t('formCheck.title')} subtitle={`${context.exerciseName} · ${context.workoutName} · ${t('formCheck.set', { number: context.setIndex })}`} />
      <Body>{t('formCheck.privateNote')}</Body>
      <Card style={styles.actions}>
        <ActionButton label={busy ? t('formCheck.saving') : t('formCheck.record')} onPress={() => void attachVideo('camera')} />
        <ActionButton label={t('formCheck.choose')} secondary onPress={() => void attachVideo('library')} />
      </Card>
      {videos.length === 0 ? <Body>{t('formCheck.empty')}</Body> : (
        <>
          <Heading>{comparison ? t('formCheck.comparing') : t('formCheck.review')}</Heading>
          {comparison ? (
            <View style={styles.compareRow}>
              <VideoPanel video={current ?? comparison} compact />
              <VideoPanel video={comparison} compact />
            </View>
          ) : current ? <VideoPanel video={current} compact={false} /> : null}
          {comparison ? <ActionButton label={t('formCheck.stopCompare')} secondary onPress={() => setCompareId(null)} /> : null}
          <Heading>{t('formCheck.clips')}</Heading>
          {videos.map((video) => {
            const isCurrent = video.id === current?.id;
            const isCompared = video.id === compareId;
            return (
              <Card key={video.id} style={[styles.clipCard, isCompared ? { borderColor: palette.accentStrong, borderWidth: 1 } : null]}>
                <View style={styles.clipDetails}>
                  <Text style={[styles.clipDate, { color: palette.text }]}>{dateLabel(video)}</Text>
                  <Body>{t('formCheck.clipSub', { workout: video.workoutName, set: video.setIndex })}</Body>
                </View>
                <Pressable accessibilityRole="button" onPress={() => setCompareId(isCurrent || isCompared ? null : video.id)} style={[styles.compareButton, { backgroundColor: palette.surfaceMuted }]}>
                  <Text style={{ color: palette.accentStrong, fontWeight: '700' }}>{isCompared ? t('formCheck.selected') : isCurrent ? t('formCheck.play') : t('formCheck.compare')}</Text>
                </Pressable>
                {Platform.OS === 'web' ? null : (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t('formCheck.analysePose')}
                    onPress={() => router.push({ pathname: '/pose/new', params: { videoUri: video.uri, durationMs: String(video.durationMs) } })}
                    hitSlop={8}
                  >
                    <Icon name="scan-outline" size={19} color={palette.accentStrong} />
                  </Pressable>
                )}
                <Pressable accessibilityRole="button" accessibilityLabel={t('formCheck.delete')} onPress={() => confirmDelete(video)} hitSlop={8}>
                  <Icon name="trash-outline" size={18} color={palette.warning} />
                </Pressable>
              </Card>
            );
          })}
        </>
      )}
      <ActionButton label={t('formCheck.back')} secondary onPress={() => goBack()} />
      <Sheet visible={deleting !== null} onClose={() => setDeleting(null)} title={t('formCheck.deleteTitle')} body={t('formCheck.deleteBody')}>
        <ActionButton icon="trash-outline" label={t('formCheck.delete')} variant="danger" onPress={deleteConfirmed} />
        <ActionButton label={t('common.cancel')} secondary onPress={() => setDeleting(null)} />
      </Sheet>
    </Screen>
  );
}

function VideoPanel({ video, compact }: { video: FormCheckVideo; compact: boolean }) {
  const styles = useScaledStyles(baseStyles);
  const { t } = useTranslation();
  const { palette } = useTheme();
  const [slowMotion, setSlowMotion] = useState(false);
  const player = useVideoPlayer(video.uri, (instance) => { instance.loop = false; });
  const setSlow = () => {
    const next = !slowMotion;
    // expo-video exposes playback speed as a mutable player control.
    // eslint-disable-next-line react-hooks/immutability
    player.playbackRate = next ? 0.5 : 1;
    setSlowMotion(next);
  };
  return (
    <View style={[styles.videoPanel, compact ? styles.compactPanel : null]}>
      <VideoView player={player} nativeControls contentFit="contain" style={styles.video} />
      <Pressable accessibilityRole="button" onPress={setSlow} style={[styles.slowButton, { backgroundColor: palette.surfaceMuted }]}>
        <Text style={{ color: palette.accentStrong, fontWeight: '700' }}>{slowMotion ? t('formCheck.normalSpeed') : t('formCheck.slowMotion')}</Text>
      </Pressable>
    </View>
  );
}

const baseStyles = StyleSheet.create({
  actions: { gap: 4 },
  videoPanel: { flex: 1, gap: 8 },
  compactPanel: { minWidth: 140 },
  video: { width: '100%', aspectRatio: 1.35, backgroundColor: '#111', borderRadius: 14 },
  compareRow: { flexDirection: 'row', gap: 8 },
  slowButton: { minHeight: 48, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center', borderRadius: 11 },
  clipCard: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12 },
  clipDetails: { flex: 1, gap: 4 },
  clipDate: { fontSize: 14, fontWeight: '800' },
  compareButton: { minHeight: 48, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center', borderRadius: 11 },
});
