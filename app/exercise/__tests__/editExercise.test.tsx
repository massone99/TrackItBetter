import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import i18n from '../../../src/shared/i18n';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider } from '../../../src/shared/theme/ThemeProvider';
import NewExerciseRoute from '../new';

jest.mock('react-native-keyboard-controller', () => jest.requireActual('react-native-keyboard-controller/jest'));

const mockParams: { edit?: string; addTo?: string } = {};
jest.mock('expo-router', () => ({
  router: { replace: jest.fn(), push: jest.fn(), back: jest.fn(), canGoBack: () => true },
  useLocalSearchParams: () => mockParams,
  useSegments: () => ['exercise'],
}));
jest.mock('../../../src/shared/navigation/goBack', () => ({ goBack: jest.fn() }));
jest.mock('../../../src/features/session/repository', () => ({ addExerciseToWorkout: jest.fn() }));
jest.mock('../../../src/features/exercises/repository', () => ({ getExerciseById: jest.fn() }));
jest.mock('../../../src/features/exercises/customRepository', () => ({
  createCustomExercise: jest.fn(async () => 'new-id'),
  updateExercise: jest.fn(async () => undefined),
}));

const { getExerciseById } = jest.requireMock('../../../src/features/exercises/repository');
const { updateExercise, createCustomExercise } = jest.requireMock('../../../src/features/exercises/customRepository');
const { goBack } = jest.requireMock('../../../src/shared/navigation/goBack');

const tuckPlanche = {
  id: 'tuck-planche', name: 'Tuck Planche', aliases: '[]', metric: 'time', category: 'skill', extraCategories: '[]',
  movementPattern: 'horizontal-push', primaryMuscles: '[]', secondaryMuscles: '[]', equipment: '["floor","parallettes"]',
  unilateral: false, chainId: 'planche-progression', level: 2, leverageFactor: null,
  cues: '["Lean forward","Protract the shoulders"]', demoUrl: null, isCustom: false, favourite: false, archived: false,
  movementTag: null, movementGroup: 'horizontal-push', createdAt: new Date(),
};

const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };
const renderForm = () => render(<SafeAreaProvider initialMetrics={metrics}><ThemeProvider><NewExerciseRoute /></ThemeProvider></SafeAreaProvider>);
const t = (key: string) => i18n.t(key);
const chip = (label: string) => screen.getAllByRole('button', { name: label })[0];

beforeAll(async () => { await i18n.changeLanguage('en'); });
beforeEach(() => {
  jest.clearAllMocks();
  delete mockParams.edit;
  delete mockParams.addTo;
});

const extraChip = (key: string) => screen.getByRole('button', { name: `${t('customExercise.extraCategories')}: ${t(key)}` });
const mainChip = (key: string) => screen.getByRole('button', { name: `${t('customExercise.category')}: ${t(key)}` });
const save = () => fireEvent.press(screen.getByRole('button', { name: t('common.save') }));

