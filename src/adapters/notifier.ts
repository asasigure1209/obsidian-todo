import { Notice } from "obsidian";
import type { Alarm, Notifier } from "@/domain/notifier";

/** Obsidian 内の通知 */
export const noticeNotifier: Notifier = {
  notify: (message) => {
    new Notice(message);
  },
};

const BEEP_SECONDS = 0.6;

/** 音声ファイルを同梱せず、ブラウザの音声機能で短い音を鳴らす（architecture 6章） */
export const beepAlarm: Alarm = {
  ring: () => {
    const context = new AudioContext();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.frequency.value = 880;
    gain.gain.setValueAtTime(0.2, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + BEEP_SECONDS);
    oscillator.connect(gain).connect(context.destination);
    oscillator.onended = () => {
      void context.close();
    };
    oscillator.start();
    oscillator.stop(context.currentTime + BEEP_SECONDS);
  },
};
