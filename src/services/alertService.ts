import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import * as Haptics from 'expo-haptics';
import { Vibration } from 'react-native';

/** Phone feedback. Passive tracking disables both vibration and sound. */
export class AlertService {
  private burst: ReturnType<typeof setInterval> | null = null;
  private player: AudioPlayer | null = null;
  private soundGeneration = 0;
  private _enabled = true;
  private _soundEnabled = false;

  get enabled(): boolean { return this._enabled; }
  set enabled(value: boolean) {
    this._enabled = value;
    if (!value) this.stop();
  }

  get soundEnabled(): boolean { return this._soundEnabled; }
  set soundEnabled(value: boolean) {
    this._soundEnabled = value;
    if (!value) this.stopSound();
  }

  async trigger(): Promise<void> {
    if (!this.enabled) return;
    this.buzz();
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
    let count = 0;
    if (this.burst != null) clearInterval(this.burst);
    this.burst = setInterval(() => {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
      if (++count >= 6 && this.burst != null) {
        clearInterval(this.burst);
        this.burst = null;
      }
    }, 300);
    if (this.soundEnabled) {
      // An unavailable audio route must never interrupt event counting.
      try { await this.playSound(); }
      catch (error) { console.warn('Could not play the habit alert:', error); }
    }
  }

  /**
   * A single, unmistakable buzz of the phone's vibration motor. The Haptics
   * calls above are subtle on some devices, so we also drive `Vibration`
   * directly. On iOS the durations are ignored (each segment is a fixed buzz),
   * so this reads as a short double-pulse; on Android it honors the pattern.
   */
  private buzz(): void {
    Vibration.vibrate([0, 400, 150, 400]);
  }

  /** Fire a one-off test buzz regardless of the enabled flag (for a UI test). */
  test(): void {
    this.buzz();
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  }

  /** Explicit test bypasses preferences without changing tracking mode. */
  testSound(): Promise<void> {
    return this.playSound();
  }

  private async playSound(): Promise<void> {
    const generation = ++this.soundGeneration;
    await setAudioModeAsync({
      playsInSilentMode: false,
      shouldPlayInBackground: false,
      interruptionMode: 'mixWithOthers',
    });
    if (generation !== this.soundGeneration) return;
    const player = this.player ??= createAudioPlayer(require('../../assets/alert.wav'));
    if (!player.isLoaded) {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => {
          sub.remove();
          reject(new Error('Sound could not load. Try again after restarting the app.'));
        }, 5000);
        const sub = player.addListener('playbackStatusUpdate', (status) => {
          if (status.isLoaded) {
            clearTimeout(timer);
            sub.remove();
            resolve();
          }
        });
        if (player.isLoaded) {
          clearTimeout(timer);
          sub.remove();
          resolve();
        }
      });
    }
    if (generation !== this.soundGeneration) return;
    await player.seekTo(0);
    if (generation !== this.soundGeneration) return;
    player.play();
  }

  private stopSound(): void {
    this.soundGeneration++;
    this.player?.pause();
  }

  /** Stop an in-progress alert burst (e.g. the user acknowledged it). */
  stop(): void {
    if (this.burst != null) clearInterval(this.burst);
    this.burst = null;
    Vibration.cancel();
    this.stopSound();
  }

  dispose(): void {
    this.stop();
    this.player?.remove();
    this.player = null;
  }
}
