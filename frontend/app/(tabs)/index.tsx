import { Ionicons } from "@react-native-vector-icons/ionicons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import React, { useMemo, useState } from "react";
import { Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ConnectionChip } from "@/src/components/ConnectionChip";
import { NotifPermissionCard } from "@/src/components/NotifPermissionCard";
import { StatusBadge } from "@/src/components/StatusBadge";
import { Button, Card, EmptyState } from "@/src/components/ui";
import { proximaDose, statusTratamento } from "@/src/lib/schedule";
import { dayKey, fmtDate, fmtLongToday, fmtRelative, fmtTime, saudacao } from "@/src/lib/time";
import { usesNativeTabs } from "@/src/navigation";
import { useApp } from "@/src/store/AppStore";
import { makeStyles, useTheme } from "@/src/theme";

export default function Dashboard() {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { state, agenda, enviarComando } = useApp();
  const [refreshing, setRefreshing] = useState(false);
  const now = state.now;
  const bottomChrome = usesNativeTabs ? insets.bottom : 0;

  const prox = useMemo(() => proximaDose(agenda), [agenda]);
  const emAndamento = agenda.filter((i) => i.status === "EM_ANDAMENTO");
  const hoje = dayKey(now);
  const dosesHoje = agenda.filter((i) => dayKey(i.dose.epoch) === hoje);
  const restantesHoje = dosesHoje.filter((i) => i.status === "AGENDADA" || i.status === "AGUARDANDO" || i.status === "EM_ANDAMENTO").length;
  const atrasadasHoje = dosesHoje.filter((i) => i.status === "ATRASADA").length;
  const tomadasHoje = dosesHoje.filter((i) => i.status === "TOMADA").length;
  const medsAtivos = state.meds.filter((m) => {
    const st = statusTratamento(m, now);
    return st === "ATIVO" || st === "NAO_INICIADO";
  }).length;

  const onRefresh = () => {
    setRefreshing(true);
    enviarComando("STATUS");
    enviarComando("SINCRONIZAR", { desde_seq: state.lastSeq });
    setTimeout(() => setRefreshing(false), 1200);
  };


  return (
    <View style={s.root}>
      <View style={[s.header, { paddingTop: insets.top + 12 }]}>
        <View style={{ flex: 1 }}>
          <Text testID="dashboard-greeting" style={s.greet}>
            {saudacao(now)}!
          </Text>
          <Text testID="dashboard-date" style={s.date}>
            {fmtLongToday(now)}
          </Text>
        </View>
        <ConnectionChip />
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: bottomChrome + 24 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brandPrimary} />}
      >
        {!state.hydrated ? null : (
          <>
            <Animated.View entering={FadeInDown.duration(400)}>
              <LinearGradient colors={[colors.brandPrimary, colors.brandSecondary]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.hero}>
                <View style={s.heroTop}>
                  <View style={s.heroIcon}>
                    <Ionicons name="alarm-outline" size={18} color={colors.onBrandPrimary} />
                  </View>
                  <Text style={s.heroLabel}>Próxima dose</Text>
                  {prox ? <StatusBadge status={prox.status} testID="next-dose-status" /> : null}
                </View>
                {prox ? (
                  <Pressable testID="next-dose-card" onPress={() => router.push(`/medicamento/${prox.med.id}`)}>
                    <Text testID="next-dose-time" style={s.heroTime}>
                      {fmtTime(prox.dose.epoch)}
                    </Text>
                    <Text testID="next-dose-name" style={s.heroName}>
                      {prox.med.nome} · {prox.med.dosagem}
                    </Text>
                    <Text style={s.heroSub}>
                      {prox.med.quantidade} comprimido(s) · {dayKey(prox.dose.epoch) === hoje ? "hoje" : fmtDate(prox.dose.epoch)} · {prox.status === "EM_ANDAMENTO" ? "alarmando agora" : fmtRelative(prox.dose.epoch - now)}
                    </Text>
                  </Pressable>
                ) : (
                  <View testID="next-dose-empty">
                    <Text style={s.heroName}>Nenhuma dose pendente</Text>
                    <Text style={s.heroSub}>Cadastre um medicamento para programar a caixa.</Text>
                  </View>
                )}
              </LinearGradient>
            </Animated.View>

            {emAndamento.length ? (
              <Card testID="alarm-active-card" style={[s.alarm]}>
                <Ionicons name="notifications" size={24} color={colors.brandPrimary} />
                <View style={{ flex: 1 }}>
                  <Text style={s.alarmTitle}>A caixa está alarmando</Text>
                  <Text style={s.alarmText}>
                    {emAndamento.map((i) => i.med.nome).join(", ")} — abra a tampa e mantenha aberta por 5 segundos.
                  </Text>
                </View>
              </Card>
            ) : null}

            <View style={s.grid}>
              <Card style={s.stat} testID="stat-meds-count">
                <Ionicons name="medkit-outline" size={20} color={colors.brandPrimary} />
                <Text style={s.statNum}>{medsAtivos}</Text>
                <Text style={s.statLabel}>Medicamentos em uso</Text>
              </Card>
              <Card style={s.stat} testID="stat-doses-remaining-today">
                <Ionicons name="today-outline" size={20} color={colors.brandPrimary} />
                <Text style={s.statNum}>{restantesHoje}</Text>
                <Text style={s.statLabel}>
                  Doses restantes hoje{tomadasHoje ? ` · ${tomadasHoje} tomada(s)` : ""}
                  {atrasadasHoje ? ` · ${atrasadasHoje} atrasada(s)` : ""}
                </Text>
              </Card>
            </View>

            <NotifPermissionCard />

            {state.meds.length === 0 ? (
              <EmptyState testID="dashboard-empty" icon="add-circle-outline" title="Comece cadastrando um medicamento" text="O app calcula todos os horários e envia a programação para a caixa.">
                <Button testID="dashboard-add-med-button" label="Cadastrar medicamento" icon="add" onPress={() => router.push("/medicamento/form")} />
              </EmptyState>
            ) : null}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.canvas },
  header: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingBottom: 12, backgroundColor: c.canvas },
  greet: { fontSize: 28, fontWeight: "800", color: c.onSurface, letterSpacing: -0.5 },
  date: { fontSize: 14, color: c.muted, marginTop: 2 },
  hero: { borderRadius: 24, padding: 20, gap: 4 },
  heroTop: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 },
  heroIcon: { width: 32, height: 32, borderRadius: 16, backgroundColor: "rgba(255,255,255,0.2)", alignItems: "center", justifyContent: "center" },
  heroLabel: { flex: 1, color: c.onBrandPrimary, fontSize: 14, fontWeight: "700", opacity: 0.9 },
  heroTime: { color: c.onBrandPrimary, fontSize: 48, fontWeight: "800", letterSpacing: -1, fontVariant: ["tabular-nums"] },
  heroName: { color: c.onBrandPrimary, fontSize: 20, fontWeight: "700" },
  heroSub: { color: c.onBrandPrimary, fontSize: 14, opacity: 0.85, marginTop: 4 },
  alarm: { flexDirection: "row", gap: 12, alignItems: "center", marginTop: 12, borderWidth: 1.5, borderColor: c.brandPrimary },
  alarmTitle: { fontSize: 15, fontWeight: "800", color: c.onSurface },
  alarmText: { fontSize: 13, color: c.onSurfaceSecondary, marginTop: 2 },
  grid: { flexDirection: "row", gap: 12, marginTop: 12 },
  stat: { flex: 1, gap: 4 },
  statNum: { fontSize: 30, fontWeight: "800", color: c.onSurface, marginTop: 4 },
  statLabel: { fontSize: 13, color: c.muted },
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
