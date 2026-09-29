import { fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import i18n from '../../../shared/i18n';
import { ThemeProvider } from '../../../shared/theme/ThemeProvider';
import { ClassificationChoices } from '../ClassificationChoices';

jest.mock('react-native-keyboard-controller', () => jest.requireActual('react-native-keyboard-controller/jest'));

const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };
const t = (key: string) => i18n.t(key);
const onTagChange = jest.fn();
const onGroupChange = jest.fn();

const renderChoices = (movementTag: string | null = null) => render(
  <SafeAreaProvider initialMetrics={metrics}><ThemeProvider>
    <ClassificationChoices movementTag={movementTag} movementGroup={null} onTagChange={onTagChange} onGroupChange={onGroupChange} />
  </ThemeProvider></SafeAreaProvider>,
);
const section = (id: string) => screen.getByRole('button', { name: t(`movement.sections.${id}`) });

beforeAll(async () => { await i18n.changeLanguage('en'); });
beforeEach(() => jest.clearAllMocks());

describe('movement tag choices', () => {
  it('lists every region up front and shows its tags without searching', () => {
    renderChoices();
    for (const id of ['shoulder', 'elbow', 'hip', 'knee', 'cervical', 'thoracic', 'lumbar', 'spine']) expect(section(id)).toBeTruthy();

    fireEvent.press(section('spine'));
    for (const tag of ['spine_flexion', 'spine_extension', 'spine_side_flexion_bottom_to_top', 'spine_side_flexion_top_to_bottom', 'spine_rotation']) {
      expect(screen.getByRole('button', { name: t(`movement.tags.${tag}`) })).toBeTruthy();
    }
  });

  it('shows one region at a time and picks a tag with one tap', () => {
    renderChoices();
    fireEvent.press(section('thoracic'));
    expect(screen.queryByRole('button', { name: t('movement.tags.shoulder_flexion') })).toBeNull();
    fireEvent.press(screen.getByRole('button', { name: t('movement.tags.thoracic_side_flexion_top_to_bottom') }));
    expect(onTagChange).toHaveBeenCalledWith('Thoracic side flexion (top to bottom)');
  });

  it('opens the region of the selected tag and keeps the choice visible for removal', () => {
    renderChoices('Lumbar rotation');
    expect(screen.getByRole('button', { name: t('movement.tags.lumbar_flexion') })).toBeTruthy();
    fireEvent.press(screen.getAllByRole('button', { name: t('movement.tags.lumbar_rotation') })[0]);
    expect(onTagChange).toHaveBeenCalledWith(null);
  });

  it('still finds tags by search across all regions', () => {
    renderChoices();
    fireEvent.changeText(screen.getByPlaceholderText(t('movement.searchTags')), 'whole');
    expect(screen.queryByRole('button', { name: t('movement.tags.spine_rotation') })).toBeNull();
    fireEvent.changeText(screen.getByPlaceholderText(t('movement.searchTags')), 'spine rot');
    fireEvent.press(screen.getByRole('button', { name: t('movement.tags.spine_rotation') }));
    expect(onTagChange).toHaveBeenCalledWith('Spine rotation');
  });

  it('shows an old undirected tag only while it is selected', () => {
    renderChoices('Cervical side flexion');
    expect(screen.getAllByRole('button', { name: t('movement.tags.cervical_side_flexion') }).length).toBeGreaterThan(0);
  });
});
