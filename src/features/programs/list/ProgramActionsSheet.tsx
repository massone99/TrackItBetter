import { useTranslation } from 'react-i18next';
import { type UserProgram } from '../../../domain/userProgram';
import { ActionButton, MenuList, MenuRow, Sheet } from '../../../shared/components/ui';
import { statusOf } from './derive';

export type ProgramAction = 'category' | 'author' | 'clusters' | 'pause' | 'resume' | 'archive' | 'unarchive' | 'duplicate' | 'delete';

/** What can be done to a program from the list; delete asks first, inside the same sheet. */
export function ProgramActionsSheet({ program, confirmingDelete, onAsk, onAction, onClose }: {
  program: UserProgram | null;
  confirmingDelete: boolean;
  onAsk: () => void;
  onAction: (action: ProgramAction, program: UserProgram) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const status = program ? statusOf(program) : 'active';
  const name = program?.name ?? '';
  if (confirmingDelete) {
    return (
      <Sheet visible={program !== null} onClose={onClose} title={t('programBuilder.deleteTitle')} body={t('programBuilder.deleteBody', { name })}>
        <ActionButton icon="trash-outline" label={t('programBuilder.delete')} variant="danger" onPress={() => { if (program) onAction('delete', program); }} />
        <ActionButton label={t('common.cancel')} secondary onPress={onClose} />
      </Sheet>
    );
  }
  const run = (action: ProgramAction) => () => { if (program) onAction(action, program); };
  return (
    <Sheet visible={program !== null} onClose={onClose} title={name}>
      <MenuList>
        <MenuRow icon="pricetag-outline" label={t('programCategory.change')} onPress={run('category')} />
        <MenuRow icon="person-outline" label={t('programAuthor.change')} onPress={run('author')} />
        <MenuRow icon="folder-outline" label={t('programCluster.change')} onPress={run('clusters')} />
        {status === 'paused' ? <MenuRow icon="play-outline" label={t('programsList.resume')} onPress={run('resume')} /> : null}
        {status === 'active' ? <MenuRow icon="pause-outline" label={t('programsList.pause')} onPress={run('pause')} /> : null}
        {status === 'archived'
          ? <MenuRow icon="arrow-undo-outline" label={t('programsList.unarchive')} onPress={run('unarchive')} />
          : <MenuRow icon="archive-outline" label={t('programsList.archive')} onPress={run('archive')} />}
        <MenuRow icon="copy-outline" label={t('userProgram.duplicate')} onPress={run('duplicate')} />
        <MenuRow icon="trash-outline" tone="danger" label={t('programBuilder.delete')} onPress={onAsk} />
      </MenuList>
    </Sheet>
  );
}
