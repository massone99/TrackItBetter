import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet } from 'react-native';
import { applyImport, ImportError, planImport, type ImportPlan } from '../src/features/data/importJson';
import { listExercises } from '../src/features/exercises/repository';
import { ActionButton, Body, Card, Heading, PageHeading, Screen } from '../src/shared/components/ui';
import { useTheme } from '../src/shared/theme/ThemeProvider';

/** Brings movements, mobility routines and programs from a JSON file into the app, after showing what is in it. */
export default function ImportJsonScreen() {
  const { t } = useTranslation();
  const { palette } = useTheme();
  const [plan, setPlan] = useState<ImportPlan | null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const describeError = (error: unknown) => {
    if (error instanceof ImportError) return t(`importJson.error.${error.code}`, { detail: error.detail });
    return t('importJson.error.read');
  };

  const choose = async () => {
    setBusy(true);
    setMessage('');
    setDone(false);
    setPlan(null);
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: ['application/json', 'text/json', 'public.json'], copyToCacheDirectory: true, multiple: false });
      if (result.canceled) return;
      const text = await new File(result.assets[0].uri).text();
      setPlan(planImport(text, await listExercises()));
    } catch (error) {
      setMessage(describeError(error));
    } finally {
      setBusy(false);
    }
  };

  const confirm = async () => {
    if (!plan) return;
    setBusy(true);
    setMessage('');
    try {
      const result = await applyImport(plan);
      setPlan(null);
      setDone(true);
      setMessage(`${t('importJson.done', { exercises: result.exercisesCreated, routines: result.routines, programs: result.programs })}${result.imagesAdded > 0 ? ` ${t('importJson.imagesDone', { count: result.imagesAdded })}` : ''}`);
    } catch (error) {
      setMessage(describeError(error));
    } finally {
      setBusy(false);
    }
  };

  const file = plan?.file;
  return (
    <Screen footer={plan ? <ActionButton icon="checkmark" label={busy ? t('data.working') : t('importJson.confirm')} disabled={busy} onPress={() => void confirm()} /> : undefined}>
      <PageHeading title={t('importJson.title')} />
      <Body>{t('importJson.body')}</Body>
      {file ? (
        <Card style={styles.card}>
          <Heading>{t('importJson.contents')}</Heading>
          <Body>{t('importJson.exercises', { count: plan!.create.length })}</Body>
          <Body>{t('importJson.routines', { count: file.mobilityRoutines.length })}</Body>
          <Body>{t('importJson.programs', { count: file.programs.length })}</Body>
          {plan!.images > 0 ? <Body>{t('importJson.images', { count: plan!.images })}</Body> : null}
        </Card>
      ) : null}
      {message ? <Body accessibilityLiveRegion="polite" style={{ color: done ? palette.success : palette.warning }}>{message}</Body> : null}
      <ActionButton icon="document-outline" label={busy ? t('data.working') : t(plan ? 'importJson.chooseOther' : 'importJson.choose')} secondary disabled={busy} onPress={() => void choose()} />
      {done ? <ActionButton icon="walk-outline" label={t('importJson.openMobility')} secondary onPress={() => router.replace('/mobility')} /> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { gap: 8 },
});
