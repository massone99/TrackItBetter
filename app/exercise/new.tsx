import { zodResolver } from '@hookform/resolvers/zod';
import { router, useLocalSearchParams } from 'expo-router';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { createCustomExercise, updateExercise } from '../../src/features/exercises/customRepository';
import { ClassificationChoices } from '../../src/features/exercises/ClassificationChoices';
import {
  chooseMainCategory,
  EMPTY_EXERCISE_FORM,
  EXERCISE_CATEGORIES,
  EXERCISE_METRICS,
  exerciseFormSchema,
  exerciseToFormValues,
  formValuesToInput,
  toggleExtraCategory,
  type ExerciseFormValues,
} from '../../src/features/exercises/exerciseForm';
import { ActionButton, Body, Chip, Icon, Label, PageHeading, Screen, TextField } from '../../src/shared/components/ui';
import { addExerciseToCompletedWorkout, addExerciseToWorkout } from '../../src/features/session/repository';
import { getExerciseById } from '../../src/features/exercises/repository';
import { setPendingExercise } from '../../src/features/programs/pendingExercise';
import { useTheme } from '../../src/shared/theme/ThemeProvider';
import { useScaledStyles } from '../../src/shared/theme/useScaledStyles';
import { goBack } from '../../src/shared/navigation/goBack';

