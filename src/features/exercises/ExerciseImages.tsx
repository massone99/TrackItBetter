import * as ImagePicker from 'expo-image-picker';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Alert, Image, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { ActionButton, Body, Icon, IconButton, ListGroup, ListRow, SectionTitle, Sheet, Text } from '../../shared/components/ui';
import { isPickerUnavailableError } from '../../shared/media/pickerErrors';
import { useTheme } from '../../shared/theme/ThemeProvider';
import { fonts } from '../../shared/theme/typography';
import { useScaledStyles } from '../../shared/theme/useScaledStyles';
import { addExerciseImage, deleteExerciseImage, listExerciseImages, moveExerciseImage, type ExerciseImage } from './images';

const THUMB = 112;

/**
 * Pictures of how an exercise looks, on its page only: a row of previews, a tap opens one full size
 * (with the others a swipe or an arrow away), and they can be added, reordered and deleted.
 */
export function ExerciseImagesSection({ exerciseId }: { exerciseId: string }) {
  const styles = useScaledStyles(baseStyles);
  const { t } = useTranslation();
  const { palette } = useTheme();
  const { width } = useWindowDimensions();
  const [images, setImages] = useState<ExerciseImage[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<number | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const load = useCallback(async () => {
    try {
      setImages(await listExerciseImages(exerciseId));
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, [exerciseId]);
  useEffect(() => {
    let alive = true;
    listExerciseImages(exerciseId).then((next) => { if (alive) setImages(next); }, () => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, [exerciseId]);

  const add = async (source: 'camera' | 'library') => {
    setAdding(false);
    try {
      setBusy(true);
      const permission = source === 'camera' ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert(t('exerciseImages.permissionTitle'), t('exerciseImages.permissionBody'));
        return;
      }
      const result = source === 'camera'
        ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 1 })
        : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1, allowsMultipleSelection: true, selectionLimit: 0 });
      if (result.canceled) return;
      for (const asset of result.assets) {
        await addExerciseImage(exerciseId, { sourceUri: asset.uri, mimeType: asset.mimeType ?? 'image/jpeg', width: asset.width, height: asset.height });
      }
      await load();
    } catch (error) {
      if (isPickerUnavailableError(error)) Alert.alert(t('common.pickerRestartTitle'), t('common.pickerRestart'));
      else Alert.alert(t('exerciseImages.saveErrorTitle'), t('exerciseImages.saveErrorBody'));
    } finally {
      setBusy(false);
    }
  };

  const current = open !== null && images ? images[open] ?? null : null;
  const move = async (delta: -1 | 1) => {
    if (!current || open === null) return;
    await moveExerciseImage(current.id, delta);
    setOpen(open + delta);
    await load();
  };
  const remove = async () => {
    if (!current) return;
    setConfirmDelete(false);
    await deleteExerciseImage(current.id);
    const left = (images?.length ?? 1) - 1;
    setOpen(left === 0 ? null : Math.min(open ?? 0, left - 1));
    await load();
  };

  if (failed) {
    return (
      <ListGroup>
        <ListRow icon="alert-circle-outline" title={t('exerciseImages.loadError')} subtitle={t('common.tryAgain')} onPress={() => void load()} />
      </ListGroup>
    );
  }
  if (!images) return null;

  const viewerWidth = Math.min(width - 32, 640);
  return (
    <View style={styles.section}>
      {images.length === 0 ? (
        <ListGroup>
          <ListRow icon="images-outline" title={t('exerciseImages.add')} subtitle={t('exerciseImages.emptyHint')} onPress={() => setAdding(true)} />
        </ListGroup>
      ) : (
        <>
          <SectionTitle title={t('exerciseImages.title')} />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.strip}>
            {images.map((image, index) => (
              <Pressable
                key={image.id}
                accessibilityRole="imagebutton"
                accessibilityLabel={t('exerciseImages.open', { number: index + 1, total: images.length })}
                onPress={() => setOpen(index)}
                style={({ pressed }) => [styles.thumb, { borderColor: palette.border, backgroundColor: palette.mediaBackdrop, opacity: pressed ? 0.7 : 1 }]}
              >
                <Image source={{ uri: image.uri }} style={styles.thumbImage} resizeMode="cover" />
              </Pressable>
            ))}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('exerciseImages.add')}
              disabled={busy}
              onPress={() => setAdding(true)}
              style={({ pressed }) => [styles.thumb, styles.addThumb, { borderColor: palette.border, opacity: pressed || busy ? 0.6 : 1 }]}
            >
              {busy ? <ActivityIndicator color={palette.accentStrong} /> : <Icon name="add" size={28} color={palette.accentStrong} />}
            </Pressable>
          </ScrollView>
        </>
      )}

      <Sheet visible={adding} onClose={() => setAdding(false)} title={t('exerciseImages.add')} body={t('exerciseImages.addBody')}>
        <ActionButton icon="camera-outline" label={t('exerciseImages.camera')} onPress={() => void add('camera')} />
        <ActionButton icon="images-outline" label={t('exerciseImages.library')} secondary onPress={() => void add('library')} />
      </Sheet>

      <Sheet visible={current !== null} onClose={() => { setOpen(null); setConfirmDelete(false); }} title={t('exerciseImages.counter', { number: (open ?? 0) + 1, total: images.length })}>
        {current ? (
          <>
            <View style={[styles.viewer, { backgroundColor: palette.mediaBackdrop }]}>
              <Image
                source={{ uri: current.uri }}
                accessibilityLabel={t('exerciseImages.open', { number: (open ?? 0) + 1, total: images.length })}
                style={{ width: viewerWidth, height: Math.min(viewerWidth * (current.height / current.width), 520) }}
                resizeMode="contain"
              />
            </View>
            <View style={styles.viewerNav}>
              <IconButton icon="chevron-back" label={t('exerciseImages.previous')} disabled={open === 0} onPress={() => setOpen((open ?? 0) - 1)} />
              <Text style={[styles.counter, { color: palette.textMuted }]}>{`${(open ?? 0) + 1} / ${images.length}`}</Text>
              <IconButton icon="chevron-forward" label={t('exerciseImages.next')} disabled={open === images.length - 1} onPress={() => setOpen((open ?? 0) + 1)} />
            </View>
            <View style={styles.actions}>
              <View style={styles.action}><ActionButton icon="arrow-back" label={t('exerciseImages.moveEarlier')} secondary disabled={open === 0} onPress={() => void move(-1)} /></View>
              <View style={styles.action}><ActionButton icon="arrow-forward" label={t('exerciseImages.moveLater')} secondary disabled={open === images.length - 1} onPress={() => void move(1)} /></View>
            </View>
            {confirmDelete ? (
              <>
                <Body>{t('exerciseImages.deleteBody')}</Body>
                <ActionButton icon="trash-outline" variant="danger" label={t('exerciseImages.deleteConfirm')} onPress={() => void remove()} />
                <ActionButton label={t('common.cancel')} secondary onPress={() => setConfirmDelete(false)} />
              </>
            ) : (
              <ActionButton icon="trash-outline" variant="ghost" label={t('exerciseImages.delete')} onPress={() => setConfirmDelete(true)} />
            )}
          </>
        ) : null}
      </Sheet>
    </View>
  );
}

const baseStyles = StyleSheet.create({
  section: { gap: 8 },
  strip: { gap: 8, paddingRight: 8 },
  thumb: { width: THUMB, height: THUMB, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  thumbImage: { width: '100%', height: '100%' },
  addThumb: { borderStyle: 'dashed', borderWidth: 1 },
  viewer: { borderRadius: 16, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  viewerNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  counter: { fontFamily: fonts.semibold, fontSize: 14 },
  actions: { flexDirection: 'row', gap: 8 },
  action: { flex: 1 },
});
