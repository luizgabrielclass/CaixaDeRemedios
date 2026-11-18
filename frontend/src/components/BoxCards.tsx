import { Ionicons } from "@react-native-vector-icons/ionicons";
import { useRouter } from "expo-router";
import React from "react";
import { Text, View } from "react-native";

import { fmtAtraso, fmtDate, fmtTime } from "../lib/time";
import { useApp } from "../store/AppStore";
import { makeStyles, useTheme } from "../theme";
import { Card, SectionTitle } from "./ui";

// Resumo da caixa inteligente (estado, tampa, sinal)
export function BoxSummaryCard() {
  const s = useStyles();
  const { state } = useApp();
  const dev = state.device;
  const st = dev.status;
  const caixaTexto = dev.online === false ? "Offline" : st?.alarme === "CONFIRMANDO" || st?.alarme === "TAMPA_ABERTA" ? "Confirmando abertura" : st?.estado === "DOSE_ATRASADA" ? "Dose atrasada" : st?.estado === "HORA_DA_DOSE" || st?.alarme === "TOCANDO" ? "Hora da dose" : dev.online ? "Em espera" : "Desconhecido";
  return (
    <>
      <SectionTitle title="Caixa inteligente" />
      <Card testID="box-state-card">
        <View style={s.boxRow}>
          <View style={s.boxItem}>
            <Text style={s.boxLabel}>Estado</Text>
            <Text testID="box-state-value" style={s.boxValue}>
              {caixaTexto}
            </Text>
          </View>
          <View style={s.boxItem}>
            <Text style={s.boxLabel}>Tampa</Text>
            <Text testID="box-lid-value" style={s.boxValue}>
              {dev.tampa ?? "—"}
            </Text>
          </View>
          <View style={s.boxItem}>
            <Text style={s.boxLabel}>Wi-Fi/MQTT</Text>
            <Text style={s.boxValue}>{dev.online ? (typeof dev.status?.rssi === "number" ? `${dev.status.rssi} dBm` : "OK") : "—"}</Text>
          </View>
        </View>
      </Card>
    </>
  );
}

// Últimas administrações confirmadas pela caixa
export function RecentHistoryCard() {
  const s = useStyles();
  const { colors } = useTheme();
  const router = useRouter();
  const { state } = useApp();
  return (
    <>
      <SectionTitle title="Últimas administrações" action="Ver tudo" onAction={() => router.push("/historico")} testID="recent-history-link" />
      <Card style={{ paddingVertical: 4 }}>
        {state.history.length === 0 ? (
          <Text testID="recent-history-empty" style={s.emptyHist}>
            Nenhuma dose confirmada pela caixa ainda.
          </Text>
        ) : (
          state.history.slice(0, 4).map((h, idx) => (
            <View key={h.key} testID={`recent-history-item-${idx}`} style={[s.histRow, idx > 0 && s.histBorder]}>
              <Ionicons name={h.status === "TOMADA" ? "checkmark-circle" : "alert-circle"} size={22} color={h.status === "TOMADA" ? colors.success : colors.error} />
              <View style={{ flex: 1 }}>
                <Text style={s.histName}>{h.nome}</Text>
                <Text style={s.histSub}>
                  {h.programadaEm ? `Programada ${fmtDate(h.programadaEm)} ${fmtTime(h.programadaEm)}` : h.origem === "REMOTO" ? "Lembrete remoto" : h.horario ? `Agenda fixa ${h.horario}` : "Lembrete"}
                  {h.status === "TOMADA" ? ` · ${fmtAtraso(h.atrasoMin)}` : " · não confirmada"}
                </Text>
              </View>
              <Text style={s.histTime}>{h.confirmadaEm ? fmtTime(h.confirmadaEm) : "—"}</Text>
            </View>
          ))
        )}
      </Card>
    </>
  );
}

const useStyles = makeStyles((c) => ({
  boxRow: { flexDirection: "row" },
  boxItem: { flex: 1 },
  boxLabel: { fontSize: 12, color: c.muted },
  boxValue: { fontSize: 15, fontWeight: "700", color: c.onSurface, marginTop: 2 },
  emptyHist: { fontSize: 14, color: c.muted, paddingVertical: 16, textAlign: "center" },
  histRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12 },
  histBorder: { borderTopWidth: 1, borderTopColor: c.divider },
  histName: { fontSize: 15, fontWeight: "700", color: c.onSurface },
  histSub: { fontSize: 12, color: c.muted, marginTop: 2 },
  histTime: { fontSize: 15, fontWeight: "700", color: c.onSurface },
}));
