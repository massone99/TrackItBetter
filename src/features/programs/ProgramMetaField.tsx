import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { AUTHOR_MAX, CATEGORY_MAX } from '../../domain/userProgram';
import { Chip, TextField } from '../../shared/components/ui';
import { useScaledStyles } from '../../shared/theme/useScaledStyles';

export type ProgramMetaKind = 'category' | 'author';

const PREFIX: Record<ProgramMetaKind, 'programCategory' | 'programAuthor'> = {
  category: 'programCategory',
  author: 'programAuthor',
};

const MAX_LENGTH: Record<ProgramMetaKind, number> = {
  category: CATEGORY_MAX,
  author: AUTHOR_MAX,
};

/** Text input with one-tap chips for values already used on other programs. */
export function ProgramMetaField({ kind, value, onChange, existing }: {
  kind: ProgramMetaKind;
  value: string;
  onChange: (next: string) => void;
  existing: readonly string[];
}) {
  const styles = useScaledStyles(baseStyles);
  const { t } = useTranslation();
  const prefix = PREFIX[kind];
  const trimmed = value.trim();

  return (
    <View style={styles.container}>
      <TextField
        label={t(`${prefix}.label`)}
        value={value}
        onChangeText={onChange}
        placeholder={t(`${prefix}.placeholder`)}
        maxLength={MAX_LENGTH[kind]}
      />
      {existing.length > 0 || trimmed.length > 0 ? (
        <View style={styles.chips}>
          {existing.map((item) => (
            <Chip
              key={item}
              label={item}
              selected={trimmed === item}
              onPress={() => onChange(trimmed === item ? '' : item)}
            />
          ))}
          {trimmed.length > 0 && !existing.includes(trimmed) ? (
            <Chip icon="close" label={t(`${prefix}.clear`)} onPress={() => onChange('')} />
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const baseStyles = StyleSheet.create({
  container: { gap: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
