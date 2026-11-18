// =====================================================================
//  Caixa de Remédios Inteligente IoT — config.h
//  Católica SC · Engenharia de Software · Internet das Coisas
//  Etapa 5 – Programação individualizada pelo aplicativo (base: Etapa 4)
//
//  Tudo que muda entre o laboratório, o simulador e a apresentação
//  fica neste arquivo. O restante do firmware não precisa ser editado.
//  Não versione este arquivo com a senha real do Wi-Fi.
// =====================================================================
#pragma once

// ---------- Identificação ----------
#define DEVICE_ID         "remedios01"
#define FIRMWARE_VERSAO   "0.5.0-etapa5"

// ---------- Wi-Fi ----------
// No simulador Wokwi use "Wokwi-GUEST" e senha vazia.
// No laboratório, troque pela rede da sala ou pelo roteador do celular (2.4 GHz).
#define WIFI_SSID         "Wokwi-GUEST"
#define WIFI_SENHA        ""

// ---------- MQTT (broker público, sem autenticação: apenas protótipo) ----------
#define MQTT_HOST         "broker.hivemq.com"
#define MQTT_PORTA        1883
#define TOPICO_BASE       "catolica/iot/remedios01/"

// ---------- Relógio ----------
#define NTP_SERVIDOR      "pool.ntp.org"
#define FUSO_HORARIO      "<-03>3"      // UTC−3 (Brasília, sem horário de verão)
#define FUSO_ROTULO       "-03:00"
#define FUSO_OFFSET_S     (-3 * 3600)

// ---------- GPIOs (ESP-WROOM-32: tampa D12, buzzer D22, LED D23) ----------
// No Wokwi o reed switch MC-38 é representado por um slide-switch:
//   pino 1 = GND, pino 2 (comum) = GPIO12. Posição ligada ao GND = tampa FECHADA.
#define PIN_TAMPA         12            // Reed switch MC-38 · INPUT_PULLUP · LOW = fechada
#define PIN_BUZZER        22            // Base do BC547 via 1 kΩ · HIGH = buzzer ligado
#define PIN_LED           23            // LED vermelho via 220 Ω (alarme)
#define PIN_LED_REDE      2             // LED azul: aceso = conectado ao broker MQTT

// ---------- Regras da automação ----------
#define TOLERANCIA_MIN_PADRAO  10       // minutos até a dose ser considerada ATRASADA
#define MAX_HORARIOS           6        // horários diários do comando legado HORARIOS
#define DEBOUNCE_MS            50       // filtro do reed switch
#define CONFIRMA_ABERTURA_MS   5000     // tampa aberta CONTÍNUA para confirmar a dose
#define JANELA_PERDIDA_S       (6 * 3600) // dose não atendida após 6 h => DOSE_PERDIDA

// ---------- Padrões de luz e som (ms) ----------
#define LED_PISCA_DOSE_MS      500      // HORA DA DOSE: pisca lento
#define LED_PISCA_ATRASO_MS    150      // DOSE ATRASADA: pisca rápido
#define BIPE_LIGADO_MS         200
#define BIPE_DESLIGADO_DOSE_MS 800      // 1 bipe por segundo
#define BIPE_DESLIGADO_ATRASO_MS 300    // bipes mais insistentes no atraso

// ---------- Rede e telemetria ----------
#define RECONEXAO_MS           5000     // nova tentativa de Wi-Fi e de MQTT a cada 5 s
#define MQTT_TIMEOUT_S         3        // limite de 3 s por tentativa no broker
#define STATUS_INTERVALO_MS    30000    // telemetria periódica

// ---------- Limites de memória ----------
#define MAX_FILA               20       // eventos guardados sem conexão (descarta o mais antigo)
#define MAX_HIST               30       // doses tomadas/perdidas guardadas p/ SINCRONIZAR
#define MQTT_BUFFER            4096     // PubSubClient: padrão 256 B (ampliado com setBufferSize)
#define MAX_MEDS               20
#define MAX_DOSES              400
#define MAX_PARTES             64
#define SEGMENTO_TIMEOUT_MS    60000    // tempo máximo entre partes da programação
