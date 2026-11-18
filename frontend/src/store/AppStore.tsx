import React, { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef } from "react";
import { AppState } from "react-native";

import { DEVICE_ID, STATUS_STALE_MS } from "../config";
import { construirPartes, novoMsgId } from "../lib/protocol";
import { AgendaItem, montarAgenda } from "../lib/schedule";
import { DAY, MIN, fmtTime, parseIso } from "../lib/time";
import { TOPICOS, mqttService } from "../services/mqtt";
import { notificarAgora, reagendarDoses } from "../services/notifications";
import {
  DeviceState,
  DeviceStatus,
  DoseRecord,
  HistoryEntry,
  LogEntry,
  Medication,
  MqttState,
  SyncState,
} from "../types";
import { storage } from "../utils/storage";

const STORAGE_KEY = "caixa_state_v1";

interface State {
  hydrated: boolean;
  meds: Medication[];
  records: Record<string, DoseRecord>;
  history: HistoryEntry[];
  seqs: number[];
  lastSeq: number;
  sync: SyncState;
  device: DeviceState;
  mqtt: MqttState;
  logs: LogEntry[];
  now: number;
}

const novaSync = (versao: number): SyncState => ({
  programacaoId: "prog_" + Date.now().toString(36),
  versao,
  status: "PENDENTE",
  atualizadoEm: Date.now(),
  ultimaSync: null,
  partesTotal: 0,
  partesEnviadas: 0,
  dosesEnviadas: 0,
  medsEnviados: 0,
  parcial: false,
});

const initial: State = {
  hydrated: false,
  meds: [],
  records: {},
  history: [],
  seqs: [],
  lastSeq: 0,
  sync: { ...novaSync(0), status: "SINCRONIZADA" },
  device: { online: null, onlineAt: null, status: null, statusAt: null, tampa: null },
  mqtt: "conectando",
  logs: [],
  now: Date.now(),
};

type Action =
  | { type: "HYDRATE"; data: Partial<State> }
  | { type: "UPSERT_MED"; med: Medication }
  | { type: "DELETE_MED"; id: string }
  | { type: "CANCEL_MED"; id: string }
  | { type: "RESYNC" }
  | { type: "MQTT"; s: MqttState }
  | { type: "ONLINE"; online: boolean; retained: boolean }
  | { type: "STATUS"; status: DeviceStatus; retained: boolean }
  | { type: "EVENT"; ev: any }
  | { type: "SYNC_PATCH"; pid: string; patch: Partial<SyncState> }
  | { type: "LOG"; texto: string; nivel: LogEntry["nivel"] }
  | { type: "TICK" };

const addLog = (logs: LogEntry[], texto: string, nivel: LogEntry["nivel"]): LogEntry[] =>
  [{ id: Math.random().toString(36).slice(2), ts: Date.now(), texto, nivel }, ...logs].slice(0, 60);

// Toda alteração gera nova versão/ID de programação, pendente de envio.
function bump(s: State): SyncState {
  const devV = s.device.status?.versao ?? 0;
  return { ...novaSync(Math.max(s.sync.versao, devV) + 1), ultimaSync: s.sync.ultimaSync };
}

