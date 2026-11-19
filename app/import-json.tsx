import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { router } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { applyImport, ImportApplyError, ImportError, planImport, previewImport, type ImportPlan, type ImportPreview, type ImportResult } from '../src/features/data/importJson';
import { listExercises } from '../src/features/exercises/repository';
import { Paged } from '../src/shared/components/paging';
import { ActionButton, Body, Card, FooterAction, Heading, Label, PageHeading, Screen, SectionTitle } from '../src/shared/components/ui';
import { useTheme } from '../src/shared/theme/ThemeProvider';

type Review = { filename: string; plan: ImportPlan; preview: ImportPreview };

export default function ImportJsonScreen() {
  const { t } = useTranslation();
  const { palette } = useTheme();
  const [review, setReview] = useState<Review | null>(null);
  const [report, setReport] = useState<{ result: ImportResult; partial: boolean } | null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const describeError = (error: unknown, fallback: 'read' | 'save') => error instanceof ImportError
    ? t(`importJson.error.${error.code}`, { detail: error.detail })
    : t(`importJson.error.${fallback}`);

  const choose = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const picked = await DocumentPicker.getDocumentAsync({ type: ['application/json', 'text/json', 'public.json'], copyToCacheDirectory: true, multiple: false });
      if (picked.canceled) return;
      const asset = picked.assets[0];
      setMessage('');
      setReview(null);
      const text = await (asset.file ? asset.file.text() : new File(asset.uri).text());
      const known = await listExercises();
      const plan = planImport(text, known);
      const preview = await previewImport(plan, known);
      setReview({ filename: asset.name, plan, preview });
    } catch (error) {
      setMessage(describeError(error, 'read'));
    } finally {
      setBusy(false);
    }
  };

  const confirm = async () => {
    if (!review || busy) return;
    setBusy(true);
    setMessage('');
    try {
      const result = await applyImport(review.plan);
      setReview(null);
      setReport({ result, partial: false });
    } catch (error) {
      if (error instanceof ImportApplyError) {
        setReview(null);
        setReport({ result: error.partial, partial: true });
      } else {
        setMessage(describeError(error, 'save'));
      }
    } finally {
      setBusy(false);
    }
  };

  const { preview, plan } = review ?? {};
  const hasAdditions = Boolean(preview && plan && (
    preview.exercises.some((exercise) => !exercise.reused || exercise.imagesAdded > 0 || exercise.addsVideoLink) ||
    plan.file.mobilityRoutines.length > 0 || plan.file.programs.length > 0 ||
    preview.chains.some((chain) => chain.added.length > 0) || preview.links.some((link) => link.added)
  ));
  return (
    <Screen footer={hasAdditions ? <FooterAction icon="checkmark" label={busy ? t('data.working') : t('importJson.confirm')} disabled={busy} onPress={() => void confirm()} /> : undefined}>
      <PageHeading title={t('importJson.title')} />
      {!review && !report ? <Body>{t('importJson.body')}</Body> : null}
      <ActionButton icon="document-outline" label={busy ? t('data.working') : t(review ? 'importJson.chooseOther' : 'importJson.choose')} secondary={Boolean(review || report)} disabled={busy} onPress={() => void choose()} />
      {message ? <Body accessibilityLiveRegion="polite" style={{ color: palette.warning }}>{message}</Body> : null}
      {report && (!review || report.partial) ? (
        <Card>
          <Heading style={{ color: report.partial ? palette.warning : palette.success }} accessibilityLiveRegion="polite">
            {t(report.partial ? 'importJson.partialTitle' : 'importJson.completeTitle')}
          </Heading>
          <Body>{t('importJson.savedTotals', { ...report.result })}</Body>
          {report.result.linksToVideosAdded ? <Body>{t('importJson.videoLinksAdded', { total: report.result.linksToVideosAdded })}</Body> : null}
          {report.partial ? <Body>{t('importJson.partialBody')}</Body> : null}
          {!review && report.result.programs > 0 ? <ActionButton icon="albums-outline" label={t('importJson.openPrograms')} secondary onPress={() => router.replace('/(tabs)/programs')} /> : null}
          {!review && report.result.routines > 0 ? <ActionButton icon="walk-outline" label={t('importJson.openMobility')} secondary onPress={() => router.replace('/mobility')} /> : null}
        </Card>
      ) : null}
      {review && preview && plan ? (
        <>
          <Card>
            <Heading>{t('importJson.reviewTitle')}</Heading>
            <Label>{review.filename}</Label>
            {plan.file.mobilityRoutines.length + plan.file.programs.length > 0 ? <Body>{t('importJson.reviewBody')}</Body> : null}
            {!hasAdditions ? <Body accessibilityLiveRegion="polite">{t('importJson.noChanges')}</Body> : null}
          </Card>
          <ReviewSection title={t('importJson.sectionExercises')} items={preview.exercises} resetKey={review}>
            {(exercise) => (
              <Card key={exercise.key}>
                <Label>{exercise.name}</Label>
                <Body>{t(exercise.reused ? 'importJson.reuseExercise' : 'importJson.newExercise')}</Body>
                {exercise.addsVideoLink ? <Body>{t('importJson.addVideoLink')}</Body> : null}
                {exercise.imagesAdded + exercise.imagesSkipped > 0 ? (
                  <Body>{t('importJson.imageChanges', { added: exercise.imagesAdded, skipped: exercise.imagesSkipped })}</Body>
                ) : null}
              </Card>
            )}
          </ReviewSection>
          <ReviewSection title={t('importJson.sectionRoutines')} items={plan.file.mobilityRoutines} resetKey={review}>
            {(routine, index) => <Card key={index}><Label>{routine.name}</Label><Body>{t('importJson.routineDetail', { count: routine.steps.length })}</Body></Card>}
          </ReviewSection>
          <ReviewSection title={t('importJson.sectionPrograms')} items={plan.file.programs} resetKey={review}>
            {(program, index) => <Card key={index}><Label>{program.name}</Label><Body>{t('importJson.programDetail', { names: program.sessions.map((session) => session.name).join(', ') })}</Body></Card>}
          </ReviewSection>
          <ReviewSection title={t('importJson.sectionChains')} items={preview.chains} resetKey={review}>
            {(chain) => (
              <Card key={chain.name}>
                <Label>{chain.name}</Label>
                <Body>{t(!chain.exists ? 'importJson.newChain' : chain.added.length > 0 ? 'importJson.extendChain' : 'importJson.reuseChain')}</Body>
                {chain.added.length > 0 ? <Body>{t('importJson.addedSteps', { names: chain.added.join(', ') })}</Body> : null}
                {chain.skipped.length > 0 ? <Body>{t('importJson.skippedSteps', { names: chain.skipped.join(', ') })}</Body> : null}
              </Card>
            )}
          </ReviewSection>
          <ReviewSection title={t('importJson.sectionLinks')} items={preview.links} resetKey={review}>
            {(link, index) => <Card key={index}><Label>{link.from} → {link.to}</Label><Body>{t(`importJson.linkKind.${link.kind}`)} · {t(link.added ? 'importJson.newLink' : 'importJson.skipLink')}</Body></Card>}
          </ReviewSection>
        </>
      ) : null}
    </Screen>
  );
}

function ReviewSection<T>({ title, items, resetKey, children }: { title: string; items: readonly T[]; resetKey: Review; children: (item: T, index: number) => ReactNode }) {
  if (items.length === 0) return null;
  return (
    <>
      <SectionTitle title={title} />
      <Paged items={items} pageSize={5} resetKey={resetKey}>{(shown) => shown.map(children)}</Paged>
    </>
  );
}
