import { Ionicons } from "@react-native-vector-icons/ionicons";
import { useRouter } from "expo-router";
import React from "react";
import { FlatList, Pressable, Text, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { TratamentoBadge } from "@/src/components/StatusBadge";
import { Button, EmptyState, ScreenHeader } from "@/src/components/ui";
import { duracaoLabel, frequenciaLabel, proximaDoseDoMed, statusTratamento } from "@/src/lib/schedule";
import { dayKey, fmtDate, fmtTime } from "@/src/lib/time";
import { usesNativeTabs } from "@/src/navigation";
import { useApp } from "@/src/store/AppStore";
import { makeStyles, useTheme } from "@/src/theme";

export default function Medicamentos() {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { state } = useApp();
  const bottomChrome = usesNativeTabs ? insets.bottom : 0;
  const ordem = { ATIVO: 0, NAO_INICIADO: 1, CONCLUIDO: 2, CANCELADO: 3 } as const;
  const meds = [...state.meds].sort((a, b) => ordem[statusTratamento(a, state.now)] - ordem[statusTratamento(b, state.now)] || a.nome.localeCompare(b.nome));

  return (
    <View style={s.root}>
      <ScreenHeader title="Medicamentos" subtitle={`${state.meds.length} cadastrado(s)`} testID="meds-screen-title" />
      <FlatList
        data={meds}
        keyExtractor={(m) => m.id}
        contentContainerStyle={{ padding: 16, paddingBottom: bottomChrome + 96, gap: 12 }}
        ListEmptyComponent={
          state.hydrated ? (
            <EmptyState testID="meds-empty" icon="medkit-outline" title="Nenhum medicamento cadastrado" text="Cadastre o primeiro medicamento para gerar a agenda de doses e programar a caixa.">
              <Button testID="meds-empty-add-button" label="Adicionar medicamento" icon="add" onPress={() => router.push("/medicamento/form")} />
            </EmptyState>
          ) : undefined
        }
        renderItem={({ item: m, index }) => {
          const st = statusTratamento(m, state.now);
          const prox = proximaDoseDoMed(m, state.records, state.now);
          const tomadas = m.doses.filter((d) => state.records[d.id]?.status === "TOMADA").length;
          return (
            <Animated.View entering={FadeInDown.delay(index * 50).duration(300)}>
              <Pressable testID={`med-card-${m.id}`} onPress={() => router.push(`/medicamento/${m.id}`)} style={({ pressed }) => [s.card, pressed && { transform: [{ scale: 0.99 }], opacity: 0.9 }]}>
                <View style={s.top}>
                  <View style={[s.icon, (st === "CONCLUIDO" || st === "CANCELADO") && { backgroundColor: colors.surfaceTertiary }]}>
                    <Ionicons name="medical" size={22} color={st === "CONCLUIDO" || st === "CANCELADO" ? colors.muted : colors.brandPrimary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.name} numberOfLines={1}>
                      {m.nome}
                    </Text>
                    <Text style={s.dosage}>
                      {m.dosagem} · {m.quantidade} comprimido(s) por dose
                    </Text>
                  </View>
                  <TratamentoBadge status={st} testID={`med-card-status-${m.id}`} />
                </View>
                <View style={s.meta}>
                  <View style={s.metaItem}>
                    <Ionicons name="repeat" size={14} color={colors.muted} />
                    <Text style={s.metaText}>{frequenciaLabel(m.intervaloHoras)}</Text>
                  </View>
                  <View style={s.metaItem}>
                    <Ionicons name="calendar-outline" size={14} color={colors.muted} />
                    <Text style={s.metaText}>{duracaoLabel(m.duracaoDias)}</Text>
                  </View>
                  <View style={s.metaItem}>
                    <Ionicons name="checkmark-done" size={14} color={colors.muted} />
                    <Text style={s.metaText}>
                      {tomadas}/{m.doses.length}
                    </Text>
                  </View>
                </View>
                <View style={s.next}>
                  <Text style={s.nextLabel}>Próxima administração</Text>
                  <Text testID={`med-card-next-${m.id}`} style={s.nextValue}>
                    {prox ? `${dayKey(prox.epoch) === dayKey(state.now) ? "Hoje" : fmtDate(prox.epoch)} às ${fmtTime(prox.epoch)}` : "—"}
                  </Text>
                </View>
              </Pressable>
            </Animated.View>
          );
        }}
      />
      <Pressable testID="add-med-fab" onPress={() => router.push("/medicamento/form")} style={({ pressed }) => [s.fab, { bottom: bottomChrome + 16 }, pressed && { transform: [{ scale: 0.95 }] }]}>
        <Ionicons name="add" size={28} color={colors.onBrandPrimary} />
      </Pressable>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.canvas },
  card: { backgroundColor: c.surface, borderRadius: 20, padding: 16, gap: 12 },
  top: { flexDirection: "row", alignItems: "center", gap: 12 },
  icon: { width: 44, height: 44, borderRadius: 14, backgroundColor: c.brandTertiary, alignItems: "center", justifyContent: "center" },
  name: { fontSize: 17, fontWeight: "800", color: c.onSurface },
  dosage: { fontSize: 13, color: c.muted, marginTop: 2 },
  meta: { flexDirection: "row", flexWrap: "wrap", gap: 16 },
  metaItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  metaText: { fontSize: 13, color: c.onSurfaceSecondary },
  next: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", backgroundColor: c.surfaceSecondary, borderRadius: 12, paddingHorizontal: 12, height: 40 },
  nextLabel: { fontSize: 13, color: c.muted },
  nextValue: { fontSize: 14, fontWeight: "700", color: c.onSurface },
  fab: {
    position: "absolute",
    right: 16,
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: c.brandPrimary,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: c.brandPrimary,
    shadowOpacity: 0.35,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
}));
