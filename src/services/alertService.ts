import * as Haptics from 'expo-haptics';

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

  /** Stop an in-progress alert burst (e.g. the user acknowledged it). */
  stop(): void {
    if (this.burst != null) clearInterval(this.burst);
    this.burst = null;
  }

  dispose(): void {
    this.stop();
  }
}
