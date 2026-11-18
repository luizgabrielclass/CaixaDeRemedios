import { JANELA_AGUARDANDO_MIN, TOLERANCIA_ATRASO_MIN } from "../config";
import { Dose, DoseRecord, DoseStatus, Medication } from "../types";
import { DAY, HOUR, MIN, dayKey, dayLabel, fromLocal } from "./time";

export const MAX_DOSES_POR_MEDICAMENTO = 2000;

export function novoId(prefix: string) {
  return prefix + Date.now().toString(36).slice(-5) + Math.random().toString(36).slice(2, 5);
}

// ID determinístico por horário: se a edição mantém um horário, a dose mantém o ID
// (e o histórico/estado associado a ela).
export const doseIdFor = (medId: string, epoch: number) => `${medId}_${Math.floor(epoch / MIN).toString(36)}`;

/**
 * Calcula todas as administrações a partir da data/hora inicial somando o
 * intervalo real (não repetição diária) até o fim do tratamento.
 * Fim = início + duração em dias (exclusivo).
 */
export function gerarDoses(
  medId: string,
  dataInicio: string,
  horarioInicio: string,
  intervaloHoras: number,
  duracaoDias: number,
): Dose[] {
  if (!(intervaloHoras > 0) || !(duracaoDias > 0)) return [];
  const start = fromLocal(dataInicio, horarioInicio);
  const end = start + duracaoDias * DAY;
  const step = Math.round(intervaloHoras * HOUR);
  const out: Dose[] = [];
  for (let t = start; t < end && out.length < MAX_DOSES_POR_MEDICAMENTO; t += step) {
    out.push({ id: doseIdFor(medId, t), epoch: t });
  }
  return out;
}

export function statusDose(med: Medication, dose: Dose, rec: DoseRecord | undefined, now: number): DoseStatus {
  if (rec?.status === "TOMADA") return "TOMADA";
  if (med.cancelado) return "CANCELADA";
  if (rec?.status === "PERDIDA") return "ATRASADA";
  const late = now > dose.epoch + TOLERANCIA_ATRASO_MIN * MIN;
  if (late) return "ATRASADA";
  if (rec?.status === "EM_ANDAMENTO") return "EM_ANDAMENTO";
  if (dose.epoch - now <= JANELA_AGUARDANDO_MIN * MIN) return "AGUARDANDO";
  return "AGENDADA";
}

export type TratamentoStatus = "NAO_INICIADO" | "ATIVO" | "CONCLUIDO" | "CANCELADO";

export function statusTratamento(med: Medication, now: number): TratamentoStatus {
  if (med.cancelado) return "CANCELADO";
  if (!med.doses.length) return "CONCLUIDO";
  const first = med.doses[0].epoch;
  const last = med.doses[med.doses.length - 1].epoch;
  if (now < first) return "NAO_INICIADO";
  if (now > last + TOLERANCIA_ATRASO_MIN * MIN) return "CONCLUIDO";
  return "ATIVO";
}

export interface AgendaItem {
  med: Medication;
  dose: Dose;
  status: DoseStatus;
  rec?: DoseRecord;
}

export function montarAgenda(meds: Medication[], records: Record<string, DoseRecord>, now: number): AgendaItem[] {
  const items: AgendaItem[] = [];
  for (const med of meds) {
    for (const dose of med.doses) {
      const rec = records[dose.id];
      items.push({ med, dose, rec, status: statusDose(med, dose, rec, now) });
    }
  }
  return items.sort((a, b) => a.dose.epoch - b.dose.epoch);
}

const ABERTAS: DoseStatus[] = ["AGENDADA", "AGUARDANDO", "EM_ANDAMENTO"];
export const isAberta = (s: DoseStatus) => ABERTAS.includes(s);

export function proximaDose(items: AgendaItem[]): AgendaItem | null {
  return items.find((i) => isAberta(i.status)) ?? null;
}

export function proximaDoseDoMed(med: Medication, records: Record<string, DoseRecord>, now: number) {
  return med.doses.find((d) => isAberta(statusDose(med, d, records[d.id], now))) ?? null;
}

export interface DiaSecao {
  key: string;
  title: string;
  data: AgendaItem[];
}

export function agruparPorDia(items: AgendaItem[], now: number): DiaSecao[] {
  const map = new Map<string, AgendaItem[]>();
  for (const it of items) {
    const k = dayKey(it.dose.epoch);
    if (!map.has(k)) map.set(k, []);
    map.get(k)!.push(it);
  }
  return [...map.entries()].map(([key, data]) => ({ key, title: dayLabel(key, now), data }));
}

export function frequenciaLabel(h: number) {
  if (h === 24) return "1x ao dia";
  if (24 % h === 0) return `A cada ${h} h (${24 / h}x ao dia)`;
  return `A cada ${h} h`;
}

export const duracaoLabel = (d: number) => (d === 1 ? "1 dia" : `${d} dias`);
