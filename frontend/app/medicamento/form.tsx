import { Ionicons } from "@react-native-vector-icons/ionicons";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useMemo, useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { KeyboardAwareScrollView, KeyboardStickyView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { DateTimeField } from "@/src/components/DateTimeField";
import { useToast } from "@/src/components/Toast";
import { Button, ScreenHeader, haptic } from "@/src/components/ui";
import { agruparPorDia, gerarDoses, novoId } from "@/src/lib/schedule";
import { HOUR, dayKey, fmtDateTime, fmtTime, parts, validDate, validTime } from "@/src/lib/time";
import { useApp } from "@/src/store/AppStore";
import { makeStyles, useTheme } from "@/src/theme";

const INTERVALOS = [4, 6, 8, 12, 24];
const DURACOES = [3, 5, 7, 10, 30];
const PREVIA_MAX = 80;

function horaPadrao() {
  const p = parts(Date.now() + HOUR);
  return `${String(p.h).padStart(2, "0")}:00`;
}

export default function MedForm() {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { state, salvarMed } = useApp();
  const editando = state.meds.find((m) => m.id === id);

  const [nome, setNome] = useState(editando?.nome ?? "");
  const [dosagem, setDosagem] = useState(editando?.dosagem ?? "");
  const [quantidade, setQuantidade] = useState(editando?.quantidade ?? 1);
  const [intervalo, setIntervalo] = useState(editando?.intervaloHoras ?? 8);
  const [intervaloCustom, setIntervaloCustom] = useState(editando && !INTERVALOS.includes(editando.intervaloHoras));
  const [duracao, setDuracao] = useState(editando?.duracaoDias ?? 7);
  const [duracaoCustom, setDuracaoCustom] = useState(editando && !DURACOES.includes(editando.duracaoDias));
  const [dataInicio, setDataInicio] = useState(editando?.dataInicio ?? dayKey(Date.now()));
  const [horario, setHorario] = useState(editando?.horarioInicio ?? horaPadrao());
  const [obs, setObs] = useState(editando?.observacoes ?? "");
  const [tentou, setTentou] = useState(false);

  const medId = useMemo(() => editando?.id ?? novoId("m"), [editando?.id]);

  const erros = {
    nome: !nome.trim() ? "Informe o nome do medicamento" : null,
    dosagem: !dosagem.trim() ? "Informe a dosagem (ex.: 500 mg)" : null,
    intervalo: !(Number.isInteger(intervalo) && intervalo >= 1 && intervalo <= 168) ? "Intervalo entre 1 e 168 horas (número inteiro)" : null,
    duracao: !(Number.isInteger(duracao) && duracao >= 1 && duracao <= 365) ? "Duração entre 1 e 365 dias" : null,
    data: !validDate(dataInicio) ? "Data inválida (dd/mm/aaaa)" : null,
    horario: !validTime(horario) ? "Horário inválido (hh:mm)" : null,
  };
  const valido = !Object.values(erros).some(Boolean);

  const doses = useMemo(() => (valido ? gerarDoses(medId, dataInicio, horario, intervalo, duracao) : []), [valido, medId, dataInicio, horario, intervalo, duracao]);
  const previa = useMemo(
    () => agruparPorDia(doses.slice(0, PREVIA_MAX).map((d) => ({ dose: d, med: null as any, status: "AGENDADA" as const })), Date.now()),
    [doses],
  );

  const salvar = () => {
    setTentou(true);
    if (!valido || !doses.length) {
      haptic("warning");
      toast("Revise os campos destacados", "erro");
      return;
    }
    const agora = Date.now();
    salvarMed({
      id: medId,
      nome: nome.trim(),
      dosagem: dosagem.trim(),
      quantidade,
      intervaloHoras: intervalo,
      duracaoDias: duracao,
      dataInicio,
      horarioInicio: horario,
      observacoes: obs.trim(),
      cancelado: false,
      criadoEm: editando?.criadoEm ?? agora,
      atualizadoEm: agora,
      doses,
    });
    haptic("success");
    toast(`${doses.length} doses programadas · enviando para a caixa`, "ok");
    router.back();
  };

  const err = (k: keyof typeof erros) => (tentou && erros[k] ? <Text style={s.err}>{erros[k]}</Text> : null);

  const Chips = ({ values, value, custom, onPick, onCustom, suffix, testPrefix }: { values: number[]; value: number; custom: boolean; onPick: (v: number) => void; onCustom: () => void; suffix: string; testPrefix: string }) => (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chips} keyboardShouldPersistTaps="handled">
      {values.map((v) => {
        const on = !custom && v === value;
        return (
          <Pressable key={v} testID={`${testPrefix}-${v}`} onPress={() => onPick(v)} style={[s.chip, on && s.chipOn]}>
            <Text style={[s.chipText, on && s.chipTextOn]}>
              {v} {suffix}
            </Text>
          </Pressable>
        );
      })}
      <Pressable testID={`${testPrefix}-custom`} onPress={onCustom} style={[s.chip, custom && s.chipOn]}>
        <Text style={[s.chipText, custom && s.chipTextOn]}>Personalizado</Text>
      </Pressable>
    </ScrollView>
  );

  return (
    <View style={s.root}>
      <ScreenHeader title={editando ? "Editar medicamento" : "Novo medicamento"} onBack={() => router.back()} testID="med-form-title" />
      <KeyboardAwareScrollView bottomOffset={96} keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 16, paddingBottom: 120 }}>
        <Text style={s.group}>Medicamento</Text>
        <View style={s.card}>
          <Text style={s.label}>Nome</Text>
          <TextInput testID="med-form-name-input" style={s.input} value={nome} onChangeText={setNome} placeholder="Ex.: Dipirona" placeholderTextColor={colors.muted} maxLength={31} />
          {err("nome")}
          <Text style={s.label}>Dosagem</Text>
          <TextInput testID="med-form-dosage-input" style={s.input} value={dosagem} onChangeText={setDosagem} placeholder="Ex.: 500 mg" placeholderTextColor={colors.muted} maxLength={15} />
          {err("dosagem")}
          <Text style={s.label}>Quantidade por administração</Text>
          <View style={s.stepper}>
            <Pressable testID="med-form-qty-minus" onPress={() => setQuantidade((q) => Math.max(1, q - 1))} style={s.stepBtn}>
              <Ionicons name="remove" size={22} color={colors.brandPrimary} />
            </Pressable>
            <Text testID="med-form-qty-value" style={s.stepValue}>
              {quantidade} {quantidade === 1 ? "comprimido" : "comprimidos"}
            </Text>
            <Pressable testID="med-form-qty-plus" onPress={() => setQuantidade((q) => Math.min(20, q + 1))} style={s.stepBtn}>
              <Ionicons name="add" size={22} color={colors.brandPrimary} />
            </Pressable>
          </View>
        </View>

        <Text style={s.group}>Programação</Text>
        <View style={s.card}>
          <Text style={s.label}>Intervalo entre doses</Text>
          <Chips values={INTERVALOS} value={intervalo} custom={!!intervaloCustom} suffix="h" testPrefix="med-form-interval" onPick={(v) => { setIntervaloCustom(false); setIntervalo(v); }} onCustom={() => setIntervaloCustom(true)} />
          {intervaloCustom ? (
            <TextInput testID="med-form-interval-custom-input" style={s.input} keyboardType="number-pad" value={String(intervalo || "")} onChangeText={(t) => setIntervalo(parseInt(t.replace(/\D/g, ""), 10) || 0)} placeholder="Horas (ex.: 10)" placeholderTextColor={colors.muted} />
          ) : null}
          {err("intervalo")}

          <Text style={s.label}>Duração do tratamento</Text>
          <Chips values={DURACOES} value={duracao} custom={!!duracaoCustom} suffix="dias" testPrefix="med-form-duration" onPick={(v) => { setDuracaoCustom(false); setDuracao(v); }} onCustom={() => setDuracaoCustom(true)} />
          {duracaoCustom ? (
            <TextInput testID="med-form-duration-custom-input" style={s.input} keyboardType="number-pad" value={String(duracao || "")} onChangeText={(t) => setDuracao(parseInt(t.replace(/\D/g, ""), 10) || 0)} placeholder="Dias (ex.: 14)" placeholderTextColor={colors.muted} />
          ) : null}
          {err("duracao")}

          <View style={s.twoCols}>
            <View style={{ flex: 1 }}>
              <Text style={s.label}>Início</Text>
              <DateTimeField testID="med-form-start-date" mode="date" value={dataInicio} onChange={setDataInicio} />
              {err("data")}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.label}>1º horário</Text>
              <DateTimeField testID="med-form-start-time" mode="time" value={horario} onChange={setHorario} />
              {err("horario")}
            </View>
          </View>
        </View>

        <Text style={s.group}>Observações (opcional)</Text>
        <View style={s.card}>
          <TextInput testID="med-form-notes-input" style={[s.input, { height: 80, paddingTop: 12, textAlignVertical: "top" }]} multiline value={obs} onChangeText={setObs} placeholder="Ex.: tomar após as refeições" placeholderTextColor={colors.muted} />
        </View>

        <View style={s.previewHead}>
          <Text style={s.group}>Prévia dos alarmes</Text>
          <Text testID="med-form-preview-total" style={s.total}>
            {doses.length} administração(ões)
          </Text>
        </View>
        <View testID="med-form-preview" style={s.card}>
          {!valido ? (
            <Text style={s.muted}>Preencha os campos para calcular os horários.</Text>
          ) : (
            <>
              <Text style={s.muted}>
                De {fmtDateTime(doses[0].epoch)} até {fmtDateTime(doses[doses.length - 1].epoch)} · a cada {intervalo} h
              </Text>
              {previa.map((d, idx) => (
                <View key={d.key} testID={`preview-day-${idx}`} style={s.pDay}>
                  <Text style={s.pDayLabel}>Dia {Math.round((Date.parse(d.key) - Date.parse(dataInicio)) / 86_400_000) + 1}</Text>
                  <Text style={s.pDayDate}>{d.title}</Text>
                  <View style={s.pTimes}>
                    {d.data.map((i) => (
                      <View key={i.dose.id} style={s.pTime}>
                        <Text style={s.pTimeText}>{fmtTime(i.dose.epoch)}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              ))}
              {doses.length > PREVIA_MAX ? <Text style={s.muted}>+ {doses.length - PREVIA_MAX} administrações não exibidas na prévia</Text> : null}
            </>
          )}
        </View>
      </KeyboardAwareScrollView>
      <KeyboardStickyView offset={{ closed: 0, opened: insets.bottom }}>
        <View style={[s.footer, { paddingBottom: insets.bottom + 12 }]}>
          <Button testID="med-form-save-button" label={editando ? "Salvar e reenviar à caixa" : "Confirmar e enviar à caixa"} icon="checkmark" onPress={salvar} />
        </View>
      </KeyboardStickyView>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.canvas },
  group: { fontSize: 13, fontWeight: "700", color: c.muted, textTransform: "uppercase", letterSpacing: 0.6, marginTop: 16, marginBottom: 8, paddingHorizontal: 4 },
  card: { backgroundColor: c.surface, borderRadius: 20, padding: 16, gap: 8 },
  label: { fontSize: 14, fontWeight: "600", color: c.onSurfaceSecondary, marginTop: 4 },
  input: { height: 50, borderRadius: 12, backgroundColor: c.surfaceSecondary, paddingHorizontal: 14, fontSize: 16, color: c.onSurface },
  err: { fontSize: 12, color: c.errorText, fontWeight: "600" },
  stepper: { flexDirection: "row", alignItems: "center", backgroundColor: c.surfaceSecondary, borderRadius: 12, height: 50 },
  stepBtn: { width: 52, height: 50, alignItems: "center", justifyContent: "center" },
  stepValue: { flex: 1, textAlign: "center", fontSize: 16, fontWeight: "700", color: c.onSurface },
  chips: { gap: 8, paddingVertical: 4 },
  chip: { height: 36, paddingHorizontal: 14, borderRadius: 999, backgroundColor: c.surfaceSecondary, borderWidth: 1, borderColor: c.border, justifyContent: "center", flexShrink: 0 },
  chipOn: { backgroundColor: c.brandPrimary, borderColor: c.brandPrimary },
  chipText: { fontSize: 14, fontWeight: "600", color: c.onSurfaceSecondary },
  chipTextOn: { color: c.onBrandPrimary },
  twoCols: { flexDirection: "row", gap: 12 },
  previewHead: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between" },
  total: { fontSize: 14, fontWeight: "800", color: c.brandPrimary, marginBottom: 8, paddingHorizontal: 4 },
  muted: { fontSize: 13, color: c.muted },
  pDay: { borderTopWidth: 1, borderTopColor: c.divider, paddingTop: 10, marginTop: 4, flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8 },
  pDayLabel: { fontSize: 14, fontWeight: "800", color: c.onSurface, width: 56 },
  pDayDate: { fontSize: 13, color: c.muted, width: 84, textTransform: "capitalize" },
  pTimes: { flex: 1, flexDirection: "row", flexWrap: "wrap", gap: 6 },
  pTime: { backgroundColor: c.brandTertiary, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  pTimeText: { fontSize: 13, fontWeight: "700", color: c.onBrandTertiary, fontVariant: ["tabular-nums"] },
  footer: { paddingHorizontal: 16, paddingTop: 12, backgroundColor: c.surface, borderTopWidth: 1, borderTopColor: c.divider },
}));