describe('edit exercise', () => {
  it('saves added categories, movement group and tag of a catalog exercise', async () => {
    mockParams.edit = 'tuck-planche';
    getExerciseById.mockResolvedValue(tuckPlanche);
    renderForm();
    await screen.findByDisplayValue('Tuck Planche');

    fireEvent.press(extraChip('library.category.push'));
    fireEvent.press(extraChip('library.category.core'));
    fireEvent.press(chip(t('movement.groups.vertical-push')));
    fireEvent.changeText(screen.getByLabelText(t('movement.searchTags')), 'shoulder fl');
    fireEvent.press(chip('Shoulder flexion'));
    save();

    await waitFor(() => expect(updateExercise).toHaveBeenCalledTimes(1));
    expect(updateExercise).toHaveBeenCalledWith('tuck-planche', {
      name: 'Tuck Planche',
      metric: 'time',
      category: 'skill',
      extraCategories: ['push', 'core'],
      equipment: ['floor', 'parallettes'],
      cues: ['Lean forward', 'Protract the shoulders'],
      demoUrl: null,
      movementTag: 'Shoulder flexion',
      movementTags: ['Shoulder flexion'],
      movementGroup: 'vertical-push',
    });
    expect(goBack).toHaveBeenCalled();
  });

  it('removes a category when it is tapped again', async () => {
    mockParams.edit = 'tuck-planche';
    getExerciseById.mockResolvedValue({ ...tuckPlanche, extraCategories: '["push","pull"]' });
    renderForm();
    await screen.findByDisplayValue('Tuck Planche');

    fireEvent.press(extraChip('library.category.pull'));
    save();

    await waitFor(() => expect(updateExercise).toHaveBeenCalledTimes(1));
    expect(updateExercise.mock.calls[0][1].extraCategories).toEqual(['push']);
  });

  it('turns the old main category into an extra when promoting an extra to main', async () => {
    mockParams.edit = 'tuck-planche';
    getExerciseById.mockResolvedValue({ ...tuckPlanche, extraCategories: '["push"]' });
    renderForm();
    await screen.findByDisplayValue('Tuck Planche');

    fireEvent.press(mainChip('library.category.push'));
    save();

    await waitFor(() => expect(updateExercise).toHaveBeenCalledTimes(1));
    expect(updateExercise.mock.calls[0][1]).toMatchObject({ category: 'push', extraCategories: ['skill'] });
  });

  it('keeps an exercise with unknown stored values editable', async () => {
    mockParams.edit = 'odd';
    getExerciseById.mockResolvedValue({ ...tuckPlanche, id: 'odd', category: 'legacy', extraCategories: '["pull","legacy"]', movementGroup: 'rotation', movementTag: 'Made up tag' });
    renderForm();
    await screen.findByDisplayValue('Tuck Planche');

    save();

    await waitFor(() => expect(updateExercise).toHaveBeenCalledTimes(1));
    expect(updateExercise.mock.calls[0][1]).toMatchObject({ category: 'pull', extraCategories: [], movementGroup: null, movementTag: null });
  });

  it('shows a message instead of silently doing nothing when the form is invalid', async () => {
    mockParams.edit = 'tuck-planche';
    getExerciseById.mockResolvedValue(tuckPlanche);
    renderForm();
    await screen.findByDisplayValue('Tuck Planche');

    fireEvent.changeText(screen.getByLabelText(t('customExercise.name')), '');
    save();

    expect(await screen.findByText(t('customExercise.errors.name'))).toBeTruthy();
    expect(updateExercise).not.toHaveBeenCalled();
  });

  it('shows the save error when the database rejects the change', async () => {
    mockParams.edit = 'tuck-planche';
    getExerciseById.mockResolvedValue(tuckPlanche);
    updateExercise.mockRejectedValueOnce(new Error('disk full'));
    renderForm();
    await screen.findByDisplayValue('Tuck Planche');

    save();

    // The reason is shown too, so a failure on a phone can be reported and fixed.
    expect(await screen.findByText(`${t('customExercise.errors.save')} (disk full)`)).toBeTruthy();
    expect(goBack).not.toHaveBeenCalled();
  });

  it('only lists movement tags that match the search, plus the selected one', async () => {
    mockParams.edit = 'tuck-planche';
    getExerciseById.mockResolvedValue({ ...tuckPlanche, movementTag: 'Hip flexion' });
    renderForm();
    await screen.findByDisplayValue('Tuck Planche');

    expect(screen.queryByRole('button', { name: 'Wrist extension' })).toBeNull();
    expect(chip('Hip flexion')).toBeTruthy();
    fireEvent.changeText(screen.getByLabelText(t('movement.searchTags')), 'wrist');
    expect(chip('Wrist extension')).toBeTruthy();
  });

  it('creates a new exercise with extra categories', async () => {
    renderForm();
    fireEvent.changeText(screen.getByLabelText(t('customExercise.name')), 'Pseudo planche push-up');
    fireEvent.press(extraChip('library.category.skill'));
    save();

    await waitFor(() => expect(createCustomExercise).toHaveBeenCalledTimes(1));
    expect(createCustomExercise.mock.calls[0][0]).toMatchObject({ name: 'Pseudo planche push-up', category: 'push', extraCategories: ['skill'] });
  });

  it('saves biceps or triceps as the main category, keeping the old one as an extra when promoted', async () => {
    mockParams.edit = 'tuck-planche';
    getExerciseById.mockResolvedValue({ ...tuckPlanche, extraCategories: '["triceps"]' });
    renderForm();
    await screen.findByDisplayValue('Tuck Planche');

    fireEvent.press(mainChip('library.category.triceps'));
    fireEvent.press(extraChip('library.category.biceps'));
    save();

    await waitFor(() => expect(updateExercise).toHaveBeenCalledTimes(1));
    expect(updateExercise.mock.calls[0][1]).toMatchObject({ category: 'triceps', extraCategories: ['skill', 'biceps'] });
  });
});