export default function NewExerciseRoute() {
  const styles = useScaledStyles(baseStyles);
  // Set when opened from an active workout: the new exercise is added to it right away.
  // Set when editing an existing exercise (catalog or custom) instead of creating one.
  // Set when opened from the program builder: the new exercise goes into that workout of the program.
  // Set when opened from a finished (past) workout: the exercise is added to it as done.
  const { addTo, addToPast, addToProgram, edit } = useLocalSearchParams<{ addTo?: string; addToPast?: string; addToProgram?: string; edit?: string }>();
  const { t } = useTranslation();
  const { palette } = useTheme();
  const [saving, setSaving] = useState(false);
  // Why the last save failed, shown with the message so a failure on a phone can be reported.
  const [saveError, setSaveError] = useState<string | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const { control, handleSubmit, reset, setValue, getValues, formState: { errors } } = useForm<ExerciseFormValues>({
    resolver: zodResolver(exerciseFormSchema),
    defaultValues: EMPTY_EXERCISE_FORM,
  });
  const [category, extraCategories, movementTag, movementGroup] = useWatch({ control, name: ['category', 'extraCategories', 'movementTag', 'movementGroup'] });
  const detailErrors = Boolean(errors.equipment || errors.cues || errors.demoUrl);

  useEffect(() => {
    if (!edit) return;
    void getExerciseById(edit).then((exercise) => {
      if (exercise) reset(exerciseToFormValues(exercise));
    });
  }, [edit, reset]);

  const save = async (values: ExerciseFormValues) => {
    if (saving) return;
    setSaving(true);
    setSaveError(null);
    try {
      const input = formValuesToInput(values);
      if (edit) {
        await updateExercise(edit, input);
        goBack({ pathname: '/exercise/[id]', params: { id: edit } });
        return;
      }
      const id = await createCustomExercise(input);
      if (addToProgram) {
        setPendingExercise({ sessionId: addToProgram, exerciseId: id, metric: input.metric });
        goBack('/program-builder');
      } else if (addToPast) {
        await addExerciseToCompletedWorkout(addToPast, id);
        goBack({ pathname: '/workout/history/[id]', params: { id: addToPast } });
      } else if (addTo) {
        await addExerciseToWorkout(addTo, id);
        goBack({ pathname: '/workout/[id]', params: { id: addTo } });
      } else {
        router.replace({ pathname: '/exercise/[id]', params: { id } });
      }
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  };

  // Hidden detail fields with an error open up so the message is never out of sight.
  const submit = () => void handleSubmit(save, (invalid) => {
    if (invalid.equipment || invalid.cues || invalid.demoUrl) setDetailsOpen(true);
  })();

  const pickMain = (next: (typeof EXERCISE_CATEGORIES)[number]) => {
    const picked = chooseMainCategory(getValues(), next);
    setValue('category', picked.category);
    setValue('extraCategories', picked.extraCategories);
  };

  return (
    <Screen>
      <PageHeading title={edit ? t('customExercise.editTitle') : t('customExercise.title')} subtitle={edit ? t('customExercise.editSubtitle') : undefined} />

      <Controller control={control} name="name" render={({ field: { onChange, onBlur, value } }) => (
        <TextField
          label={t('customExercise.name')}
          autoCapitalize="words"
          value={value}
          onChangeText={onChange}
          onBlur={onBlur}
          placeholder={t('customExercise.namePlaceholder')}
          error={errors.name ? t(errors.name.message ?? 'customExercise.errors.name') : null}
        />
      )} />

      <View style={styles.field}>
        <Label>{t('customExercise.metric')}</Label>
        <Controller control={control} name="metric" render={({ field: { onChange, value } }) => (
          <View style={styles.choices}>
            {EXERCISE_METRICS.map((metric) => <Chip key={metric} label={t(`customExercise.metrics.${metric}`)} selected={value === metric} onPress={() => onChange(metric)} />)}
          </View>
        )} />
      </View>

      <View style={styles.field}>
        <Label>{t('customExercise.category')}</Label>
        <View style={styles.choices}>
          {EXERCISE_CATEGORIES.map((item) => {
            const label = t(`library.category.${item}`);
            return <Chip key={item} label={label} accessibilityLabel={`${t('customExercise.category')}: ${label}`} selected={category === item} onPress={() => pickMain(item)} />;
          })}
        </View>
      </View>

      <View style={styles.field}>
        <Label>{t('customExercise.extraCategories')}</Label>
        <View style={styles.choices}>
          {EXERCISE_CATEGORIES.filter((item) => item !== category).map((item) => {
            const label = t(`library.category.${item}`);
            return (
              <Chip
                key={item}
                label={label}
                accessibilityLabel={`${t('customExercise.extraCategories')}: ${label}`}
                selected={extraCategories.includes(item)}
                onPress={() => setValue('extraCategories', toggleExtraCategory(getValues('extraCategories'), item))}
              />
            );
          })}
        </View>
      </View>

      <ClassificationChoices
        movementTag={movementTag}
        movementGroup={movementGroup}
        onTagChange={(value) => setValue('movementTag', value)}
        onGroupChange={(value) => setValue('movementGroup', value)}
      />

      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: detailsOpen || detailErrors }}
        onPress={() => setDetailsOpen((open) => !open)}
        style={[styles.detailsToggle, { borderColor: palette.border }]}
      >
        <Label>{t('customExercise.details')}</Label>
        <Icon name={detailsOpen || detailErrors ? 'chevron-up' : 'chevron-down'} size={18} color={palette.textMuted} />
      </Pressable>

      {detailsOpen || detailErrors ? (
        <>
          <Controller control={control} name="equipment" render={({ field: { onChange, onBlur, value } }) => (
            <TextField
              label={t('customExercise.equipment')}
              value={value}
              onChangeText={onChange}
              onBlur={onBlur}
              placeholder={t('customExercise.equipmentPlaceholder')}
              error={errors.equipment ? t(errors.equipment.message ?? 'customExercise.errors.equipmentLength') : null}
            />
          )} />
          <Controller control={control} name="cues" render={({ field: { onChange, onBlur, value } }) => (
            <TextField
              label={t('customExercise.cues')}
              multiline
              value={value}
              onChangeText={onChange}
              onBlur={onBlur}
              placeholder={t('customExercise.cuesPlaceholder')}
              hint={t('customExercise.cuesHint')}
              error={errors.cues ? t(errors.cues.message ?? 'customExercise.errors.cuesLength') : null}
            />
          )} />
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
              error={errors.demoUrl ? t('logger.referenceInvalid') : null}
            />
          )} />
        </>
      ) : null}

      {saveError !== null ? <Body style={{ color: palette.warning }}>{`${t('customExercise.errors.save')} (${saveError})`}</Body> : null}
      <ActionButton label={saving ? t('customExercise.saving') : t('common.save')} disabled={saving} onPress={submit} />
    </Screen>
  );
}

const baseStyles = StyleSheet.create({
  field: { gap: 8 },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  detailsToggle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 44, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 8 },
});
