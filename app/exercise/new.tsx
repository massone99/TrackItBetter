import { zodResolver } from '@hookform/resolvers/zod';
import { router, useLocalSearchParams } from 'expo-router';
import { Controller, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import { z } from 'zod';
import { createCustomExercise, type ExerciseCategory, type ExerciseMetric } from '../../src/features/exercises/customRepository';
import { ActionButton, Body, Chip, Label, PageHeading, Screen, TextField } from '../../src/shared/components/ui';
import { addExerciseToWorkout } from '../../src/features/session/repository';
import { normalizeVideoUrl } from '../../src/shared/utils/url';
import { useTheme } from '../../src/shared/theme/ThemeProvider';
import { useScaledStyles } from '../../src/shared/theme/useScaledStyles';
import { goBack } from '../../src/shared/navigation/goBack';

const categories = ['push', 'pull', 'legs', 'core', 'skill', 'mobility', 'cardio'] as const satisfies readonly ExerciseCategory[];
const metrics = ['reps', 'time', 'reps_load', 'time_load', 'distance'] as const satisfies readonly ExerciseMetric[];

const formSchema = z.object({
  name: z.string().trim().min(1, 'customExercise.errors.name').max(80, 'customExercise.errors.nameLength'),
  metric: z.enum(metrics),
  category: z.enum(categories),
  equipment: z.string().max(240, 'customExercise.errors.equipmentLength'),
  cues: z.string().max(1000, 'customExercise.errors.cuesLength'),
  demoUrl: z.string().refine((value) => normalizeVideoUrl(value) !== undefined, 'logger.referenceInvalid'),
});

type FormValues = z.infer<typeof formSchema>;

function splitList(value: string, commaSeparated = false): string[] {
  return value.split(commaSeparated ? /[\n,]/ : /\n/).map((item) => item.trim()).filter(Boolean);
}

export default function NewExerciseRoute() {
  const styles = useScaledStyles(baseStyles);
  // Set when opened from an active workout: the new exercise is added to it right away.
  const { addTo } = useLocalSearchParams<{ addTo?: string }>();
  const { t } = useTranslation();
  const { palette } = useTheme();
  const [saving, setSaving] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const { control, handleSubmit, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { name: '', metric: 'reps', category: 'push', equipment: '', cues: '', demoUrl: '' },
  });

  const save = async (values: FormValues) => {
    if (saving) return;
    setSaving(true);
    setSaveFailed(false);
    try {
      const id = await createCustomExercise({
        name: values.name,
        metric: values.metric,
        category: values.category,
        equipment: splitList(values.equipment, true),
        cues: splitList(values.cues),
        demoUrl: normalizeVideoUrl(values.demoUrl) ?? null,
      });
      if (addTo) {
        await addExerciseToWorkout(addTo, id);
        goBack(addTo ? { pathname: '/workout/[id]', params: { id: addTo } } : { pathname: '/programs', params: { view: 'exercises' } });
      } else {
        router.replace({ pathname: '/exercise/[id]', params: { id } });
      }
    } catch {
      setSaveFailed(true);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen>
      <PageHeading title={t('customExercise.title')} subtitle={t('customExercise.subtitle')} />
      <View style={styles.field}>
        <Label>{t('customExercise.name')}</Label>
        <Controller control={control} name="name" render={({ field: { onChange, onBlur, value } }) => (
          <TextInput
            accessibilityLabel={t('customExercise.name')}
            autoCapitalize="words"
            value={value}
            onChangeText={onChange}
            onBlur={onBlur}
            placeholder={t('customExercise.namePlaceholder')}
            placeholderTextColor={palette.textMuted}
            style={[styles.input, { backgroundColor: palette.surface, borderColor: palette.border, color: palette.text }]}
          />
        )} />
        {errors.name ? <Body style={{ color: palette.warning }}>{t(errors.name.message ?? 'customExercise.errors.name')}</Body> : null}
      </View>

      <View style={styles.field}>
        <Label>{t('customExercise.metric')}</Label>
        <Controller control={control} name="metric" render={({ field: { onChange, value } }) => (
          <View style={styles.choices}>
            {metrics.map((metric) => <Choice key={metric} label={t(`customExercise.metrics.${metric}`)} selected={value === metric} onPress={() => onChange(metric)} />)}
          </View>
        )} />
      </View>

      <View style={styles.field}>
        <Label>{t('customExercise.category')}</Label>
        <Controller control={control} name="category" render={({ field: { onChange, value } }) => (
          <View style={styles.choices}>
            {categories.map((category) => <Choice key={category} label={t(`library.category.${category}`)} selected={value === category} onPress={() => onChange(category)} />)}
          </View>
        )} />
      </View>

      <View style={styles.field}>
        <Label>{t('customExercise.equipment')}</Label>
        <Body>{t('customExercise.listHint')}</Body>
        <Controller control={control} name="equipment" render={({ field: { onChange, onBlur, value } }) => (
          <TextInput
            accessibilityLabel={t('customExercise.equipment')}
            value={value}
            onChangeText={onChange}
            onBlur={onBlur}
            placeholder={t('customExercise.equipmentPlaceholder')}
            placeholderTextColor={palette.textMuted}
            style={[styles.input, { backgroundColor: palette.surface, borderColor: palette.border, color: palette.text }]}
          />
        )} />
        {errors.equipment ? <Body style={{ color: palette.warning }}>{t(errors.equipment.message ?? 'customExercise.errors.equipmentLength')}</Body> : null}
      </View>

      <View style={styles.field}>
        <Label>{t('customExercise.cues')}</Label>
        <Body>{t('customExercise.cuesHint')}</Body>
        <Controller control={control} name="cues" render={({ field: { onChange, onBlur, value } }) => (
          <TextInput
            accessibilityLabel={t('customExercise.cues')}
            multiline
            textAlignVertical="top"
            value={value}
            onChangeText={onChange}
            onBlur={onBlur}
            placeholder={t('customExercise.cuesPlaceholder')}
            placeholderTextColor={palette.textMuted}
            style={[styles.input, styles.multiline, { backgroundColor: palette.surface, borderColor: palette.border, color: palette.text }]}
          />
        )} />
        {errors.cues ? <Body style={{ color: palette.warning }}>{t(errors.cues.message ?? 'customExercise.errors.cuesLength')}</Body> : null}
      </View>

      <Controller control={control} name="demoUrl" render={({ field: { onChange, onBlur, value } }) => (
        <TextField
          label={t('logger.reference')}
          value={value}
          onChangeText={onChange}
          onBlur={onBlur}
          placeholder={t('logger.referencePlaceholder')}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          hint={t('logger.referenceHint')}
          error={errors.demoUrl ? t('logger.referenceInvalid') : null}
        />
      )} />

      {saveFailed ? <Body style={{ color: palette.warning }}>{t('customExercise.errors.save')}</Body> : null}
      <ActionButton label={saving ? t('customExercise.saving') : t('common.save')} onPress={() => void handleSubmit(save)()} />
    </Screen>
  );
}

function Choice({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return <Chip label={label} selected={selected} onPress={onPress} />;
}

const baseStyles = StyleSheet.create({
  field: { gap: 9 },
  input: { minHeight: 52, borderWidth: 1, borderRadius: 15, paddingHorizontal: 15, fontSize: 15 },
  multiline: { minHeight: 112, paddingTop: 13 },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
