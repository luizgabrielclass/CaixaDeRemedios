import { useRouter } from "expo-router";
import React, { useMemo, useState } from "react";
import { Pressable, ScrollView, SectionList, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { DoseRow } from "@/src/components/DoseRow";
import { EmptyState, ScreenHeader } from "@/src/components/ui";
import { AgendaItem, agruparPorDia, isAberta, statusTratamento } from "@/src/lib/schedule";
import { dayKey, keyToBr } from "@/src/lib/time";
import { usesNativeTabs } from "@/src/navigation";
import { useApp } from "@/src/store/AppStore";
import { makeStyles } from "@/src/theme";

type Filtro = "proximas" | "hoje" | "tomadas" | "atrasadas" | "encerrados" | "todas";
const FILTROS: { key: Filtro; label: string }[] = [
  { key: "proximas", label: "Próximas" },
  { key: "hoje", label: "Hoje" },
  { key: "atrasadas", label: "Atrasadas" },
  { key: "tomadas", label: "Tomadas" },
  { key: "encerrados", label: "Encerrados" },
  { key: "todas", label: "Todas" },
];

export default function Agenda() {
  const s = useStyles();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { state, agenda } = useApp();
  const [filtro, setFiltro] = useState<Filtro>("proximas");
  const bottomChrome = usesNativeTabs ? insets.bottom : 0;

  const secoes = useMemo(() => {
    const hoje = dayKey(state.now);
    const pred: Record<Filtro, (i: AgendaItem) => boolean> = {
      proximas: (i) => isAberta(i.status) || (dayKey(i.dose.epoch) === hoje && i.status !== "CANCELADA"),
      hoje: (i) => dayKey(i.dose.epoch) === hoje,
      tomadas: (i) => i.status === "TOMADA",
      atrasadas: (i) => i.status === "ATRASADA",
      encerrados: (i) => {
        const st = statusTratamento(i.med, state.now);
        return st === "CONCLUIDO" || st === "CANCELADO";
      },
      todas: () => true,
    };
    let items = agenda.filter(pred[filtro]);
    if (filtro === "tomadas" || filtro === "atrasadas" || filtro === "encerrados") items = [...items].reverse();
    return agruparPorDia(items, state.now);
  }, [agenda, filtro, state.now]);

  const total = secoes.reduce((n, x) => n + x.data.length, 0);

  return (
    <View style={s.root}>
      <ScreenHeader title="Agenda" subtitle={`${total} administração(ões)`} testID="agenda-screen-title" />
      <View style={s.chipsWrap}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chips}>
          {FILTROS.map((f) => {
            const on = f.key === filtro;
            return (
              <Pressable key={f.key} testID={`agenda-filter-${f.key}`} onPress={() => setFiltro(f.key)} style={[s.chip, on && s.chipOn]}>
                <Text style={[s.chipText, on && s.chipTextOn]}>{f.label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>
      <SectionList
        testID="agenda-list"
        sections={secoes}
        keyExtractor={(i) => i.dose.id}
        stickySectionHeadersEnabled
        initialNumToRender={30}
        contentContainerStyle={{ paddingBottom: bottomChrome + 24 }}
        renderSectionHeader={({ section }) => (
          <View style={s.secHeader}>
            <Text style={s.secTitle}>{section.title}</Text>
            <Text style={s.secSub}>
              {keyToBr(section.key)} · {section.data.length} dose(s)
            </Text>
          </View>
        )}
        renderItem={({ item, index, section }) => (
          <View style={[s.rowWrap, index === 0 && s.first, index === section.data.length - 1 && s.last]}>
            <DoseRow testID={`agenda-dose-${item.dose.id}`} item={item} onPress={() => router.push(`/medicamento/${item.med.id}`)} />
            {index < section.data.length - 1 ? <View style={s.sep} /> : null}
          </View>
        )}
        ListEmptyComponent={<EmptyState testID="agenda-empty" icon="calendar-clear-outline" title="Nenhuma dose neste filtro" text="As administrações calculadas aparecerão aqui, separadas por dia." />}
      />
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.canvas },
  chipsWrap: { height: 56, justifyContent: "center", backgroundColor: c.canvas },
  chips: { gap: 8, paddingHorizontal: 16, alignItems: "center" },
  chip: { height: 36, paddingHorizontal: 16, borderRadius: 999, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, justifyContent: "center", flexShrink: 0 },
  chipOn: { backgroundColor: c.brandPrimary, borderColor: c.brandPrimary },
  chipText: { fontSize: 14, fontWeight: "600", color: c.onSurfaceSecondary },
  chipTextOn: { color: c.onBrandPrimary },
  secHeader: { backgroundColor: c.canvas, paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8, flexDirection: "row", alignItems: "baseline", gap: 8 },
  secTitle: { fontSize: 17, fontWeight: "800", color: c.onSurface, textTransform: "capitalize" },
  secSub: { fontSize: 13, color: c.muted },
  rowWrap: { marginHorizontal: 16, backgroundColor: c.surface, overflow: "hidden" },
  first: { borderTopLeftRadius: 16, borderTopRightRadius: 16 },
  last: { borderBottomLeftRadius: 16, borderBottomRightRadius: 16 },
  sep: { height: 1, backgroundColor: c.divider, marginLeft: 76 },
}));
