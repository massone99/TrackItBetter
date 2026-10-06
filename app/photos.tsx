import { Paged } from '../src/shared/components/paging';
import * as ImagePicker from 'expo-image-picker';
import { isPickerUnavailableError } from '../src/shared/media/pickerErrors';
import { useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Image, Pressable, StyleSheet, View } from 'react-native';
import { Text } from '../src/shared/components/Text';
import { addProgressPhoto, deleteProgressPhoto, listProgressPhotos, type ProgressPhoto } from '../src/features/photos/repository';
import { ActionButton, Body, Card, Heading, PageHeading, Screen, Sheet, TextField } from '../src/shared/components/ui';
import { useTheme } from '../src/shared/theme/ThemeProvider';
import { useScaledStyles } from '../src/shared/theme/useScaledStyles';

function photoDateFromExif(value?: string): Date {
  if (!value) return new Date();
  const match = /^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(value);
  const date = match
    ? new Date(`${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${match[6]}`)
    : new Date(value);
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

export default function ProgressPhotosScreen() {
  const styles = useScaledStyles(baseStyles);
  const { t, i18n } = useTranslation();
  const { palette } = useTheme();
  const [photos, setPhotos] = useState<ProgressPhoto[]>([]);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState<ProgressPhoto | null>(null);
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const [comparePercent, setComparePercent] = useState(50);
  const [compareWidth, setCompareWidth] = useState(0);

  const comparePhotos = useMemo(() => photos.filter((photo) => compareIds.includes(photo.id)).sort((a, b) => a.takenAt.getTime() - b.takenAt.getTime()), [photos, compareIds]);
  const compareCopy = i18n.language.startsWith('it')
    ? { select: 'Confronta', selected: 'Selezionata', before: 'Prima', after: 'Dopo', title: 'Confronto foto', earlier: 'Foto precedente', later: 'Foto successiva', less: 'Mostra più la foto precedente', more: 'Mostra più la foto successiva', clear: 'Chiudi confronto', help: 'Seleziona due foto. Il dispositivo le mostra insieme e conserva gli originali.' }
    : { select: 'Compare', selected: 'Selected', before: 'Before', after: 'After', title: 'Photo comparison', earlier: 'Earlier photo', later: 'Later photo', less: 'Show more of earlier photo', more: 'Show more of later photo', clear: 'Close comparison', help: 'Select two photos to see them together. Originals stay unchanged on this device.' };

  const refresh = useCallback(async () => {
    const nextPhotos = await listProgressPhotos();
    setPhotos(nextPhotos);
    setCompareIds((ids) => ids.filter((id) => nextPhotos.some((photo) => photo.id === id)));
  }, []);
  useFocusEffect(useCallback(() => { void refresh(); }, [refresh]));

  const addPhoto = async (source: 'camera' | 'library') => {
    try {
      setBusy(true);
      const permission = source === 'camera'
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert(t('photos.permissionTitle'), t('photos.permissionBody'));
        return;
      }
      const result = source === 'camera'
        ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.82, exif: true })
        : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.82, exif: true });
      if (result.canceled) return;
      const asset = result.assets[0];
      if (!asset) return;
      await addProgressPhoto({
        sourceUri: asset.uri,
        mimeType: asset.mimeType ?? 'image/jpeg',
        width: asset.width,
        height: asset.height,
        note,
        takenAt: photoDateFromExif(asset.exif?.DateTimeOriginal),
      });
      setNote('');
      await refresh();
    } catch (error) {
      if (isPickerUnavailableError(error)) Alert.alert(t('common.pickerRestartTitle'), t('common.pickerRestart'));
      else Alert.alert(t('photos.saveErrorTitle'), t('photos.saveErrorBody'));
    } finally {
      setBusy(false);
    }
  };

  const confirmDelete = (photo: ProgressPhoto) => setDeleting(photo);

  return (
    <Screen>
      <PageHeading title={t('photos.title')} subtitle={t('photos.subtitle')} />
      <Card>
        <Heading>{t('photos.addTitle')}</Heading>
        <TextField
          label={t('photos.noteLabel')}
          value={note}
          onChangeText={setNote}
          placeholder={t('photos.notePlaceholder')}
        />
        <ActionButton label={busy ? t('photos.saving') : t('photos.take')} onPress={() => void addPhoto('camera')} />
        <ActionButton label={t('photos.choose')} secondary onPress={() => void addPhoto('library')} />
      </Card>
      <Heading>{t('photos.timeline')}</Heading>
      {photos.length >= 2 ? <Body>{compareCopy.help}</Body> : null}
      {comparePhotos.length === 2 ? (
        <Card>
          <View style={styles.compareHeader}>
            <Heading>{compareCopy.title}</Heading>
            <Pressable accessibilityRole="button" onPress={() => { setCompareIds([]); setComparePercent(50); }}><Text style={{ color: palette.accentStrong, fontWeight: '800' }}>{compareCopy.clear}</Text></Pressable>
          </View>
          <View onLayout={(event) => setCompareWidth(event.nativeEvent.layout.width)} style={styles.comparison}>
            <Image source={{ uri: comparePhotos[0].uri }} accessibilityLabel={compareCopy.earlier} style={[styles.comparisonImage, { width: compareWidth || '100%' }]} resizeMode="cover" />
            {compareWidth > 0 ? <View style={[styles.comparisonMask, { width: compareWidth * comparePercent / 100 }]}>
              <Image source={{ uri: comparePhotos[1].uri }} accessibilityLabel={compareCopy.later} style={[styles.comparisonImage, { width: compareWidth }]} resizeMode="cover" />
            </View> : null}
            <View style={styles.comparisonLabels} pointerEvents="none"><Text style={styles.comparisonTag}>{compareCopy.before}</Text><Text style={styles.comparisonTag}>{compareCopy.after}</Text></View>
          </View>
          <View style={styles.compareDates}>
            <Body>{comparePhotos[0].takenAt.toLocaleDateString()}</Body>
            <Body>{comparePhotos[1].takenAt.toLocaleDateString()}</Body>
          </View>
          <View style={[styles.sliderTrack, { backgroundColor: palette.surfaceMuted }]} onLayout={(event) => setCompareWidth((width) => width || event.nativeEvent.layout.width)}>
            <Pressable accessibilityRole="button" accessibilityLabel={compareCopy.less} onPress={() => setComparePercent((percent) => Math.max(5, percent - 5))} style={[styles.sliderButton, { backgroundColor: palette.surface }]}><Text style={{ color: palette.text }}>−</Text></Pressable>
            <View style={[styles.sliderFill, { width: `${comparePercent}%`, backgroundColor: palette.accentStrong }]} />
            <Pressable accessibilityRole="button" accessibilityLabel={compareCopy.more} onPress={() => setComparePercent((percent) => Math.min(95, percent + 5))} style={[styles.sliderButton, { backgroundColor: palette.surface }]}><Text style={{ color: palette.text }}>＋</Text></Pressable>
          </View>
        </Card>
      ) : null}
      {photos.length === 0 ? <Body>{t('photos.empty')}</Body> : <Paged items={photos} pageSize={24}>{(shownPhotos) => shownPhotos.map((photo) => (
        <Card key={photo.id} style={styles.photoCard}>
          <Image source={{ uri: photo.uri }} accessibilityLabel={t('photos.imageLabel')} style={styles.image} resizeMode="cover" />
          <View style={styles.caption}>
            <View style={styles.captionText}>
              <Text style={[styles.date, { color: palette.text }]}>{photo.takenAt.toLocaleDateString()}</Text>
              {photo.note ? <Body>{photo.note}</Body> : null}
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel={t('photos.delete')} onPress={() => confirmDelete(photo)} hitSlop={10}>
              <Text style={{ color: palette.warning, fontWeight: '700' }}>{t('photos.delete')}</Text>
            </Pressable>
          </View>
          {photos.length >= 2 ? <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${compareCopy.select}: ${photo.takenAt.toLocaleDateString()}`}
            accessibilityState={{ selected: compareIds.includes(photo.id) }}
            onPress={() => setCompareIds((ids) => ids.includes(photo.id) ? ids.filter((id) => id !== photo.id) : ids.length >= 2 ? [ids[1], photo.id] : [...ids, photo.id])}
            style={[styles.compareButton, { backgroundColor: compareIds.includes(photo.id) ? palette.accent : palette.surfaceMuted }]}
          ><Text style={{ color: compareIds.includes(photo.id) ? palette.accentText : palette.text, fontWeight: '800' }}>{compareIds.includes(photo.id) ? compareCopy.selected : compareCopy.select}</Text></Pressable> : null}
        </Card>
      ))}</Paged>}
      <Sheet visible={deleting !== null} onClose={() => setDeleting(null)} title={t('photos.deleteTitle')} body={t('photos.deleteBody')}>
        <ActionButton icon="trash-outline" label={t('photos.delete')} variant="danger" onPress={() => {
          const photo = deleting;
          setDeleting(null);
          if (photo) void deleteProgressPhoto(photo.id).then(refresh);
        }} />
        <ActionButton label={t('common.cancel')} secondary onPress={() => setDeleting(null)} />
      </Sheet>
    </Screen>
  );
}

const baseStyles = StyleSheet.create({
  photoCard: { padding: 10, overflow: 'hidden' },
  image: { width: '100%', aspectRatio: 0.85, borderRadius: 15, backgroundColor: '#222' },
  caption: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingHorizontal: 5 },
  captionText: { flex: 1, gap: 4 },
  date: { fontSize: 15, fontWeight: '800' },
  compareButton: { minHeight: 48, borderRadius: 13, alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  compareHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  comparison: { width: '100%', aspectRatio: 0.9, overflow: 'hidden', borderRadius: 15, backgroundColor: '#222' },
  comparisonImage: { height: '100%' },
  comparisonMask: { position: 'absolute', top: 0, bottom: 0, left: 0, overflow: 'hidden' },
  comparisonLabels: { ...StyleSheet.absoluteFill, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', padding: 10 },
  comparisonTag: { color: '#fff', backgroundColor: '#0009', paddingHorizontal: 8, paddingVertical: 5, borderRadius: 9, fontWeight: '800', overflow: 'hidden' },
  compareDates: { flexDirection: 'row', justifyContent: 'space-between' },
  sliderTrack: { minHeight: 48, borderRadius: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 3, overflow: 'hidden' },
  sliderFill: { position: 'absolute', height: 4, left: 0 },
  sliderButton: { width: 48, height: 48, borderRadius: 12, zIndex: 1, alignItems: 'center', justifyContent: 'center' },
});
