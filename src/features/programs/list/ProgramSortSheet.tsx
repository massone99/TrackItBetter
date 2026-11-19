import { useTranslation } from 'react-i18next';
import { ListGroup, ListRow, Sheet } from '../../../shared/components/ui';
import { PROGRAM_SORTS, type ProgramSort } from './derive';

/** Sheet to pick how programs are sorted. */
export function ProgramSortSheet({ visible, sort, onSelect, onClose }: {
  visible: boolean;
  sort: ProgramSort;
  onSelect: (next: ProgramSort) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();

  return (
    <Sheet visible={visible} onClose={onClose} title={t('programsList.sortTitle')}>
      <ListGroup>
        {PROGRAM_SORTS.map((option) => (
          <ListRow
            key={option}
            title={t(`programsList.sortOptions.${option}`)}
            selected={option === sort}
            onPress={() => {
              onSelect(option);
              onClose();
            }}
          />
        ))}
      </ListGroup>
    </Sheet>
  );
}
