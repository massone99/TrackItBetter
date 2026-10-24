import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { listChains, unlinkedExercises, type ChainView } from '../src/features/progressions/chains';
import { shareChainsFile } from '../src/features/progressions/exportChains';
import { usePaged, ShowMore } from '../src/shared/components/paging';
import { ActionButton, Body, Chip, EmptyState, FooterAction, IconButton, ListGroup, ListRow, PageHeading, Screen, SectionTitle, Sheet } from '../src/shared/components/ui';
import { useTheme } from '../src/shared/theme/ThemeProvider';

/**
 * Every progression chain: how far you got in each, a way to make a new one, to bring chains in from
 * a JSON file or send them out, and the exercises not tied to any chain or relation yet.
 */
export default function ProgressionsScreen() {
  const { t } = useTranslation();
  const { palette } = useTheme();
  const [chains, setChains] = useState<ChainView[] | null>(null);
  const [loose, setLoose] = useState<{ id: string; name: string }[]>([]);
  const [failed, setFailed] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [showLoose, setShowLoose] = useState(false);

  const load = useCallback(() => {
    void Promise.all([listChains(), unlinkedExercises()]).then(([nextChains, nextLoose]) => {
      setChains(nextChains);
      setLoose(nextLoose);
      setFailed(false);
    }, () => setFailed(true));
  }, []);
  useFocusEffect(load);
  const page = usePaged(chains ?? [], 20);
  const loosePage = usePaged(loose, 20);

  const share = async (ids: string[] | null) => {
    setExportOpen(false);
    try {
      const result = await shareChainsFile(ids, t('chains.exportTitle'));
      setMessage(result === 'unavailable' ? t('chains.shareUnavailable') : null);
    } catch {
      setMessage(t('chains.exportError'));
    }
  };

  return (
    <Screen
      footer={(
        <>
          <FooterAction icon="download-outline" label={t('chains.importAction')} secondary onPress={() => router.push('/import-json')} />
          <FooterAction icon="add" label={t('chains.newChain')} onPress={() => router.push({ pathname: '/chain/[id]', params: { id: 'new' } })} />
        </>
      )}
    >
      <PageHeading
        title={t('chains.allTitle')}
        subtitle={t('chains.allSubtitle')}
        action={chains && chains.length > 0 ? <IconButton icon="share-outline" label={t('chains.exportAction')} onPress={() => { setPicked([]); setExportOpen(true); }} /> : undefined}
      />
      {message ? <Body accessibilityLiveRegion="polite" style={{ color: palette.warning }}>{message}</Body> : null}
      {failed ? (
        <EmptyState icon="alert-circle-outline" title={t('common.loadError')} body={t('common.loadErrorBody')} action={<ActionButton icon="refresh" label={t('common.tryAgain')} onPress={load} />} />
      ) : !chains ? (
        <ActivityIndicator color={palette.accentStrong} />
      ) : chains.length === 0 ? (
        <EmptyState
          icon="git-commit-outline"
          title={t('chains.emptyTitle')}
          body={t('chains.emptyBody')}
          action={(
            <View style={styles.emptyActions}>
              <ActionButton icon="add" label={t('chains.newChain')} onPress={() => router.push({ pathname: '/chain/[id]', params: { id: 'new' } })} />
              <ActionButton icon="download-outline" label={t('chains.importAction')} secondary onPress={() => router.push('/import-json')} />
            </View>
          )}
        />
      ) : (
        <>
          <ListGroup>
            {page.shown.map((chain) => (
              <ListRow
                key={chain.id}
                icon={chain.reachedLevel === chain.steps.length && chain.steps.length > 0 ? 'trophy-outline' : 'git-commit-outline'}
                title={chain.name}
                subtitle={[chain.family || null, t('chains.stepsCount', { count: chain.steps.length }), t('chains.reachedOf', { done: chain.reachedLevel, total: chain.steps.length })].filter(Boolean).join(' · ')}
                onPress={() => router.push({ pathname: '/chain/[id]', params: { id: chain.id } })}
              />
            ))}
          </ListGroup>
          <ShowMore remaining={page.remaining} onPress={page.more} />
        </>
      )}

      {loose.length > 0 ? (
        <View style={styles.section}>
          <SectionTitle title={t('chains.looseTitle', { count: loose.length })} />
          <Body>{t('chains.looseBody')}</Body>
          {showLoose ? (
            <>
              <ListGroup>
                {loosePage.shown.map((exercise) => (
                  <ListRow key={exercise.id} icon="barbell-outline" title={exercise.name} onPress={() => router.push({ pathname: '/exercise/[id]', params: { id: exercise.id } })} />
                ))}
              </ListGroup>
              <ShowMore remaining={loosePage.remaining} onPress={loosePage.more} />
            </>
          ) : <ActionButton icon="chevron-down" variant="ghost" label={t('chains.looseShow')} onPress={() => setShowLoose(true)} />}
        </View>
      ) : null}

      <Sheet visible={exportOpen} onClose={() => setExportOpen(false)} title={t('chains.exportTitle')} body={t('chains.exportBody')}>
        <ActionButton icon="share-outline" label={t('chains.exportAll', { count: chains?.length ?? 0 })} onPress={() => void share(null)} />
        <View style={styles.chips}>
          {(chains ?? []).map((chain) => (
            <Chip
              key={chain.id}
              label={chain.name}
              selected={picked.includes(chain.id)}
              icon={picked.includes(chain.id) ? 'checkmark' : undefined}
              onPress={() => setPicked((current) => (current.includes(chain.id) ? current.filter((id) => id !== chain.id) : [...current, chain.id]))}
            />
          ))}
        </View>
        <ActionButton icon="share-outline" label={t('chains.exportPicked', { count: picked.length })} secondary disabled={picked.length === 0} onPress={() => void share(picked)} />
      </Sheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  section: { gap: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  emptyActions: { gap: 8, alignSelf: 'stretch' },
});
