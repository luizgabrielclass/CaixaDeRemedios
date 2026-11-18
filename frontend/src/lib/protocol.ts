import { DEVICE_ID, JANELA_ENVIO_PASSADO_H, MAX_BYTES_PARTE, MAX_DOSES_DISPOSITIVO, TZ_LABEL } from "../config";
import { DoseRecord, Medication } from "../types";
import { HOUR, isoLocal } from "./time";

/**
 * Protocolo ATUALIZAR_PROGRAMACAO segmentado.
 * Cada parte é um JSON completo e válido. O ESP32 acumula as partes em uma área
 * temporária e só ativa a nova versão depois de receber/validar TODAS (total_partes),
 * conferindo total_medicamentos e total_doses. Um mesmo medicamento pode aparecer
 * em várias partes (as doses são concatenadas pelo medication_id).
 */
export interface ProgramacaoConstruida {
  partes: Record<string, unknown>[];
  totalDoses: number;
  totalMeds: number;
  parcial: boolean; // true se havia mais doses do que a caixa comporta
}

export function construirPartes(
  meds: Medication[],
  records: Record<string, DoseRecord>,
  programacaoId: string,
  versao: number,
  now: number,
): ProgramacaoConstruida {
  const limite = now - JANELA_ENVIO_PASSADO_H * HOUR;
  // Doses elegíveis: tratamento não cancelado, ainda não tomadas/perdidas, não muito antigas
  const elegiveis: { medId: string; id: string; epoch: number }[] = [];
  for (const m of meds) {
    if (m.cancelado) continue;
    for (const d of m.doses) {
      const st = records[d.id]?.status;
      if (st === "TOMADA" || st === "PERDIDA") continue;
      if (d.epoch < limite) continue;
      elegiveis.push({ medId: m.id, id: d.id, epoch: d.epoch });
    }
  }
  elegiveis.sort((a, b) => a.epoch - b.epoch);
  const parcial = elegiveis.length > MAX_DOSES_DISPOSITIVO;
  const enviadas = elegiveis.slice(0, MAX_DOSES_DISPOSITIVO);
  const porMed = new Map<string, typeof enviadas>();
  for (const d of enviadas) {
    if (!porMed.has(d.medId)) porMed.set(d.medId, []);
    porMed.get(d.medId)!.push(d);
  }

  const header = (parte: number) => ({
    cmd: "ATUALIZAR_PROGRAMACAO",
    programacao_id: programacaoId,
    versao,
    device: DEVICE_ID,
    timezone: TZ_LABEL,
    parte,
    total_partes: 0,
    total_medicamentos: 0,
    total_doses: 0,
    medicamentos: [] as Record<string, unknown>[],
  });

  const partes: ReturnType<typeof header>[] = [];
  let atual = header(1);
  let tamanho = JSON.stringify(atual).length + 60; // folga p/ msg_id e totais

  const novaParte = () => {
    partes.push(atual);
    atual = header(partes.length + 1);
    tamanho = JSON.stringify(atual).length + 60;
  };

  for (const m of meds) {
    const doses = porMed.get(m.id);
    if (!doses?.length) continue;
    const medHeader = () => ({
      medication_id: m.id,
      nome: m.nome.slice(0, 31),
      dosagem: m.dosagem.slice(0, 15),
      quantidade_por_dose: m.quantidade,
      data_inicio: m.dataInicio,
      horario_inicio: m.horarioInicio,
      intervalo_horas: m.intervaloHoras,
      duracao_dias: m.duracaoDias,
      doses: [] as Record<string, unknown>[],
    });
    let medObj = medHeader();
    const medSize = () => JSON.stringify(medObj).length + 1;
    if (tamanho + medSize() + 100 > MAX_BYTES_PARTE && atual.medicamentos.length) novaParte();
    atual.medicamentos.push(medObj);
    tamanho += medSize();
    for (const d of doses) {
      const doseObj = { dose_id: d.id, data_hora_programada: isoLocal(d.epoch), status: "AGENDADA" };
      const ds = JSON.stringify(doseObj).length + 1;
      if (tamanho + ds > MAX_BYTES_PARTE && medObj.doses.length) {
        novaParte();
        medObj = medHeader();
        atual.medicamentos.push(medObj);
        tamanho += medSize();
      }
      medObj.doses.push(doseObj);
      tamanho += ds;
    }
  }
  partes.push(atual);

  for (const p of partes) {
    p.total_partes = partes.length;
    p.total_medicamentos = porMed.size;
    p.total_doses = enviadas.length;
  }
  return { partes, totalDoses: enviadas.length, totalMeds: porMed.size, parcial };
}

export const novoMsgId = () => "m" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
