// Configuração central. Endereços vêm do .env (nunca fixos no código).
export const MQTT_WS_URL = process.env.EXPO_PUBLIC_MQTT_WS_URL as string; // ex.: wss://broker.hivemq.com:8884/mqtt
export const MQTT_PREFIX = process.env.EXPO_PUBLIC_MQTT_PREFIX as string; // ex.: catolica/iot/remedios01/
export const DEVICE_ID = process.env.EXPO_PUBLIC_DEVICE_ID as string; // ex.: remedios01

// Fuso horário fixo da caixa (Brasília, sem horário de verão). Deve casar com o firmware.
export const TZ_OFFSET_MIN = -180;
export const TZ_LABEL = "-03:00";

export const TOLERANCIA_ATRASO_MIN = 10; // igual ao firmware (TOLERANCIA_MIN_PADRAO): após isso a dose é ATRASADA
export const JANELA_AGUARDANDO_MIN = 60; // dose futura dentro dessa janela = AGUARDANDO
export const JANELA_ENVIO_PASSADO_H = 6; // doses vencidas há até 6h ainda vão para a caixa (ela alarma atrasado)
export const MAX_DOSES_DISPOSITIVO = 400; // limite de armazenamento do firmware
export const MAX_BYTES_PARTE = 1800; // tamanho alvo de cada segmento MQTT (buffer do firmware = 4096)
export const STATUS_STALE_MS = 90_000; // firmware publica status a cada 30 s
