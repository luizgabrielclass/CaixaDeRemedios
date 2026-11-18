import { Ionicons } from "@react-native-vector-icons/ionicons";
import React from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";

import { fmtDateTime } from "../lib/time";
import { useApp } from "../store/AppStore";
import { makeStyles, useTheme } from "../theme";
import { IconName } from "./ui";

// Resultado das operações de sincronização, exatamente como exigido:
// enviada / recebida (ACK) / recusada / offline / falha / pendente.
export function SyncBanner({ compact, testID = "sync-status-banner" }: { compact?: boolean; testID?: string }) {
  const { state, reenviar, reconectar } = useApp();
  const { colors: c } = useTheme();
  const s = useStyles();
  const { sync, device, mqtt } = state;

  let icon: IconName = "cloud-done-outline";
  let title = "Programação recebida pela caixa";
  let text = sync.ultimaSync ? `ACK em ${fmtDateTime(sync.ultimaSync)} · v${sync.versao}` : `Versão ${sync.versao}`;
  let bg: string = c.successSoft;
  let fg: string = c.successText;
  let action: { label: string; fn: () => void } | null = null;
  let busy = false;

  const offline = mqtt !== "conectado" || device.online === false;
  const divergente = sync.status === "SINCRONIZADA" && !!device.status?.programacao_id && device.status.programacao_id !== sync.programacaoId;

  if (divergente && !offline) {
    icon = "git-compare-outline";
    title = `A caixa tem outra programação (v${device.status?.versao ?? "?"})`;
    text = "Ela não corresponde aos medicamentos deste aparelho.";
    bg = c.warningSoft;
    fg = c.warningText;
    action = { label: "Enviar a do app", fn: reenviar };
  } else if (sync.status === "ENVIANDO" || sync.status === "ENVIADA") {
    busy = true;
    icon = "cloud-upload-outline";
    title = sync.status === "ENVIADA" ? "Programação enviada · aguardando ACK" : "Enviando programação…";
    text = `Parte ${sync.partesEnviadas}/${sync.partesTotal} · ${sync.dosesEnviadas} dose(s) · v${sync.versao}`;
    bg = c.brandTertiary;
    fg = c.onBrandTertiary;
  } else if (sync.status === "RECUSADA") {
    icon = "close-circle-outline";
    title = "Programação recusada pela caixa";
    text = sync.motivo ?? "";
    bg = c.errorSoft;
    fg = c.errorText;
    action = { label: "Tentar de novo", fn: reenviar };
  } else if (sync.status === "FALHA") {
    icon = "warning-outline";
    title = "Falha de comunicação";
    text = `${sync.motivo ?? "Sem confirmação"} · alterações mantidas como pendentes`;
    bg = c.errorSoft;
    fg = c.errorText;
    action = { label: "Tentar de novo", fn: reenviar };
  } else if (sync.status === "PENDENTE") {
    icon = "sync-outline";
    title = offline ? (mqtt !== "conectado" ? "Sem conexão · sincronização pendente" : "Caixa offline · sincronização pendente") : "Sincronização pendente";
    text = offline ? "As alterações serão enviadas quando a conexão voltar." : `Versão ${sync.versao} aguardando envio`;
    bg = c.warningSoft;
    fg = c.warningText;
    if (mqtt !== "conectado") action = { label: "Reconectar", fn: reconectar };
  } else if (offline) {
    icon = "cloud-offline-outline";
    title = mqtt !== "conectado" ? "Sem conexão com o broker" : "Dispositivo offline";
    text = "A caixa continua alarmando com a programação local.";
    bg = c.errorSoft;
    fg = c.errorText;
    if (mqtt !== "conectado") action = { label: "Reconectar", fn: reconectar };
  }
  if (sync.status === "SINCRONIZADA" && sync.parcial && !offline) text += " · parcial (limite da caixa)";

  return (
    <View testID={testID} style={[s.box, { backgroundColor: bg }, compact && { padding: 12 }]}>
      {busy ? <ActivityIndicator color={fg} /> : <Ionicons name={icon} size={22} color={fg} />}
      <View style={{ flex: 1 }}>
        <Text testID={`${testID}-title`} style={[s.title, { color: fg }]}>
          {title}
        </Text>
        {text ? (
          <Text style={[s.text, { color: fg }]} numberOfLines={2}>
            {text}
          </Text>
        ) : null}
      </View>
      {action ? (
        <Pressable testID={`${testID}-retry`} onPress={action.fn} style={[s.action, { borderColor: fg }]}>
          <Text style={[s.actionText, { color: fg }]}>{action.label}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const useStyles = makeStyles(() => ({
  box: { flexDirection: "row", alignItems: "center", gap: 12, padding: 16, borderRadius: 16 },
  title: { fontSize: 14, fontWeight: "700" },
  text: { fontSize: 12, marginTop: 2, opacity: 0.9 },
  action: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, height: 34, justifyContent: "center" },
  actionText: { fontSize: 13, fontWeight: "700" },
}));
