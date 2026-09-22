export interface SoundOption {
  id: string;
  label: string;
  source: number;
}

export const SOUND_LIBRARY: SoundOption[] = [
  { id: 'chime', label: 'Chime', source: require('../../assets/sounds/chime.wav') },
  { id: 'alarm1', label: 'Alarm', source: require('../../assets/sounds/alarm1.mp3') },
];

export const DEFAULT_SOUND_ID = 'chime';

export function soundById(id: string): SoundOption {
  return (
    SOUND_LIBRARY.find((s) => s.id === id) ??
    SOUND_LIBRARY.find((s) => s.id === DEFAULT_SOUND_ID)!
  );
}
