import { Ionicons } from "@react-native-vector-icons/ionicons";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useMemo, useState } from "react";
import { SectionList, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ConfirmSheet } from "@/src/components/ConfirmSheet";
import { DoseRow } from "@/src/components/DoseRow";
import { TratamentoBadge } from "@/src/components/StatusBadge";
import { useToast } from "@/src/components/Toast";
import { Button, EmptyState, InfoRow, ScreenHeader } from "@/src/components/ui";
import { agruparPorDia, duracaoLabel, frequenciaLabel, statusTratamento } from "@/src/lib/schedule";
import { keyToBr } from "@/src/lib/time";
import { useApp } from "@/src/store/AppStore";
import { makeStyles, useTheme } from "@/src/theme";

export default function MedDetalhe() {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { state, agenda, excluirMed, cancelarMed } = useApp();
  const [confirm, setConfirm] = useState<"excluir" | "cancelar" | null>(null);
  const med = state.meds.find((m) => m.id === id);
  const secoes = useMemo(() => agruparPorDia(agenda.filter((i) => i.med.id === id), state.now), [agenda, id, state.now]);

  if (!med) {
    return (
      <View style={s.root}>
        <ScreenHeader title="Medicamento" onBack={() => router.back()} />
        <EmptyState testID="med-detail-not-found" icon="help-circle-outline" title="Medicamento não encontrado" />
      </View>
    );
  }
  const st = statusTratamento(med, state.now);
  const tomadas = med.doses.filter((d) => state.records[d.id]?.status === "TOMADA").length;

  return (
    <View style={s.root}>
      <ScreenHeader title={med.nome} onBack={() => router.back()} testID="med-detail-title" />
      <SectionList
        sections={secoes}
        keyExtractor={(i) => i.dose.id}
        stickySectionHeadersEnabled={false}
        initialNumToRender={20}
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
        ListHeaderComponent={
          <View style={{ padding: 16, gap: 12 }}>
            <View style={s.card}>
              <View style={s.top}>
                <View style={s.icon}>
                  <Ionicons name="medical" size={24} color={colors.brandPrimary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.name}>{med.nome}</Text>
                  <Text style={s.sub}>{med.dosagem}</Text>
                </View>
                <TratamentoBadge status={st} testID="med-detail-status" />
              </View>
              <InfoRow icon="medkit-outline" label="Por dose" value={`${med.quantidade} comprimido(s)`} />
              <InfoRow icon="repeat" label="Frequência" value={frequenciaLabel(med.intervaloHoras)} />
              <InfoRow icon="calendar-outline" label="Duração" value={duracaoLabel(med.duracaoDias)} />
              <InfoRow icon="play-outline" label="Início" value={`${keyToBr(med.dataInicio)} às ${med.horarioInicio}`} />
              <InfoRow icon="checkmark-done" label="Doses tomadas" value={`${tomadas} de ${med.doses.length}`} testID="med-detail-progress" last={!med.observacoes} />
              {med.observacoes ? <InfoRow icon="document-text-outline" label="Obs." value={med.observacoes} last /> : null}
            </View>
            <View style={s.actions}>
              {!med.cancelado ? <Button testID="med-detail-edit-button" style={{ flex: 1 }} label="Editar" icon="create-outline" variant="secondary" onPress={() => router.push({ pathname: "/medicamento/form", params: { id: med.id } })} /> : null}
              {!med.cancelado && st !== "CONCLUIDO" ? <Button testID="med-detail-cancel-button" style={{ flex: 1 }} label="Cancelar" icon="pause-circle-outline" variant="ghost" onPress={() => setConfirm("cancelar")} /> : null}
              <Button testID="med-detail-delete-button" style={{ flex: 1 }} label="Excluir" icon="trash-outline" variant="danger" onPress={() => setConfirm("excluir")} />
            </View>
            <Text style={s.group}>Administrações calculadas</Text>
          </View>
        }
        renderSectionHeader={({ section }) => (
          <Text style={s.secTitle}>
            {section.title} · {keyToBr(section.key)}
          </Text>
        )}
        renderItem={({ item, index, section }) => (
          <View style={[s.rowWrap, index === 0 && s.first, index === section.data.length - 1 && s.last]}>
            <DoseRow testID={`med-detail-dose-${item.dose.id}`} item={item} />
            {index < section.data.length - 1 ? <View style={s.sep} /> : null}
          </View>
        )}
      />
      <ConfirmSheet
        visible={confirm !== null}
        title={confirm === "excluir" ? `Excluir ${med.nome}?` : `Cancelar tratamento de ${med.nome}?`}
        message={
          confirm === "excluir"
            ? "O medicamento e suas doses futuras serão removidos da caixa. O histórico de doses já confirmadas é mantido. Os demais medicamentos não são alterados."
            : "As doses restantes ficam como CANCELADAS e deixam de alarmar na caixa. O medicamento continua visível para consulta."
        }
        confirmLabel={confirm === "excluir" ? "Excluir medicamento" : "Cancelar tratamento"}
        danger
        onClose={() => setConfirm(null)}
        onConfirm={() => {
          if (confirm === "excluir") {
            excluirMed(med.id);
            toast("Medicamento excluído · nova programação na fila", "ok");
            setConfirm(null);
            router.back();
          } else {
            cancelarMed(med.id);
            toast("Tratamento cancelado · nova programação na fila", "ok");
            setConfirm(null);
          }
        }}
      />
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.canvas },
  card: { backgroundColor: c.surface, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 8 },
  top: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 8 },
  icon: { width: 48, height: 48, borderRadius: 14, backgroundColor: c.brandTertiary, alignItems: "center", justifyContent: "center" },
  name: { fontSize: 20, fontWeight: "800", color: c.onSurface },
  sub: { fontSize: 14, color: c.muted },
  actions: { flexDirection: "row", gap: 8 },
  group: { fontSize: 13, fontWeight: "700", color: c.muted, textTransform: "uppercase", letterSpacing: 0.6, marginTop: 8, paddingHorizontal: 4 },
  secTitle: { fontSize: 15, fontWeight: "800", color: c.onSurface, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 8, textTransform: "capitalize" },
  rowWrap: { marginHorizontal: 16, backgroundColor: c.surface, overflow: "hidden" },
  first: { borderTopLeftRadius: 16, borderTopRightRadius: 16 },
  last: { borderBottomLeftRadius: 16, borderBottomRightRadius: 16 },
  sep: { height: 1, backgroundColor: c.divider, marginLeft: 76 },
}));
