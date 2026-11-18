import { Ionicons } from "@react-native-vector-icons/ionicons";
import React from "react";
import { Text, View } from "react-native";

import { TratamentoStatus } from "../lib/schedule";
import { ThemeColors, makeStyles, useTheme } from "../theme";
import { DoseStatus } from "../types";
import { IconName } from "./ui";

export function doseStyle(st: DoseStatus, c: ThemeColors): { bg: string; fg: string; label: string; icon: IconName } {
  switch (st) {
    case "TOMADA":
      return { bg: c.successSoft, fg: c.successText, label: "Tomada", icon: "checkmark-circle" };
    case "ATRASADA":
      return { bg: c.errorSoft, fg: c.errorText, label: "Atrasada", icon: "alert-circle" };
    case "EM_ANDAMENTO":
      return { bg: c.brandPrimary, fg: c.onBrandPrimary, label: "Em andamento", icon: "notifications" };
    case "AGUARDANDO":
      return { bg: c.warningSoft, fg: c.warningText, label: "Aguardando", icon: "hourglass-outline" };
    case "CANCELADA":
      return { bg: c.surfaceTertiary, fg: c.muted, label: "Cancelada", icon: "close-circle-outline" };
    default:
      return { bg: c.brandTertiary, fg: c.onBrandTertiary, label: "Agendada", icon: "time-outline" };
  }
}

export function StatusBadge({ status, testID }: { status: DoseStatus; testID?: string }) {
  const { colors } = useTheme();
  const s = useStyles();
  const st = doseStyle(status, colors);
  return (
    <View testID={testID} style={[s.badge, { backgroundColor: st.bg }]}>
      <Ionicons name={st.icon} size={12} color={st.fg} />
      <Text style={[s.text, { color: st.fg }]}>{st.label}</Text>
    </View>
  );
}

export function TratamentoBadge({ status, testID }: { status: TratamentoStatus; testID?: string }) {
  const { colors: c } = useTheme();
  const s = useStyles();
  const map = {
    ATIVO: [c.successSoft, c.successText, "Em tratamento"],
    NAO_INICIADO: [c.brandTertiary, c.onBrandTertiary, "Não iniciado"],
    CONCLUIDO: [c.surfaceTertiary, c.onSurfaceTertiary, "Concluído"],
    CANCELADO: [c.errorSoft, c.errorText, "Cancelado"],
  } as const;
  const [bg, fg, label] = map[status];
  return (
    <View testID={testID} style={[s.badge, { backgroundColor: bg }]}>
      <Text style={[s.text, { color: fg }]}>{label}</Text>
    </View>
  );
}

const useStyles = makeStyles(() => ({
  badge: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999, alignSelf: "flex-start" },
  text: { fontSize: 12, fontWeight: "700" },
}));