function reducer(s: State, a: Action): State {
  switch (a.type) {
    case "HYDRATE":
      return { ...s, ...a.data, hydrated: true };
    case "UPSERT_MED": {
      const exists = s.meds.some((m) => m.id === a.med.id);
      const meds = exists ? s.meds.map((m) => (m.id === a.med.id ? a.med : m)) : [...s.meds, a.med];
      return { ...s, meds, sync: bump(s), logs: addLog(s.logs, `${exists ? "Editado" : "Cadastrado"}: ${a.med.nome}`, "info") };
    }
    case "DELETE_MED": {
      const med = s.meds.find((m) => m.id === a.id);
      return { ...s, meds: s.meds.filter((m) => m.id !== a.id), sync: bump(s), logs: addLog(s.logs, `Excluído: ${med?.nome ?? a.id}`, "aviso") };
    }
    case "CANCEL_MED": {
      const meds = s.meds.map((m) => (m.id === a.id ? { ...m, cancelado: true, atualizadoEm: Date.now() } : m));
      return { ...s, meds, sync: bump(s), logs: addLog(s.logs, "Tratamento cancelado", "aviso") };
    }
    case "RESYNC":
      return { ...s, sync: bump(s), logs: addLog(s.logs, "Reenvio manual da programação solicitado", "info") };
    case "MQTT":
      return { ...s, mqtt: a.s };
    case "ONLINE": {
      const was = s.device.online;
      const device = { ...s.device, online: a.online, onlineAt: Date.now() };
      let sync = s.sync;
      let logs = s.logs;
      if (a.online && was !== true) {
        // Reconexão: falhas anteriores voltam a ficar pendentes para reenvio automático
        if (sync.status === "FALHA" || sync.status === "ENVIADA") sync = { ...sync, status: "PENDENTE" };
        if (!a.retained) logs = addLog(logs, "Caixa conectada", "ok");
      }
      if (!a.online && was !== false && !a.retained) logs = addLog(logs, "Caixa desconectada", "erro");
      return { ...s, device, sync, logs };
    }
    case "STATUS": {
      const st = a.status;
      const next: State = {
        ...s,
        device: {
          ...s.device,
          status: st,
          statusAt: a.retained ? 0 : Date.now(),
          tampa: st.tampa ?? s.device.tampa,
          online: a.retained ? s.device.online : true,
        },
      };
      // A caixa roda outra programação (ex.: app reinstalado ou alterada por outro aparelho):
      // gera versão acima da caixa e reenvia a programação deste app.
      const emEnvio = s.sync.status === "ENVIANDO" || s.sync.status === "ENVIADA";
      if (s.hydrated && !emEnvio && (s.meds.length > 0 || s.sync.ultimaSync) && typeof st.versao === "number" && st.versao >= s.sync.versao && st.programacao_id && st.programacao_id !== s.sync.programacaoId) {
        next.sync = bump(next);
        next.logs = addLog(s.logs, `Caixa com programação diferente (v${st.versao}) — reenvio necessário`, "aviso");
      }
      return next;
    }
    case "EVENT":
      return aplicarEvento(s, a.ev);
    case "SYNC_PATCH":
      if (a.pid !== s.sync.programacaoId) return s;
      return { ...s, sync: { ...s.sync, ...a.patch, atualizadoEm: Date.now() } };
    case "LOG":
      return { ...s, logs: addLog(s.logs, a.texto, a.nivel) };
    case "TICK":
      return { ...s, now: Date.now() };
  }
}

function acharMed(s: State, medId?: string, doseId?: string) {
  return s.meds.find((m) => m.id === medId) ?? s.meds.find((m) => m.doses.some((d) => d.id === doseId));
}

