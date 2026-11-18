import { TZ_LABEL, TZ_OFFSET_MIN } from "../config";

// Todas as datas são tratadas no fuso fixo da caixa (TZ_OFFSET_MIN),
// independentemente do fuso do celular. Assim app e ESP32 sempre concordam.
const OFF = TZ_OFFSET_MIN * 60_000;
export const MIN = 60_000;
export const HOUR = 3_600_000;
export const DAY = 86_400_000;

const pad = (n: number) => String(n).padStart(2, "0");
const WD = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const WD_LONG = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];

export function parts(epoch: number) {
  const d = new Date(epoch + OFF);
  return {
    y: d.getUTCFullYear(),
    mo: d.getUTCMonth() + 1,
    d: d.getUTCDate(),
    h: d.getUTCHours(),
    mi: d.getUTCMinutes(),
    s: d.getUTCSeconds(),
    wd: d.getUTCDay(),
  };
}

export function fromLocal(date: string, time: string): number {
  const [y, m, d] = date.split("-").map(Number);
  const [h, mi] = time.split(":").map(Number);
  return Date.UTC(y, m - 1, d, h, mi) - OFF;
}

export function isoLocal(epoch: number): string {
  const p = parts(epoch);
  return `${p.y}-${pad(p.mo)}-${pad(p.d)}T${pad(p.h)}:${pad(p.mi)}:${pad(p.s)}${TZ_LABEL}`;
}

export function parseIso(str?: string | null): number | null {
  if (!str) return null;
  const t = Date.parse(str);
  return Number.isNaN(t) ? null : t;
}

export const dayKey = (e: number) => {
  const p = parts(e);
  return `${p.y}-${pad(p.mo)}-${pad(p.d)}`;
};
export const fmtTime = (e: number) => {
  const p = parts(e);
  return `${pad(p.h)}:${pad(p.mi)}`;
};
export const fmtDate = (e: number) => {
  const p = parts(e);
  return `${pad(p.d)}/${pad(p.mo)}/${p.y}`;
};
export const fmtDateTime = (e: number) => `${fmtDate(e)} ${fmtTime(e)}`;
export const keyToBr = (key: string) => {
  const [y, m, d] = key.split("-");
  return `${d}/${m}/${y}`;
};

export function fmtLongToday(e: number) {
  const p = parts(e);
  return `${WD_LONG[p.wd]}, ${p.d} de ${MESES[p.mo - 1]}`;
}

export function dayLabel(key: string, now: number): string {
  const today = dayKey(now);
  if (key === today) return "Hoje";
  if (key === dayKey(now + DAY)) return "Amanhã";
  if (key === dayKey(now - DAY)) return "Ontem";
  const e = fromLocal(key, "12:00");
  const p = parts(e);
  return `${WD[p.wd]}, ${pad(p.d)}/${pad(p.mo)}`;
}

export function saudacao(now: number) {
  const h = parts(now).h;
  if (h < 12) return "Bom dia";
  if (h < 18) return "Boa tarde";
  return "Boa noite";
}

export function validDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  return dayKey(fromLocal(s, "12:00")) === s;
}
export function validTime(s: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
}

export function fmtRelative(ms: number): string {
  const abs = Math.abs(ms);
  const m = Math.round(abs / MIN);
  let t: string;
  if (m < 1) t = "menos de 1 min";
  else if (m < 60) t = `${m} min`;
  else if (m < 1440) t = `${Math.floor(m / 60)} h ${pad(m % 60)} min`;
  else t = `${Math.floor(m / 1440)} d ${Math.floor((m % 1440) / 60)} h`;
  return ms >= 0 ? `em ${t}` : `há ${t}`;
}

export function fmtAtraso(min: number): string {
  if (min <= 0) return "No horário";
  if (min < 60) return `${min} min de atraso`;
  return `${Math.floor(min / 60)} h ${pad(min % 60)} min de atraso`;
}

// Converte um Date do seletor nativo (fuso do celular) em strings do fuso da caixa
export const pickerDateToKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const pickerDateToTime = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
export function keyToPickerDate(key: string, time = "12:00"): Date {
  const [y, m, d] = key.split("-").map(Number);
  const [h, mi] = time.split(":").map(Number);
  return new Date(y, m - 1, d, h, mi);
}
