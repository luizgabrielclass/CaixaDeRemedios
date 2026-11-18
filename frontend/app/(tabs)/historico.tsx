import { Ionicons } from "@react-native-vector-icons/ionicons";
import React, { useMemo, useState } from "react";
import { RefreshControl, SectionList, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { StatusBadge } from "@/src/components/StatusBadge";
import { EmptyState, ScreenHeader } from "@/src/components/ui";
import { dayKey, dayLabel, fmtAtraso, fmtDate, fmtTime } from "@/src/lib/time";
import { usesNativeTabs } from "@/src/navigation";
import { useApp } from "@/src/store/AppStore";
import { makeStyles, useTheme } from "@/src/theme";
import { HistoryEntry } from "@/src/types";

type Linha = HistoryEntry & { semEvento?: boolean };

export default function Historico() {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { state, agenda, enviarComando } = useApp();
  const [refreshing, setRefreshing] = useState(false);
  const bottomChrome = usesNativeTabs ? insets.bottom : 0;

  const secoes = useMemo(() => {
    const conhecidos = new Set(state.history.map((h) => h.doseId));
    // Doses vencidas sem nenhum evento da caixa aparecem como "sem confirmação"
    const semEvento: Linha[] = agenda
      .filter((i) => i.status === "ATRASADA" && !conhecidos.has(i.dose.id))
      .map((i) => ({
        key: "late_" + i.dose.id,
        doseId: i.dose.id,
        medicationId: i.med.id,
        nome: i.med.nome,
        dosagem: i.med.dosagem,
        programadaEm: i.dose.epoch,
        confirmadaEm: null,
        status: "PERDIDA",
        atrasoMin: 0,
        origem: "AGENDA",
        seq: null,
        semEvento: true,
      }));
    const todas: Linha[] = [...state.history, ...semEvento].sort((a, b) => (b.confirmadaEm ?? b.programadaEm ?? 0) - (a.confirmadaEm ?? a.programadaEm ?? 0));
    const map = new Map<string, Linha[]>();
    for (const h of todas) {
      const k = dayKey(h.confirmadaEm ?? h.programadaEm ?? 0);
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(h);
    }
    return [...map.entries()].map(([key, data]) => ({ key, title: dayLabel(key, state.now), data }));
  }, [state.history, agenda, state.now]);

  const onRefresh = () => {
    setRefreshing(true);
    enviarComando("SINCRONIZAR", { desde_seq: state.lastSeq });
    setTimeout(() => setRefreshing(false), 1200);
  };

  return (
    <View style={s.root}>
      <ScreenHeader title="Histórico" subtitle={`${state.history.filter((h) => h.status === "TOMADA").length} dose(s) confirmada(s)`} testID="history-screen-title" />
      <View testID="history-disclaimer" style={s.disclaimer}>
        <Ionicons name="information-circle" size={18} color={colors.warningText} />
        <Text style={s.disclaimerText}>A caixa confirma a abertura da tampa por 5 s, não a ingestão efetiva do medicamento.</Text>
      </View>
      <SectionList
        testID="history-list"
        sections={secoes}
        keyExtractor={(h) => h.key}
        stickySectionHeadersEnabled
        contentContainerStyle={{ paddingBottom: bottomChrome + 24 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brandPrimary} />}
        renderSectionHeader={({ section }) => <Text style={s.secTitle}>{section.title}</Text>}
        renderItem={({ item: h, index, section }) => (
          <View testID={`history-item-${h.key}`} style={[s.row, index === 0 && s.first, index === section.data.length - 1 && s.last, index > 0 && s.border]}>
            <View style={s.rowTop}>
              <Text style={s.name} numberOfLines={1}>
                {h.nome} {h.dosagem ? <Text style={s.dosage}>{h.dosagem}</Text> : null}
              </Text>
              <StatusBadge status={h.status === "TOMADA" ? "TOMADA" : "ATRASADA"} />
            </View>
            <View style={s.cols}>
              <View style={s.col}>
                <Text style={s.colLabel}>Programada</Text>
                <Text style={s.colValue}>{h.programadaEm ? `${fmtDate(h.programadaEm)} ${fmtTime(h.programadaEm)}` : h.origem === "REMOTO" ? "Lembrete remoto" : h.horario ? `Agenda fixa ${h.horario}` : "Lembrete"}</Text>
              </View>
              <View style={s.col}>
                <Text style={s.colLabel}>Confirmação</Text>
                <Text style={s.colValue}>{h.confirmadaEm ? fmtTime(h.confirmadaEm) : "—"}</Text>
              </View>
            </View>
            <Text style={[s.atraso, { color: h.status !== "TOMADA" ? colors.errorText : h.atrasoMin > 30 ? colors.warningText : colors.successText }]}>
              {h.status === "TOMADA" ? `${fmtAtraso(h.atrasoMin)} · abertura confirmada pela caixa` : h.semEvento ? "Sem confirmação da caixa" : "Caixa registrou dose não confirmada"}
            </Text>
          </View>
        )}
        ListEmptyComponent={<EmptyState testID="history-empty" icon="time-outline" title="Nenhum histórico registrado ainda" text="Quando a tampa ficar aberta por 5 segundos durante um alarme, a caixa envia a confirmação para cá." />}
      />
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.canvas },
  disclaimer: { flexDirection: "row", gap: 8, alignItems: "center", backgroundColor: c.warningSoft, marginHorizontal: 16, marginTop: 12, borderRadius: 12, padding: 12 },
  disclaimerText: { flex: 1, fontSize: 13, color: c.warningText, fontWeight: "600" },
  secTitle: { fontSize: 17, fontWeight: "800", color: c.onSurface, backgroundColor: c.canvas, paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8 },
  row: { marginHorizontal: 16, backgroundColor: c.surface, padding: 16, gap: 8 },
  first: { borderTopLeftRadius: 16, borderTopRightRadius: 16 },
  last: { borderBottomLeftRadius: 16, borderBottomRightRadius: 16 },
  border: { borderTopWidth: 1, borderTopColor: c.divider },
  rowTop: { flexDirection: "row", alignItems: "center", gap: 8 },
  name: { flex: 1, fontSize: 15, fontWeight: "700", color: c.onSurface },
  dosage: { fontWeight: "500", color: c.muted },
  cols: { flexDirection: "row" },
  col: { flex: 1 },
  colLabel: { fontSize: 12, color: c.muted },
  colValue: { fontSize: 14, fontWeight: "600", color: c.onSurface, marginTop: 2 },
  atraso: { fontSize: 12, fontWeight: "600" },
}));