function aplicarEvento(s: State, ev: any): State {
  const seq: number | null = typeof ev.seq === "number" ? ev.seq : null;
  if (seq !== null && s.seqs.includes(seq)) return s; // evento duplicado (reenvio da fila offline)
  const seqs = seq !== null ? [...s.seqs, seq].slice(-400) : s.seqs;
  const lastSeq = seq !== null ? Math.max(s.lastSeq, seq) : s.lastSeq;
  let { records, history, logs, device } = s;
  const doseId: string | undefined = ev.dose_id;
  const med = acharMed(s, ev.medication_id, doseId);
  const nome = ev.nome || med?.nome || "Medicamento";
  const ts = parseIso(ev.ts) ?? Date.now();

  switch (ev.evento) {
    case "LEMBRETE_INICIADO":
    case "ALARME_INICIO":
      if (doseId && records[doseId]?.status !== "TOMADA") records = { ...records, [doseId]: { status: "EM_ANDAMENTO", alarmeEm: ts } };
      logs = addLog(logs, `Lembrete iniciado: ${doseId ? nome : ev.origem === "REMOTO" ? "lembrete remoto" : "horário " + (ev.horario ?? "")}`, "aviso");
      break;
    case "DOSE_ATRASADA":
      logs = addLog(logs, `Dose atrasada: ${doseId ? nome : "horário " + (ev.horario ?? "")}${typeof ev.atraso_min === "number" ? ` (${ev.atraso_min} min)` : ""}`, "erro");
      break;
    case "ABERTURA_FORA_DE_HORARIO":
      logs = addLog(logs, "Tampa aberta fora do horário", "info");
      break;
    case "HORARIOS_ATUALIZADOS":
      logs = addLog(logs, `Agenda fixa da caixa: ${(ev.horarios ?? []).join(", ")}`, "info");
      break;
    case "DOSE_TOMADA":
    case "DOSE_PERDIDA": {
      const tomada = ev.evento === "DOSE_TOMADA";
      const programada = parseIso(ev.data_hora_programada);
      const confirmada = tomada ? parseIso(ev.data_hora_confirmacao) ?? ts : null;
      if (doseId) records = { ...records, [doseId]: { ...records[doseId], status: tomada ? "TOMADA" : "PERDIDA", confirmadaEm: confirmada ?? undefined, origem: ev.origem } };
      const key = doseId ?? `seq_${seq ?? ts}`;
      if (!history.some((h) => h.key === key)) {
        const entry: HistoryEntry = {
          key,
          doseId: doseId ?? null,
          medicationId: ev.medication_id ?? med?.id ?? null,
          nome,
          dosagem: med?.dosagem ?? "",
          programadaEm: programada,
          horario: typeof ev.horario === "string" ? ev.horario : undefined,
          confirmadaEm: confirmada,
          status: tomada ? "TOMADA" : "PERDIDA",
          atrasoMin: typeof ev.atraso_min === "number" ? ev.atraso_min : programada && confirmada ? Math.max(0, Math.round((confirmada - programada) / MIN)) : 0,
          origem: ev.origem ?? "AGENDA",
          seq,
        };
        history = [entry, ...history].sort((a, b) => (b.confirmadaEm ?? b.programadaEm ?? 0) - (a.confirmadaEm ?? a.programadaEm ?? 0)).slice(0, 1000);
      }
      logs = addLog(logs, tomada ? `Dose confirmada: ${nome}` : `Dose não confirmada: ${nome}`, tomada ? "ok" : "erro");
      break;
    }
    case "TAMPA_ABERTA":
      device = { ...device, tampa: "ABERTA" };
      logs = addLog(logs, "Tampa aberta", "info");
      break;
    case "TAMPA_FECHADA":
      device = { ...device, tampa: "FECHADA" };
      logs = addLog(logs, "Tampa fechada", "info");
      break;
    case "ABERTURA_PREMATURA":
      device = { ...device, tampa: "FECHADA" };
      logs = addLog(logs, "Tampa fechada antes de 5 s — alarme retomado", "aviso");
      break;
    default:
      logs = addLog(logs, `Evento: ${ev.evento ?? "desconhecido"}`, "info");
  }
  return { ...s, seqs, lastSeq, records, history, logs, device };
}

// ---------------------------------------------------------------------------

interface Ctx {
  state: State;
  agenda: AgendaItem[];
  salvarMed: (m: Medication) => void;
  excluirMed: (id: string) => void;
  cancelarMed: (id: string) => void;
  reenviar: () => void;
  enviarComando: (cmd: string, extra?: Record<string, unknown>) => boolean;
  reconectar: () => void;
}

const AppCtx = createContext<Ctx | null>(null);

type Waiter = (v: any) => void;

