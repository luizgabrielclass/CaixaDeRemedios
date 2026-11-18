import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

import { TOLERANCIA_ATRASO_MIN } from "../config";
import { AgendaItem } from "../lib/schedule";
import { MIN, fmtTime } from "../lib/time";

// Notificações locais: complementares ao alarme físico da caixa.
// O agendamento fica no sistema operacional, então dispara com o app fechado.
const supported = Platform.OS !== "web";
const MAX_DOSES_AGENDADAS = 20; // 3 notificações por dose -> 60 (iOS limita a 64)

if (supported) {
  try {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
      }),
    });
  } catch {}
}

let channelReady = false;
async function ensureChannel() {
  if (Platform.OS !== "android" || channelReady) return;
  try {
    await Notifications.setNotificationChannelAsync("doses", {
      name: "Doses de medicamentos",
      importance: Notifications.AndroidImportance.HIGH,
      sound: "default",
      vibrationPattern: [0, 300, 200, 300],
    });
    channelReady = true;
  } catch {}
}

export type PermState = "granted" | "denied" | "undetermined" | "blocked" | "unsupported";

export async function getPermission(): Promise<PermState> {
  if (!supported) return "unsupported";
  try {
    const p = await Notifications.getPermissionsAsync();
    if (p.granted) return "granted";
    if (p.status === "undetermined") return "undetermined";
    return p.canAskAgain ? "denied" : "blocked";
  } catch {
    return "unsupported";
  }
}

export async function requestPermission(): Promise<PermState> {
  if (!supported) return "unsupported";
  try {
    await ensureChannel();
    const p = await Notifications.requestPermissionsAsync();
    if (p.granted) return "granted";
    return p.canAskAgain ? "denied" : "blocked";
  } catch {
    return "unsupported";
  }
}

export async function notificarAgora(title: string, body: string) {
  if (!supported) return;
  try {
    if ((await getPermission()) !== "granted") return;
    await ensureChannel();
    await Notifications.scheduleNotificationAsync({
      content: { title, body, sound: "default" },
      trigger: null,
    });
  } catch {}
}

/** Reprograma lembretes locais para as próximas doses em aberto. */
export async function reagendarDoses(items: AgendaItem[], now: number) {
  if (!supported) return;
  try {
    if ((await getPermission()) !== "granted") return;
    await ensureChannel();
    await Notifications.cancelAllScheduledNotificationsAsync();
    const futuras = items
      .filter((i) => (i.status === "AGENDADA" || i.status === "AGUARDANDO") && i.dose.epoch + TOLERANCIA_ATRASO_MIN * MIN > now)
      .slice(0, MAX_DOSES_AGENDADAS);
    for (const it of futuras) {
      const nome = `${it.med.nome} ${it.med.dosagem}`.trim();
      const hora = fmtTime(it.dose.epoch);
      const qtd = `${it.med.quantidade} unidade(s)`;
      const alvos: [number, string, string][] = [
        [it.dose.epoch - 10 * MIN, "Próxima dose em 10 min", `${nome} às ${hora} · ${qtd}`],
        [it.dose.epoch, "Hora do medicamento", `${nome} · ${qtd}. Abra a caixa por 5 segundos para confirmar.`],
        [it.dose.epoch + TOLERANCIA_ATRASO_MIN * MIN, "Dose atrasada", `${nome} das ${hora} ainda não foi confirmada pela caixa.`],
      ];
      for (const [when, title, body] of alvos) {
        if (when <= now + 5000) continue;
        await Notifications.scheduleNotificationAsync({
          content: { title, body, sound: "default", data: { doseId: it.dose.id } },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.DATE,
            date: new Date(when),
            channelId: "doses",
          },
        });
      }
    }
  } catch {}
}
