import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { expandScopes, getDataSummary, resetData, RESET_SCOPES, type DataSummary, type ResetScope } from '../src/features/data/reset';
import { shareBackupFile } from '../src/features/data/shareBackup';
import { ActionButton, Body, Card, CheckRow, EmptyState, Heading, Icon, Label, ListGroup, PageHeading, Screen, Text, TextField } from '../src/shared/components/ui';
import type { IconName } from '../src/shared/components/ui';
import { useTheme } from '../src/shared/theme/ThemeProvider';
import { fonts } from '../src/shared/theme/typography';
import { useScaledStyles } from '../src/shared/theme/useScaledStyles';

type Step = 'choose' | 'backup' | 'confirm' | 'working' | 'done' | 'failed';

const ICONS: Record<ResetScope, IconName> = {
  workouts: 'barbell-outline',
  body: 'body-outline',
  pose: 'scan-outline',
  plans: 'calendar-outline',
  everything: 'nuclear-outline',
};

/**
 * Three deliberate steps before anything is deleted: pick what to clear, get a chance to save a
 * backup, then type a confirmation word. Nothing is removed until the last step.
 */
export default function ResetScreen() {
  const styles = useScaledStyles(baseStyles);
  const { t } = useTranslation();
  const { palette } = useTheme();
  const [summary, setSummary] = useState<DataSummary | null>(null);
  const [chosen, setChosen] = useState<Set<ResetScope>>(new Set());
  const [step, setStep] = useState<Step>('choose');
  const [typed, setTyped] = useState('');
  const [backupMessage, setBackupMessage] = useState<string | null>(null);
  const [backingUp, setBackingUp] = useState(false);

  useFocusEffect(useCallback(() => {
    let mounted = true;
    void getDataSummary().then((next) => { if (mounted) setSummary(next); }).catch(() => undefined);
    return () => { mounted = false; };
  }, []));

  const effective = expandScopes([...chosen]);
  const everything = chosen.has('everything');
  const word = t('reset.confirmWord');
  const matches = typed.trim().toUpperCase() === word.toUpperCase();

  const toggle = (scope: ResetScope, next: boolean) => {
    setChosen((current) => {
      // Unticking one part of "everything" keeps the other parts ticked.
      if (current.has('everything') && scope !== 'everything') {
        return new Set(RESET_SCOPES.filter((item) => item !== 'everything' && item !== scope));
      }
      const updated = new Set(current);
      if (next) updated.add(scope); else updated.delete(scope);
      return updated;
    });
  };

  const detail = (scope: ResetScope): string => {
    if (!summary) return t(`reset.scopes.${scope}.body`);
    const counts: Record<ResetScope, string | null> = {
      workouts: t('reset.count.workouts', { count: summary.workouts }),
      body: t('reset.count.body', { measurements: summary.measurements, photos: summary.photos }),
      pose: t('reset.count.pose', { count: summary.poseChecks }),
      plans: null,
      everything: null,
    };
    return [t(`reset.scopes.${scope}.body`), counts[scope]].filter(Boolean).join(' · ');
  };

  const backup = async () => {
    setBackingUp(true);
    setBackupMessage(null);
    try {
      const result = await shareBackupFile(t('data.exportAction'));
      setBackupMessage(result === 'shared' ? t('reset.backupDone') : t('data.exportUnavailable'));
    } catch {
      setBackupMessage(t('data.exportError'));
    } finally {
      setBackingUp(false);
    }
  };

  const run = async () => {
    if (!matches) return;
    setStep('working');
    try {
      await resetData([...chosen]);
      setStep('done');
    } catch {
      setStep('failed');
    }
  };

  if (step === 'working') {
    return <Screen><PageHeading title={t('reset.title')} subtitle={t('reset.working')} /><ActivityIndicator color={palette.accentStrong} /></Screen>;
  }
  if (step === 'done' || step === 'failed') {
    const ok = step === 'done';
    return (
      <Screen>
        <EmptyState
          icon={ok ? 'checkmark-circle-outline' : 'alert-circle-outline'}
          title={ok ? t('reset.doneTitle') : t('reset.failedTitle')}
          body={ok ? t('reset.doneBody') : t('reset.failedBody')}
          action={<View style={styles.stretch}><ActionButton label={t('reset.backHome')} onPress={() => router.replace('/(tabs)/today')} /></View>}
        />
      </Screen>
    );
  }

  const stepIndex = step === 'choose' ? 1 : step === 'backup' ? 2 : 3;
  return (
    <Screen>
      <PageHeading title={t('reset.title')} subtitle={t('reset.subtitle')} />
      <View style={styles.progress} accessibilityLabel={t('reset.stepOf', { step: stepIndex, total: 3 })}>
        {[1, 2, 3].map((index) => (
          <View key={index} style={[styles.progressBar, { backgroundColor: index <= stepIndex ? palette.warning : palette.surfaceMuted }]} />
        ))}
      </View>
      <Label>{t('reset.stepOf', { step: stepIndex, total: 3 })}</Label>

      {step === 'choose' ? (
        <>
          <Heading>{t('reset.chooseTitle')}</Heading>
          <ListGroup>
            {RESET_SCOPES.map((scope) => (
              <CheckRow
                key={scope}
                icon={ICONS[scope]}
                tint={scope === 'everything' ? palette.warning : undefined}
                title={t(`reset.scopes.${scope}.title`)}
                subtitle={detail(scope)}
                checked={everything ? true : chosen.has(scope)}
                onChange={(next) => toggle(scope, next)}
              />
            ))}
          </ListGroup>
          <Body>{t('reset.kept')}</Body>
          <ActionButton icon="arrow-forward" label={t('reset.next')} disabled={chosen.size === 0} onPress={() => setStep('backup')} />
          <ActionButton label={t('common.cancel')} secondary onPress={() => router.back()} />
        </>
      ) : null}

      {step === 'backup' ? (
        <>
          <Card style={styles.card}>
            <View style={[styles.icon, { backgroundColor: palette.accentSoft }]}><Icon name="shield-checkmark-outline" size={22} color={palette.accentStrong} /></View>
            <Heading>{t('reset.backupTitle')}</Heading>
            <Body>{t('reset.backupBody')}</Body>
            <ActionButton icon="share-outline" label={backingUp ? t('data.working') : t('reset.backupAction')} disabled={backingUp} onPress={() => void backup()} />
            {backupMessage ? <Body accessibilityLiveRegion="polite">{backupMessage}</Body> : null}
          </Card>
          <ActionButton icon="arrow-forward" label={t('reset.next')} secondary onPress={() => setStep('confirm')} />
          <ActionButton label={t('reset.back')} variant="ghost" onPress={() => setStep('choose')} />
        </>
      ) : null}

      {step === 'confirm' ? (
        <>
          <Card style={[styles.card, { borderColor: palette.warning }]}>
            <Heading>{t('reset.confirmTitle')}</Heading>
            {[...effective].filter((scope) => scope !== 'everything').map((scope) => (
              <View key={scope} style={styles.item}>
                <Icon name="close-circle" size={18} color={palette.warning} />
                <Text style={styles.itemText}>{t(`reset.scopes.${scope}.title`)}</Text>
              </View>
            ))}
            {everything ? (
              <View style={styles.item}>
                <Icon name="close-circle" size={18} color={palette.warning} />
                <Text style={styles.itemText}>{t('reset.catalog')}</Text>
              </View>
            ) : null}
            <Body style={{ color: palette.warning }}>{t('reset.irreversible')}</Body>
          </Card>
          <TextField
            label={t('reset.typeLabel', { word })}
            value={typed}
            onChangeText={setTyped}
            autoCapitalize="characters"
            autoCorrect={false}
            onSubmitEditing={() => void run()}
          />
          <ActionButton icon="trash" label={t('reset.confirmAction')} variant="danger" disabled={!matches} onPress={() => void run()} />
          <ActionButton label={t('reset.back')} variant="ghost" onPress={() => { setTyped(''); setStep('backup'); }} />
        </>
      ) : null}
    </Screen>
  );
}

const baseStyles = StyleSheet.create({
  stretch: { alignSelf: 'stretch', marginTop: 6 },
  progress: { flexDirection: 'row', gap: 6 },
  progressBar: { flex: 1, height: 5, borderRadius: 3 },
  card: { gap: 12 },
  icon: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  item: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  itemText: { fontFamily: fonts.medium, fontSize: 15 },
});