export function AppStoreProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initial);
  const stateRef = useRef(state);
  stateRef.current = state;
  const waiters = useRef(new Map<string, Waiter>());
  const sending = useRef(false);

  // ---- Hidratação / persistência local ----
  useEffect(() => {
    (async () => {
      const raw = await storage.getItem(STORAGE_KEY, null);
      let data: Partial<State> = {};
      if (typeof raw === "string") {
        try {
          data = JSON.parse(raw);
        } catch {}
      }
      if (data.sync?.status === "ENVIANDO" || data.sync?.status === "ENVIADA") data.sync = { ...data.sync, status: "PENDENTE" };
      dispatch({ type: "HYDRATE", data });
    })();
  }, []);

  useEffect(() => {
    if (!state.hydrated) return;
    const t = setTimeout(() => {
      const { meds, records, history, seqs, lastSeq, sync, device, logs } = state;
      storage.setItem(STORAGE_KEY, JSON.stringify({ meds, records, history, seqs, lastSeq, sync, device: { ...device, online: null, statusAt: 0 }, logs }));
    }, 400);
    return () => clearTimeout(t);
  }, [state]);

  // ---- Relógio para recalcular estados ----
  useEffect(() => {
    const i = setInterval(() => dispatch({ type: "TICK" }), 20_000);
    return () => clearInterval(i);
  }, []);

  // ---- MQTT ----
  const waitFor = useCallback((key: string, ms: number) => {
    return new Promise<any>((resolve) => {
      const t = setTimeout(() => {
        waiters.current.delete(key);
        resolve(null);
      }, ms);
      waiters.current.set(key, (v) => {
        clearTimeout(t);
        waiters.current.delete(key);
        resolve(v);
      });
    });
  }, []);

  const onMessage = useCallback((topic: string, payload: string, retained: boolean) => {
    if (topic === TOPICOS.online) {
      const p = payload.trim().toLowerCase();
      const online = p === "online" || p === "1" || p === "true" || p.includes('"online":true');
      const was = stateRef.current.device.online;
      dispatch({ type: "ONLINE", online, retained });
      if (!online && was === true) notificarAgora("Caixa desconectada", "A caixa de remédios está offline. Os alarmes continuam funcionando localmente.");
      return;
    }
    let obj: any;
    try {
      obj = JSON.parse(payload);
    } catch {
      return;
    }
    if (obj?.device && obj.device !== DEVICE_ID) return;
    if (topic === TOPICOS.status) dispatch({ type: "STATUS", status: obj, retained });
    else if (topic === TOPICOS.evento) {
      const dup = typeof obj.seq === "number" && stateRef.current.seqs.includes(obj.seq);
      dispatch({ type: "EVENT", ev: obj });
      if (!dup && !obj.reenvio && !retained) {
        const nome = obj.nome || stateRef.current.meds.find((m) => m.id === obj.medication_id)?.nome || "Medicamento";
        if (obj.evento === "LEMBRETE_INICIADO" || obj.evento === "ALARME_INICIO") notificarAgora("Dose em andamento", `A caixa está alarmando: ${nome}. Abra a tampa por 5 segundos.`);
        if (obj.evento === "DOSE_ATRASADA") notificarAgora("Dose atrasada", `${nome}: a caixa ainda não foi aberta.`);
        if (obj.evento === "DOSE_TOMADA") notificarAgora("Dose confirmada", `${nome}: abertura da caixa registrada às ${fmtTime(parseIso(obj.data_hora_confirmacao) ?? Date.now())}.`);
      }
    } else if (topic === TOPICOS.ack) {
      if (obj.cmd === "ATUALIZAR_PROGRAMACAO") {
        const key = obj.resultado === "PARTE_OK" ? `${obj.programacao_id}:${obj.parte}` : `${obj.programacao_id}:final`;
        waiters.current.get(key)?.(obj);
      } else if (obj.cmd) {
        dispatch({ type: "LOG", texto: `Caixa confirmou ${obj.cmd}: ${obj.resultado ?? "OK"}`, nivel: obj.resultado === "RECUSADO" ? "erro" : "ok" });
      }
    }
  }, []);

  const onConnected = useCallback(() => {
    // Recupera estado atual e eventos perdidos enquanto o app estava fechado
    mqttService.publishCmd({ cmd: "STATUS", msg_id: novoMsgId() });
    mqttService.publishCmd({ cmd: "SINCRONIZAR", desde_seq: stateRef.current.lastSeq, msg_id: novoMsgId() });
  }, []);

  useEffect(() => {
    if (!state.hydrated) return;
    mqttService.start({ onState: (s) => dispatch({ type: "MQTT", s }), onMessage, onConnected });
    const sub = AppState.addEventListener("change", (st) => {
      if (st === "active") {
        dispatch({ type: "TICK" });
        mqttService.reconnectNow();
      }
    });
    return () => {
      sub.remove();
      mqttService.stop();
    };
  }, [state.hydrated, onMessage, onConnected]);

  // ---- Envio segmentado da programação, com confirmação por parte e ACK final ----
  const enviarProgramacao = useCallback(async () => {
    if (sending.current) return;
    sending.current = true;
    const s = stateRef.current;
    const { programacaoId: pid, versao } = s.sync;
    const patch = (p: Partial<SyncState>) => dispatch({ type: "SYNC_PATCH", pid, patch: p });
    try {
      const built = construirPartes(s.meds, s.records, pid, versao, Date.now());
      patch({ status: "ENVIANDO", partesTotal: built.partes.length, partesEnviadas: 0, dosesEnviadas: built.totalDoses, medsEnviados: built.totalMeds, parcial: built.parcial, motivo: undefined });
      const finalP = waitFor(`${pid}:final`, 25_000 + built.partes.length * 9_000);
      let finalAntecipado: any = null;
      finalP.then((v) => (finalAntecipado = v));
      for (let i = 0; i < built.partes.length; i++) {
        const parte = built.partes[i];
        let ok = false;
        for (let tentativa = 0; tentativa < 3 && !ok; tentativa++) {
          if (!mqttService.publishCmd({ ...parte, msg_id: novoMsgId() })) break;
          const r = await waitFor(`${pid}:${parte.parte}`, 8000);
          if (r) ok = true;
          if (finalAntecipado) break;
        }
        if (finalAntecipado) break;
        if (!ok) {
          patch({ status: "FALHA", motivo: `Sem resposta da caixa (parte ${i + 1}/${built.partes.length})` });
          notificarAgora("Falha na sincronização", "A caixa não confirmou a programação. Tentaremos novamente na reconexão.");
          return;
        }
        patch({ partesEnviadas: i + 1, status: i + 1 === built.partes.length ? "ENVIADA" : "ENVIANDO" });
      }
      const fin = finalAntecipado ?? (await finalP);
      if (!fin) {
        patch({ status: "FALHA", motivo: "Confirmação (ACK) não recebida" });
        notificarAgora("Falha na sincronização", "A caixa não confirmou o recebimento da programação.");
      } else if (fin.resultado === "ACEITO") {
        patch({ status: "SINCRONIZADA", ultimaSync: Date.now(), motivo: undefined });
        dispatch({ type: "LOG", texto: `Programação v${versao} aceita: ${fin.medicamentos_recebidos ?? 0} medicamento(s), ${fin.doses_recebidas ?? 0} dose(s)`, nivel: "ok" });
      } else {
        const motivo = fin.motivo ?? "Motivo não informado";
        if (motivo === "VERSAO_ANTIGA" && typeof fin.versao_atual === "number") {
          // Caixa já tem versão maior (ex.: app reinstalado): gera nova versão acima e reenvia
          dispatch({ type: "STATUS", status: { ...(stateRef.current.device.status ?? {}), versao: fin.versao_atual, programacao_id: stateRef.current.device.status?.programacao_id || "?" }, retained: true });
        } else {
          patch({ status: "RECUSADA", motivo });
          notificarAgora("Programação recusada", `A caixa recusou a programação: ${motivo}`);
        }
        dispatch({ type: "LOG", texto: `Programação recusada: ${motivo}`, nivel: "erro" });
      }
    } finally {
      sending.current = false;
      // Uma nova alteração pode ter chegado durante o envio
      dispatch({ type: "TICK" });
    }
  }, [waitFor]);

  useEffect(() => {
    if (!state.hydrated || state.mqtt !== "conectado" || state.device.online !== true) return;
    if (state.sync.status === "PENDENTE" && !sending.current) enviarProgramacao();
  }, [state.hydrated, state.mqtt, state.device.online, state.sync.status, state.sync.programacaoId, state.now, enviarProgramacao]);

  // Programação parcial (mais doses que a capacidade da caixa): reenvia a cada 24 h
  useEffect(() => {
    if (state.sync.parcial && state.sync.status === "SINCRONIZADA" && state.sync.ultimaSync && state.now - state.sync.ultimaSync > DAY) {
      dispatch({ type: "RESYNC" });
    }
  }, [state.now, state.sync]);

  // ---- Agenda + notificações locais ----
  const agenda = useMemo(() => montarAgenda(state.meds, state.records, state.now), [state.meds, state.records, state.now]);
  const notifKey = useMemo(() => agenda.filter((i) => i.status === "AGENDADA" || i.status === "AGUARDANDO").slice(0, 20).map((i) => i.dose.id).join(","), [agenda]);
  const agendaRef = useRef(agenda);
  agendaRef.current = agenda;
  useEffect(() => {
    if (!state.hydrated) return;
    const t = setTimeout(() => reagendarDoses(agendaRef.current, Date.now()), 1200);
    return () => clearTimeout(t);
  }, [notifKey, state.hydrated]);

  const value = useMemo<Ctx>(
    () => ({
      state,
      agenda,
      salvarMed: (med) => dispatch({ type: "UPSERT_MED", med }),
      excluirMed: (id) => dispatch({ type: "DELETE_MED", id }),
      cancelarMed: (id) => dispatch({ type: "CANCEL_MED", id }),
      reenviar: () => dispatch({ type: "RESYNC" }),
      enviarComando: (cmd, extra) => {
        const ok = mqttService.publishCmd({ cmd, ...extra, msg_id: novoMsgId() });
        dispatch({ type: "LOG", texto: ok ? `Comando enviado: ${cmd}` : `Falha ao enviar ${cmd} (sem conexão)`, nivel: ok ? "info" : "erro" });
        return ok;
      },
      reconectar: () => mqttService.reconnectNow(),
    }),
    [state, agenda],
  );

  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>;
}

export function useApp() {
  const c = useContext(AppCtx);
  if (!c) throw new Error("useApp fora do AppStoreProvider");
  return c;
}

export type NivelConexao = "ok" | "instavel" | "offline";

export function useConexao(): { nivel: NivelConexao; texto: string } {
  const { state } = useApp();
  const { mqtt, device, now } = state;
  if (mqtt === "conectando") return { nivel: "instavel", texto: "Conectando ao broker…" };
  if (mqtt !== "conectado") return { nivel: "offline", texto: "Sem conexão com o broker" };
  if (device.online === false) return { nivel: "offline", texto: "Caixa offline" };
  if (device.online === null && !device.status) return { nivel: "instavel", texto: "Aguardando a caixa…" };
  if (!device.statusAt || now - device.statusAt > STATUS_STALE_MS) return { nivel: "instavel", texto: "Conexão instável" };
  if (typeof device.status?.rssi === "number" && device.status.rssi < -80) return { nivel: "instavel", texto: "Sinal Wi-Fi fraco" };
  return { nivel: "ok", texto: "Caixa conectada" };
}
