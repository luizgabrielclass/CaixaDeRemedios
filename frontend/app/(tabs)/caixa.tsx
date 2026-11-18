import { Ionicons } from "@react-native-vector-icons/ionicons";
import React from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { BoxSummaryCard, RecentHistoryCard } from "@/src/components/BoxCards";
import { NotifPermissionCard } from "@/src/components/NotifPermissionCard";
import { SyncBanner } from "@/src/components/SyncBanner";
import { useToast } from "@/src/components/Toast";
import { Card, IconName, InfoRow, ScreenHeader, SectionTitle, haptic } from "@/src/components/ui";
import { ConnectionChip } from "@/src/components/ConnectionChip";
import { DEVICE_ID, MQTT_PREFIX, MQTT_WS_URL } from "@/src/config";
import { proximaDose } from "@/src/lib/schedule";
import { fmtDateTime, fmtTime, parseIso } from "@/src/lib/time";
import { usesNativeTabs } from "@/src/navigation";
import { useApp, useConexao } from "@/src/store/AppStore";
import { makeStyles, useTheme } from "@/src/theme";

export default function Caixa() {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const { state, agenda, enviarComando, reenviar, reconectar } = useApp();
  const conexao = useConexao();
  const bottomChrome = usesNativeTabs ? insets.bottom : 0;
  const { device, mqtt, sync } = state;
  const st = device.status;
  const prox = proximaDose(agenda);
  const proxInfo = st?.proxima_dose_info ?? (typeof st?.proxima_dose === "object" ? st?.proxima_dose : null);
  const proxCaixa = proxInfo?.data_hora_programada ? parseIso(proxInfo.data_hora_programada) : null;
  const proxCaixaTxt = proxCaixa ? `${proxInfo?.nome ?? ""} ${fmtTime(proxCaixa)}`.trim() : typeof st?.proxima_dose === "string" ? `${st.proxima_dose} (agenda fixa)` : "—";
  const wifiOk = st?.wifi === true || st?.wifi === "CONECTADO";
  const relogioOk = st?.relogio ? st.relogio === "OK" : st?.hora_sincronizada !== false;
  const fila = st?.fila ?? st?.fila_pendente;
  const okColor = colors.successText;
  const badColor = colors.errorText;
  const podeComandar = mqtt === "conectado" && device.online !== false;

  const cmd = (c: string, msg: string) => {
    if (!podeComandar) {
      toast("Caixa indisponível: sem conexão MQTT", "erro");
      return;
    }
    if (enviarComando(c)) {
      haptic("success");
      toast(msg, "ok");
    } else toast("Falha ao enviar comando", "erro");
  };

  const acoes: { id: string; icon: IconName; label: string; sub: string; fn: () => void }[] = [
    { id: "test-buzzer", icon: "volume-high-outline", label: "Testar buzzer", sub: "Toca por 2 s (fora de alarme)", fn: () => cmd("TESTE_BUZZER", "Comando TESTE_BUZZER enviado") },
    { id: "test-led", icon: "bulb-outline", label: "Testar LED", sub: "Pisca por 3 s (fora de alarme)", fn: () => cmd("TESTE_LED", "Comando TESTE_LED enviado") },
    { id: "manual-reminder", icon: "notifications-outline", label: "Lembrete manual", sub: 'Comando legado {"cmd":"LEMBRETE"}', fn: () => cmd("LEMBRETE", "Lembrete enviado à caixa") },
    { id: "refresh-status", icon: "refresh-outline", label: "Atualizar estado", sub: "Solicita STATUS e eventos pendentes", fn: () => {
        cmd("STATUS", "Estado solicitado");
        enviarComando("SINCRONIZAR", { desde_seq: state.lastSeq });
      } },
    { id: "resend-schedule", icon: "cloud-upload-outline", label: "Reenviar programação", sub: "Gera nova versão e envia", fn: () => {
        reenviar();
        toast("Nova versão da programação na fila de envio", "info");
      } },
    { id: "reconnect", icon: "swap-horizontal-outline", label: "Reconectar ao broker", sub: MQTT_WS_URL, fn: () => {
        reconectar();
        toast("Tentando reconectar…", "info");
      } },
  ];

  const estadoTxt = st?.estado === "DOSE_ATRASADA" ? "Dose atrasada" : st?.estado === "HORA_DA_DOSE" ? "Hora da dose" : st?.estado ? "Em espera" : "";
  const alarmeTxt = st?.alarme === "CONFIRMANDO" || st?.alarme === "TAMPA_ABERTA" ? "Tampa aberta (contando 5 s)" : st?.alarme === "TOCANDO" ? `Tocando${estadoTxt ? " · " + estadoTxt : ""}` : st?.alarme ? "Inativo" : estadoTxt || "—";

  return (
    <View style={s.root}>
      <ScreenHeader title="Caixa" subtitle={`Dispositivo ${DEVICE_ID}`} right={<ConnectionChip testID="box-connection-chip" />} testID="box-screen-title" />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: bottomChrome + 24 }}>
        <SyncBanner />

        <BoxSummaryCard />

        <RecentHistoryCard />

        <SectionTitle title="Estado do dispositivo" />
        <Card style={{ paddingVertical: 4 }}>
          <InfoRow icon="hardware-chip-outline" label="ESP32" value={device.online === true ? "Online" : device.online === false ? "Offline" : "Desconhecido"} valueColor={device.online ? okColor : device.online === false ? badColor : undefined} testID="box-esp32-state" />
          <InfoRow icon="wifi-outline" label="Wi-Fi" value={device.online && st ? `${wifiOk ? "Conectado" : "Desconectado"}${typeof st.rssi === "number" ? ` (${st.rssi} dBm)` : ""}` : device.online === false ? "Sem dados" : "—"} testID="box-wifi-state" />
          <InfoRow icon="git-network-outline" label="MQTT da caixa" value={device.online ? "Conectado" : device.online === false ? "Desconectado" : "—"} valueColor={device.online ? okColor : device.online === false ? badColor : undefined} testID="box-mqtt-device-state" />
          <InfoRow icon="phone-portrait-outline" label="MQTT do app" value={mqtt === "conectado" ? "Conectado" : mqtt === "conectando" ? "Conectando…" : "Desconectado"} valueColor={mqtt === "conectado" ? okColor : mqtt === "desconectado" ? badColor : undefined} testID="box-mqtt-app-state" />
          <InfoRow icon="cube-outline" label="Tampa" value={device.tampa ?? "—"} valueColor={device.tampa === "ABERTA" ? colors.warningText : undefined} testID="box-lid-state" />
          <InfoRow icon="alarm-outline" label="Alarme" value={alarmeTxt} testID="box-alarm-state" />
          <InfoRow icon="time-outline" label="Relógio (NTP)" value={!st ? "—" : relogioOk ? "Sincronizado" : "Sem relógio"} valueColor={st && !relogioOk ? badColor : undefined} />
          <InfoRow icon="code-slash-outline" label="Firmware" value={st?.fw ?? st?.firmware ?? "—"} testID="box-firmware" last />
        </Card>

        <SectionTitle title="Programação" />
        <Card style={{ paddingVertical: 4 }}>
          <InfoRow icon="alarm" label="Próxima dose (app)" value={prox ? `${prox.med.nome} · ${fmtDateTime(prox.dose.epoch)}` : "—"} testID="box-next-dose-app" />
          <InfoRow icon="hardware-chip" label="Próxima dose (caixa)" value={proxCaixaTxt} testID="box-next-dose-device" />
          <InfoRow icon="cloud-done-outline" label="Última sincronização" value={sync.ultimaSync ? fmtDateTime(sync.ultimaSync) : "Nunca"} testID="box-last-sync" />
          <InfoRow icon="layers-outline" label="Versão app / caixa" value={`v${sync.versao} / ${st?.versao !== undefined ? "v" + st.versao : "—"}`} testID="box-version" />
          <InfoRow icon="list-outline" label="Doses na caixa" value={st?.doses_pendentes !== undefined ? `${st.doses_pendentes} pendente(s) de ${st.total_doses ?? 0}` : "—"} testID="box-device-doses" />
          <InfoRow icon="file-tray-full-outline" label="Eventos pendentes (fila offline)" value={fila !== undefined ? `${fila}${st?.descartados ? ` · ${st.descartados} descartado(s)` : ""}` : "—"} testID="box-pending-events" last />
        </Card>

        <SectionTitle title="Ações" />
        <Card style={{ paddingVertical: 4 }}>
          {acoes.map((a, i) => (
            <Pressable key={a.id} testID={`box-action-${a.id}`} onPress={a.fn} style={({ pressed }) => [s.action, i > 0 && s.actionBorder, pressed && { opacity: 0.6 }]}>
              <View style={s.actionIcon}>
                <Ionicons name={a.icon} size={18} color={colors.brandPrimary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.actionLabel}>{a.label}</Text>
                <Text style={s.actionSub} numberOfLines={1}>
                  {a.sub}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.borderStrong} />
            </Pressable>
          ))}
        </Card>

        <NotifPermissionCard alwaysShow />

        <SectionTitle title="Atividade recente" />
        <Card style={{ paddingVertical: 8 }}>
          {state.logs.length === 0 ? <Text style={s.muted}>Sem atividade.</Text> : null}
          {state.logs.slice(0, 15).map((l) => (
            <View key={l.id} style={s.log}>
              <View style={[s.logDot, { backgroundColor: l.nivel === "ok" ? colors.success : l.nivel === "erro" ? colors.error : l.nivel === "aviso" ? colors.warning : colors.info }]} />
              <Text style={s.logText}>{l.texto}</Text>
              <Text style={s.logTime}>{fmtTime(l.ts)}</Text>
            </View>
          ))}
        </Card>

        <View testID="box-security-note" style={s.note}>
          <Ionicons name="shield-outline" size={16} color={colors.muted} />
          <Text style={s.noteText}>
            Broker público ({MQTT_WS_URL.replace(/^wss?:\/\//, "")}) sem autenticação, tópico {MQTT_PREFIX}. Adequado para protótipo; em produção use broker privado com usuário/senha e TLS. Estado: {conexao.texto}.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.canvas },
  action: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 56, paddingVertical: 8 },
  actionBorder: { borderTopWidth: 1, borderTopColor: c.divider },
  actionIcon: { width: 34, height: 34, borderRadius: 10, backgroundColor: c.brandTertiary, alignItems: "center", justifyContent: "center" },
  actionLabel: { fontSize: 15, fontWeight: "600", color: c.onSurface },
  actionSub: { fontSize: 12, color: c.muted, marginTop: 1 },
  muted: { fontSize: 14, color: c.muted, paddingVertical: 8 },
  log: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 6 },
  logDot: { width: 8, height: 8, borderRadius: 4 },
  logText: { flex: 1, fontSize: 13, color: c.onSurfaceSecondary },
  logTime: { fontSize: 12, color: c.muted, fontVariant: ["tabular-nums"] },
  note: { flexDirection: "row", gap: 8, marginTop: 16, paddingHorizontal: 4 },
  noteText: { flex: 1, fontSize: 12, color: c.muted, lineHeight: 17 },
}));
