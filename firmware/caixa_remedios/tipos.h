// =====================================================================
//  Caixa de Remédios Inteligente IoT — tipos.h
//  Estruturas em arquivo separado: o pré-processador do Arduino gera os
//  protótipos das funções antes do código, então os tipos precisam vir de um .h
// =====================================================================
#pragma once
#include <stdint.h>
#include "config.h"

// ------------------------------ Estados -------------------------------------
enum Estado { EM_ESPERA, HORA_DA_DOSE, DOSE_ATRASADA };

// ------------------------------ Programação individualizada -----------------
enum DoseSt : uint8_t { DS_AGENDADA = 0, DS_TOMADA = 1, DS_PERDIDA = 2 };
struct Med  { char id[16]; char nome[32]; char dosagem[16]; uint8_t qtd; };
struct Dose { uint32_t epoch; char id[24]; uint8_t med; uint8_t status; uint8_t pad[2]; };
struct Programacao {
  uint32_t magic; char progId[28]; uint32_t versao; uint16_t nMeds; uint16_t nDoses;
  Med meds[MAX_MEDS]; Dose doses[MAX_DOSES];
};
