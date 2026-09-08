import * as Haptics from 'expo-haptics';
import { Vibration } from 'react-native';

/**
 * Fires the "annoying" feedback on the phone when the wearable reports a
 * twitch: a burst of vibration. Ported from `lib/services/alert_service.dart`.
 *
 * This intentionally lives on the phone (which has a vibration motor) rather
 * than the wearable, whose only output is the NeoPixel. Expo Haptics has no
 * system-tone API, so the audible tone from the Flutter version is dropped for
 * now; swap in an `expo-av` clip here to make it louder/customizable later.
 */
export class AlertService {
  private burst: ReturnType<typeof setInterval> | null = null;
  enabled = true;

  async trigger(): Promise<void> {
    if (!this.enabled) return;
    this.buzz();
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    let count = 0;
    if (this.burst != null) clearInterval(this.burst);
    this.burst = setInterval(() => {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      if (++count >= 6 && this.burst != null) {
        clearInterval(this.burst);
        this.burst = null;
      }
    }, 300);
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
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }

  /** Stop an in-progress alert burst (e.g. the user acknowledged it). */
  stop(): void {
    if (this.burst != null) clearInterval(this.burst);
    this.burst = null;
    Vibration.cancel();
  }

  dispose(): void {
    this.stop();
  }
}
