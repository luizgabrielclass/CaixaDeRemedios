export type DoseStatus =
  | "AGENDADA"
  | "AGUARDANDO"
  | "EM_ANDAMENTO"
  | "TOMADA"
  | "ATRASADA"
  | "CANCELADA";

export interface Dose {
  id: string;
  epoch: number; // ms UTC
}

export interface Medication {
  id: string;
  nome: string;
  dosagem: string;
  quantidade: number;
  intervaloHoras: number;
  duracaoDias: number;
  dataInicio: string; // YYYY-MM-DD (fuso da caixa)
  horarioInicio: string; // HH:mm
  observacoes: string;
  cancelado: boolean;
  criadoEm: number;
  atualizadoEm: number;
  doses: Dose[];
}

export interface DoseRecord {
  status: "EM_ANDAMENTO" | "TOMADA" | "PERDIDA";
  alarmeEm?: number;
  confirmadaEm?: number;
  origem?: string;
}

export interface HistoryEntry {
  key: string;
  doseId: string | null;
  medicationId: string | null;
  nome: string;
  dosagem: string;
  programadaEm: number | null;
  horario?: string; // agenda fixa (HORARIOS) ou lembrete remoto
  confirmadaEm: number | null;
  status: "TOMADA" | "PERDIDA";
  atrasoMin: number;
  origem: string;
  seq: number | null;
}

export type SyncStatus = "SINCRONIZADA" | "PENDENTE" | "ENVIANDO" | "ENVIADA" | "RECUSADA" | "FALHA";

export interface SyncState {
  programacaoId: string;
  versao: number;
  status: SyncStatus;
  motivo?: string;
  atualizadoEm: number;
  ultimaSync: number | null;
  partesTotal: number;
  partesEnviadas: number;
  dosesEnviadas: number;
  medsEnviados: number;
  parcial: boolean;
}

export type MqttState = "conectando" | "conectado" | "desconectado";

export interface DeviceStatus {
  device?: string;
  // Campos da Etapa 4 (firmware 0.4.x / 0.5.x)
  estado?: "ESPERA" | "HORA_DA_DOSE" | "DOSE_ATRASADA" | string;
  relogio?: "OK" | "SEM_RELOGIO" | string;
  wifi?: boolean | string;
  mqtt?: boolean | string;
  fila?: number;
  descartados?: number;
  fw?: string;
  modo?: "PROGRAMACAO" | "HORARIOS" | string;
  proxima_dose_info?: { dose_id?: string; medication_id?: string; nome?: string; data_hora_programada?: string } | null;
  rssi?: number;
  ip?: string;
  tampa?: "ABERTA" | "FECHADA";
  alarme?: string;
  programacao_id?: string;
  versao?: number;
  total_doses?: number;
  doses_pendentes?: number;
  proxima_dose?: string | { dose_id?: string; medication_id?: string; nome?: string; data_hora_programada?: string } | null;
  fila_pendente?: number;
  hora_sincronizada?: boolean;
  uptime_s?: number;
  firmware?: string;
  ts?: string;
}

export interface DeviceState {
  online: boolean | null;
  onlineAt: number | null;
  status: DeviceStatus | null;
  statusAt: number | null; // 0 = mensagem retida (antiga)
  tampa: "ABERTA" | "FECHADA" | null;
}

export interface LogEntry {
  id: string;
  ts: number;
  texto: string;
  nivel: "info" | "ok" | "aviso" | "erro";
}
