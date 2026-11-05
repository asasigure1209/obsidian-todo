import { Notice } from "obsidian";
import type { Alarm, Notifier } from "@/domain/notifier";

/** Obsidian 内の通知。数秒で消える */
export const noticeNotifier: Notifier = {
  notify: (message) => {
    new Notice(message);
  },
};

/** OS の通知に出す名前（manifest.json の name） */
const APP_NAME = "Daily Kanban TODO";
const BEEP_SECONDS = 0.6;

/**
 * 25分の満了の知らせ。Obsidian が背面にあっても気づけるよう、次の3つで知らせる（design 8.1）
 * - クリックするまで消えない Obsidian 内の通知
 * - OS の通知（macOS の通知センターなど）
 * - 短い音
 */
export const expiryAlarm: Alarm = {
  ring: (message) => {
    // 表示の時間を 0 にすると、クリックするまで消えない
    new Notice(message, 0);
    showSystemNotification(message);
    beep();
  },
  prepare: () => {
    // 満了のときは本人が画面を見ていないことが多いので、計測を始めたときに許可を尋ねておく
    if (typeof Notification !== "undefined" && Notification.permission === "default") {
      void Notification.requestPermission();
    }
  },
};

/** 許可されていれば出す。許可は prepare で尋ねてある */
function showSystemNotification(message: string): void {
  if (typeof Notification !== "undefined" && Notification.permission === "granted") {
    notifyNow(message);
  }
}

/** 通知をクリックすると Obsidian を前面に出す */
function notifyNow(message: string): void {
  const notification = new Notification(APP_NAME, { body: message });
  notification.onclick = () => {
    window.focus();
  };
}

/** 音声ファイルを同梱せず、ブラウザの音声機能で短い音を鳴らす */
function beep(): void {
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
}
