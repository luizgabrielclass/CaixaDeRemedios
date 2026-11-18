// =====================================================================
//  Caixa de Remédios Inteligente IoT — firmware 0.5.0-etapa5
//  Base: Etapa 3 (lógica local) + Etapa 4 (MQTT, fila, Last Will)
//  Novo: programação individualizada (ATUALIZAR_PROGRAMACAO segmentado)
//        e confirmação da dose com tampa aberta CONTÍNUA por 5 s.
//
//  Tópicos (TOPICO_BASE = catolica/iot/remedios01/):
//    online (retido)  "online" ao conectar / "offline" (Last Will)
//    status (retido)  a cada 30 s e a cada mudança de estado ou tampa
//    evento           LEMBRETE_INICIADO, DOSE_ATRASADA, DOSE_TOMADA,
//                     ABERTURA_FORA_DE_HORARIO, HORARIOS_ATUALIZADOS,
//                     ABERTURA_PREMATURA, DOSE_PERDIDA
//    cmd  (QoS 1)     LEMBRETE, HORARIOS, ATUALIZAR_PROGRAMACAO, STATUS,
//                     SINCRONIZAR, TESTE_BUZZER, TESTE_LED
//    ack              resposta a cada comando
//
//  A PubSubClient publica só em QoS 0; a perda é compensada pela fila
//  local de 20 eventos, pelo seq (NVS) e pelo status periódico.
//  Toda a lógica é não bloqueante (millis), sem delay() no loop.
// =====================================================================
#include <WiFi.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>
#include <Preferences.h>
#include <LittleFS.h>
#include <time.h>
#include <sys/time.h>
#include "config.h"
#include "tipos.h"

#define T_ONLINE TOPICO_BASE "online"
#define T_STATUS TOPICO_BASE "status"
#define T_EVENTO TOPICO_BASE "evento"
#define T_CMD    TOPICO_BASE "cmd"
#define T_ACK    TOPICO_BASE "ack"
#define PROG_MAGIC 0xCA1A0005
#define MAX_AL_DOSES 8

// ------------------------------ Estados -------------------------------------
const char* nomeEstado(Estado e) {
  switch (e) {
    case HORA_DA_DOSE:  return "HORA_DA_DOSE";
    case DOSE_ATRASADA: return "DOSE_ATRASADA";
    default:            return "ESPERA";
  }
}

Programacao prog;            // ativa (LittleFS /prog.bin)
Programacao stg;             // área temporária da recepção segmentada
bool     stgAtivo = false;
uint8_t  stgTotal = 0;
uint64_t stgMask = 0;
int32_t  stgEspMeds = -1, stgEspDoses = -1;
uint32_t stgUltimaMs = 0;

// ------------------------------ Globais (base Etapa 3) ----------------------
Preferences  nvs;
WiFiClient   rede;
PubSubClient mqtt(rede);

Estado   estado          = EM_ESPERA;
uint32_t inicioLembrete  = 0;
int      horarioLembrete = -1;          // minuto do dia (agenda legada / remoto)
const char* origemLembrete = "AGENDA";
uint8_t  toleranciaMin   = TOLERANCIA_MIN_PADRAO;
char     alDoses[MAX_AL_DOSES][24];     // doses da programação neste alarme
uint8_t  alN             = 0;

uint16_t agenda[MAX_HORARIOS];          // comando legado HORARIOS
uint8_t  qtdHorarios     = 0;
long     ultimoDisparo   = -1;

bool     tampaAberta     = false;
bool     leituraAnterior = false;
uint32_t mudouEm         = 0;
bool     precisaFechar   = false;       // tampa já estava aberta quando o alarme começou
bool     contandoAbertura = false;
uint32_t aberturaEm      = 0;

bool     ledLigado = false, buzzerLigado = false;
uint32_t ultimoPiscaLed = 0, ultimoBipe = 0;
uint32_t testeBuzzerAte = 0, testeLedAte = 0;

bool     relogioValido = false, ntpConfigurado = false, wifiAntes = false;
uint32_t ultimaTentativaWifi = 0, ultimaTentativaMqtt = 0, ultimoStatus = 0;
bool     simularQuedaMqtt = false, simularQuedaWifi = false;   // testes T18/T19 pelo Serial

uint32_t seqEvento = 0;
String   fila[MAX_FILA];  uint8_t nFila = 0;  uint32_t descartados = 0;
String   hist[MAX_HIST];  uint8_t nHist = 0;
String   msgIds[10];      uint8_t msgIdx = 0;
String   linhaSerial;
static char rxBuf[MQTT_BUFFER + 1];

// ------------------------------ Tempo ---------------------------------------
String minutoParaTexto(int m) {
  if (m < 0 || m >= 1440) m = 0;
  char buf[8]; snprintf(buf, sizeof(buf), "%02d:%02d", m / 60, m % 60);
  return String(buf);
}
int textoParaMinuto(const char* s) {
  if (s == nullptr || strlen(s) != 5 || s[2] != ':') return -1;
  if (!isdigit(s[0]) || !isdigit(s[1]) || !isdigit(s[3]) || !isdigit(s[4])) return -1;
  int h = (s[0] - '0') * 10 + (s[1] - '0'), m = (s[3] - '0') * 10 + (s[4] - '0');
  if (h > 23 || m > 59) return -1;
  return h * 60 + m;
}
bool horaAtual(struct tm& t) {
  time_t agora = time(nullptr);
  if (agora < 1700000000) return false;
  localtime_r(&agora, &t);
  return true;
}
String carimboISO() {
  struct tm t;
  if (!horaAtual(t)) return String("");
  char buf[32]; strftime(buf, sizeof(buf), "%Y-%m-%dT%H:%M:%S" FUSO_ROTULO, &t);
  return String(buf);
}
void epochISO(uint32_t e, char* out, size_t n) {
  time_t t = (time_t)e + FUSO_OFFSET_S; struct tm tmv; gmtime_r(&t, &tmv);
  strftime(out, n, "%Y-%m-%dT%H:%M:%S" FUSO_ROTULO, &tmv);
}
int epochMinutoDia(uint32_t e) {
  time_t t = (time_t)e + FUSO_OFFSET_S; struct tm tmv; gmtime_r(&t, &tmv);
  return tmv.tm_hour * 60 + tmv.tm_min;
}
int64_t diasCivil(int y, unsigned m, unsigned d) {
  y -= m <= 2;
  const int era = (y >= 0 ? y : y - 399) / 400;
  const unsigned yoe = (unsigned)(y - era * 400);
  const unsigned doy = (153 * (m > 2 ? m - 3 : m + 9) + 2) / 5 + d - 1;
  const unsigned doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
  return (int64_t)era * 146097 + (int64_t)doe - 719468;
}
// "2026-11-13T08:00:00-03:00" -> epoch UTC
bool parseIso(const char* s, uint32_t& out) {
  if (!s || strlen(s) < 19) return false;
  int Y, M, D, h, m, sec;
  if (sscanf(s, "%4d-%2d-%2dT%2d:%2d:%2d", &Y, &M, &D, &h, &m, &sec) != 6) return false;
  if (Y < 2024 || Y > 2100 || M < 1 || M > 12 || D < 1 || D > 31 || h > 23 || m > 59 || sec > 59) return false;
  int32_t off = 0; const char* z = s + 19;
  if (*z == '+' || *z == '-') {
    int oh = 0, om = 0;
    if (sscanf(z + 1, "%2d:%2d", &oh, &om) < 1) return false;
    off = (oh * 3600 + om * 60) * (*z == '-' ? -1 : 1);
  } else if (*z != 'Z' && *z != 0) return false;
  int64_t t = diasCivil(Y, M, D) * 86400LL + h * 3600 + m * 60 + sec - off;
  if (t <= 0) return false;
  out = (uint32_t)t; return true;
}

// ------------------------------ Persistência --------------------------------
bool salvarProg(const Programacao& p) {
  File f = LittleFS.open("/prog.tmp", "w");
  if (!f) return false;
  size_t w = f.write((const uint8_t*)&p, sizeof(Programacao));
  f.close();
  if (w != sizeof(Programacao)) { LittleFS.remove("/prog.tmp"); return false; }
  LittleFS.remove("/prog.bin");
  return LittleFS.rename("/prog.tmp", "/prog.bin");   // anterior só sai após gravar a nova
}
void carregarProg() {
  memset(&prog, 0, sizeof prog);
  File f = LittleFS.open("/prog.bin", "r");
  if (f && f.size() == sizeof(Programacao)) {
    f.read((uint8_t*)&prog, sizeof prog);
    if (prog.magic != PROG_MAGIC || prog.nDoses > MAX_DOSES || prog.nMeds > MAX_MEDS) memset(&prog, 0, sizeof prog);
  }
  if (f) f.close();
}
void salvarLinhas(const char* path, String* arr, uint8_t n) {
  File f = LittleFS.open(path, "w");
  if (!f) return;
  for (uint8_t i = 0; i < n; i++) { f.print(arr[i]); f.print('\n'); }
  f.close();
}
uint8_t carregarLinhas(const char* path, String* arr, uint8_t max) {
  uint8_t n = 0; File f = LittleFS.open(path, "r");
  if (!f) return 0;
  while (f.available() && n < max) { String l = f.readStringUntil('\n'); l.trim(); if (l.length()) arr[n++] = l; }
  f.close(); return n;
}
void salvarAgenda() { nvs.putUChar("qtd", qtdHorarios); nvs.putBytes("agenda", agenda, sizeof(uint16_t) * qtdHorarios); }
void carregarAgenda() {
  qtdHorarios = nvs.getUChar("qtd", 0);
  if (qtdHorarios > MAX_HORARIOS) qtdHorarios = 0;
  if (qtdHorarios > 0) nvs.getBytes("agenda", agenda, sizeof(uint16_t) * qtdHorarios);
  for (uint8_t i = 0; i < qtdHorarios; i++) if (agenda[i] >= 1440) { qtdHorarios = 0; break; }
  if (qtdHorarios == 0) { agenda[0] = 8 * 60; agenda[1] = 20 * 60; qtdHorarios = 2; salvarAgenda(); }
}

// ------------------------------ Programação: consultas ----------------------
uint16_t dosesPendentes() {
  uint16_t n = 0;
  for (uint16_t i = 0; i < prog.nDoses; i++) if (prog.doses[i].status == DS_AGENDADA) n++;
  return n;
}
// A agenda fixa (HORARIOS) só alarma quando não há programação individual pendente,
// evitando alarme duplicado. Sem programação, o comportamento da Etapa 4 é mantido.
bool modoLegado() { return dosesPendentes() == 0; }

int proximaDoseIdx() {
  uint32_t agora = relogioValido ? (uint32_t)time(nullptr) : 0;
  for (uint16_t i = 0; i < prog.nDoses; i++)
    if (prog.doses[i].status == DS_AGENDADA && (agora == 0 || prog.doses[i].epoch + JANELA_PERDIDA_S >= agora)) return i;
  return -1;
}
int proximaDoseLegada() {
  if (qtdHorarios == 0) return -1;
  struct tm t;
  if (!horaAtual(t)) return agenda[0];
  int agora = t.tm_hour * 60 + t.tm_min;
  for (uint8_t i = 0; i < qtdHorarios; i++) if (agenda[i] > agora) return agenda[i];
  return agenda[0];
}
int buscarDose(const char* id) {
  for (uint16_t i = 0; i < prog.nDoses; i++) if (!strcmp(prog.doses[i].id, id)) return i;
  return -1;
}

// ------------------------------ Publicação ----------------------------------
void publicar(const char* topico, const String& payload, bool retido) {
  Serial.print("["); Serial.print(topico + strlen(TOPICO_BASE)); Serial.print("] "); Serial.println(payload);
  if (mqtt.connected()) mqtt.publish(topico, payload.c_str(), retido);
}
void enfileirar(const String& s) {
  if (nFila >= MAX_FILA) {                     // fila cheia: descarta o mais antigo
    for (uint8_t i = 1; i < MAX_FILA; i++) fila[i - 1] = fila[i];
    nFila--; descartados++;
  }
  fila[nFila++] = s;
  salvarLinhas("/fila.txt", fila, nFila);
}
void esvaziarFila() {
  uint8_t enviados = 0;
  while (enviados < nFila && mqtt.connected()) {   // ordem de seq preservada
    if (!mqtt.publish(T_EVENTO, fila[enviados].c_str(), false)) break;
    enviados++; mqtt.loop();
  }
  if (!enviados) return;
  for (uint8_t i = enviados; i < nFila; i++) fila[i - enviados] = fila[i];
  nFila -= enviados;
  salvarLinhas("/fila.txt", fila, nFila);
  Serial.printf("[fila] %u evento(s) reenviado(s), %u restante(s)\n", enviados, nFila);
}
void registrarHist(const String& s) {
  if (nHist >= MAX_HIST) { for (uint8_t i = 1; i < MAX_HIST; i++) hist[i - 1] = hist[i]; nHist--; }
  hist[nHist++] = s;
  salvarLinhas("/hist.txt", hist, nHist);
}

// Campos comuns (device, seq, ts) + fila offline. seq persistente na NVS.
void publicarEvento(JsonDocument& doc, bool guardarHist = false) {
  seqEvento++;
  nvs.putUInt("seq", seqEvento);
  doc["device"] = DEVICE_ID;
  doc["seq"] = seqEvento;
  String ts = carimboISO();
  if (ts.length()) doc["ts"] = ts; else doc["ts"] = nullptr;
  String out; serializeJson(doc, out);
  if (guardarHist) registrarHist(out);
  Serial.print("[evento] "); Serial.println(out);
  if (!(mqtt.connected() && mqtt.publish(T_EVENTO, out.c_str(), false))) enfileirar(out);
}
// Evento simples no formato da Etapa 3/4
void eventoSimples(const char* evento, int horario, int atrasoMin, bool comOrigem = true) {
  JsonDocument doc;
  doc["evento"] = evento;
  if (horario >= 0) doc["horario"] = minutoParaTexto(horario);
  if (atrasoMin >= 0) doc["atraso_min"] = atrasoMin;
  if (comOrigem) doc["origem"] = origemLembrete;
  publicarEvento(doc, !strcmp(evento, "DOSE_TOMADA"));
}
// Evento de uma dose da programação (formato do protocolo do app)
void eventoDose(const char* evento, int i, int atrasoMin, const char* confirmacao) {
  Dose& d = prog.doses[i];
  JsonDocument doc;
  char iso[32]; epochISO(d.epoch, iso, sizeof iso);
  doc["evento"] = evento;
  doc["medication_id"] = prog.meds[d.med].id;
  doc["nome"] = prog.meds[d.med].nome;
  doc["dose_id"] = d.id;
  doc["horario"] = minutoParaTexto(epochMinutoDia(d.epoch));
  doc["horario_programado"] = minutoParaTexto(epochMinutoDia(d.epoch));
  doc["data_hora_programada"] = iso;
  if (atrasoMin >= 0) doc["atraso_min"] = atrasoMin;
  if (confirmacao) doc["data_hora_confirmacao"] = confirmacao;
  doc["origem"] = "AGENDA";
  publicarEvento(doc, !strcmp(evento, "DOSE_TOMADA") || !strcmp(evento, "DOSE_PERDIDA"));
}

void publicarStatus() {
  JsonDocument doc;
  doc["device"] = DEVICE_ID;
  doc["estado"] = nomeEstado(estado);
  doc["tampa"]  = tampaAberta ? "ABERTA" : "FECHADA";
  int p = proximaDoseIdx();
  if (p >= 0) doc["proxima_dose"] = minutoParaTexto(epochMinutoDia(prog.doses[p].epoch));
  else { int l = proximaDoseLegada(); if (l >= 0) doc["proxima_dose"] = minutoParaTexto(l); else doc["proxima_dose"] = nullptr; }
  doc["relogio"] = relogioValido ? "OK" : "SEM_RELOGIO";
  doc["wifi"]   = (WiFi.status() == WL_CONNECTED);
  if (WiFi.status() == WL_CONNECTED) doc["rssi"] = WiFi.RSSI();
  doc["mqtt"]   = mqtt.connected();
  doc["fila"]   = nFila;
  doc["descartados"] = descartados;
  doc["fw"]     = FIRMWARE_VERSAO;
  doc["uptime_s"] = millis() / 1000;
  // ---- campos novos (Etapa 5) ----
  doc["alarme"] = estado == EM_ESPERA ? "INATIVO" : (contandoAbertura ? "CONFIRMANDO" : "TOCANDO");
  doc["modo"] = modoLegado() ? "HORARIOS" : "PROGRAMACAO";
  doc["programacao_id"] = prog.progId;
  doc["versao"] = prog.versao;
  doc["total_doses"] = prog.nDoses;
  doc["doses_pendentes"] = dosesPendentes();
  if (p >= 0) {
    JsonObject o = doc["proxima_dose_info"].to<JsonObject>();
    char iso[32]; epochISO(prog.doses[p].epoch, iso, sizeof iso);
    o["dose_id"] = prog.doses[p].id;
    o["medication_id"] = prog.meds[prog.doses[p].med].id;
    o["nome"] = prog.meds[prog.doses[p].med].nome;
    o["data_hora_programada"] = iso;
  }
  String ts = carimboISO();
  if (ts.length()) doc["ts"] = ts; else doc["ts"] = nullptr;
  String out; serializeJson(doc, out);
  publicar(T_STATUS, out, true);
  ultimoStatus = millis();
}

void publicarAck(const char* cmd, bool ok, const char* motivo) {
  JsonDocument doc;
  doc["device"] = DEVICE_ID;
  doc["cmd"] = cmd;
  doc["resultado"] = ok ? "OK" : "RECUSADO";
  if (motivo) doc["motivo"] = motivo;
  String ts = carimboISO();
  if (ts.length()) doc["ts"] = ts; else doc["ts"] = nullptr;
  String out; serializeJson(doc, out);
  publicar(T_ACK, out, false);
}
void ackProg(const char* pid, uint32_t ver, const char* resultado, const char* motivo = nullptr, int parte = -1, int total = -1) {
  JsonDocument doc;
  doc["device"] = DEVICE_ID;
  doc["cmd"] = "ATUALIZAR_PROGRAMACAO";
  doc["programacao_id"] = pid;
  doc["versao"] = ver;
  doc["resultado"] = resultado;
  if (motivo) doc["motivo"] = motivo;
  if (parte > 0) { doc["parte"] = parte; doc["total_partes"] = total; }
  if (!strcmp(resultado, "ACEITO")) { doc["medicamentos_recebidos"] = prog.nMeds; doc["doses_recebidas"] = prog.nDoses; }
  if (!strcmp(resultado, "RECUSADO")) doc["versao_atual"] = prog.versao;
  String ts = carimboISO();
  if (ts.length()) doc["ts"] = ts; else doc["ts"] = nullptr;
  String out; serializeJson(doc, out);
  publicar(T_ACK, out, false);
}

// ------------------------------ Saídas --------------------------------------
void setLed(bool on)    { ledLigado = on;    digitalWrite(PIN_LED, on ? HIGH : LOW); }
void setBuzzer(bool on) { buzzerLigado = on; digitalWrite(PIN_BUZZER, on ? HIGH : LOW); }
void desligarAlarme()   { setLed(false); setBuzzer(false); }

void atualizarAlarme() {
  uint32_t agora = millis();
  if (estado == EM_ESPERA) {                     // testes remotos de buzzer/LED
    bool b = testeBuzzerAte && (int32_t)(testeBuzzerAte - agora) > 0;
    bool l = testeLedAte && (int32_t)(testeLedAte - agora) > 0;
    if (!b && testeBuzzerAte) { testeBuzzerAte = 0; setBuzzer(false); }
    if (!l && testeLedAte)    { testeLedAte = 0;    setLed(false); }
    if (b) setBuzzer((agora % 400) < 200);
    if (l) setLed((agora % 300) < 150);
    return;
  }
  if (contandoAbertura) {                        // tampa aberta: buzzer silenciado, LED fixo
    setBuzzer(false); setLed(true);
    return;
  }
  bool atrasada = (estado == DOSE_ATRASADA);
  uint32_t periodoLed = atrasada ? LED_PISCA_ATRASO_MS : LED_PISCA_DOSE_MS;
  if (agora - ultimoPiscaLed >= periodoLed) { ultimoPiscaLed = agora; setLed(!ledLigado); }
  uint32_t limite = buzzerLigado ? BIPE_LIGADO_MS : (atrasada ? BIPE_DESLIGADO_ATRASO_MS : BIPE_DESLIGADO_DOSE_MS);
  if (agora - ultimoBipe >= limite) { ultimoBipe = agora; setBuzzer(!buzzerLigado); }
}

// ------------------------------ Lembrete / alarme ---------------------------
void iniciarLembrete(const char* origem, int horario) {
  estado = HORA_DA_DOSE;
  origemLembrete = origem;
  horarioLembrete = horario;
  inicioLembrete = millis();
  ultimoPiscaLed = ultimoBipe = inicioLembrete;
  testeBuzzerAte = testeLedAte = 0;
  contandoAbertura = false;
  precisaFechar = tampaAberta;
  setLed(true); setBuzzer(true);
  if (tampaAberta) Serial.println("[aviso] Tampa ja estava aberta: feche e abra para registrar a dose.");
}

void adicionarDoseAoAlarme(int i) {
  if (alN >= MAX_AL_DOSES) return;
  strlcpy(alDoses[alN++], prog.doses[i].id, 24);
  if (estado == EM_ESPERA) iniciarLembrete("AGENDA", epochMinutoDia(prog.doses[i].epoch));
  int atraso = relogioValido ? (int)(((uint32_t)time(nullptr) - prog.doses[i].epoch) / 60) : 0;
  eventoDose("LEMBRETE_INICIADO", i, atraso > 0 ? atraso : -1, nullptr);
  publicarStatus();
}

bool alarmeContem(const char* id) {
  for (uint8_t a = 0; a < alN; a++) if (!strcmp(alDoses[a], id)) return true;
  return false;
}

// Tampa aberta por 5 s contínuos: encerra o alarme e registra as doses
void encerrarLembreteComDose() {
  String conf = carimboISO();
  uint32_t agoraEp = (uint32_t)time(nullptr);
  bool mudou = false;
  for (uint8_t a = 0; a < alN; a++) {
    int i = buscarDose(alDoses[a]);
    if (i < 0 || prog.doses[i].status != DS_AGENDADA) continue;
    prog.doses[i].status = DS_TOMADA; mudou = true;
    int atraso = relogioValido && agoraEp > prog.doses[i].epoch ? (int)((agoraEp - prog.doses[i].epoch) / 60) : 0;
    eventoDose("DOSE_TOMADA", i, atraso, conf.length() ? conf.c_str() : nullptr);
  }
  if (alN == 0) {                                // lembrete da agenda fixa ou remoto
    int atraso = (millis() - inicioLembrete) / 60000UL;
    eventoSimples("DOSE_TOMADA", horarioLembrete, atraso);
  }
  if (mudou) salvarProg(prog);
  alN = 0;
  contandoAbertura = false;
  desligarAlarme();
  estado = EM_ESPERA;
  horarioLembrete = -1;
  Serial.println("[dose] Atendimento confirmado (tampa aberta >= 5 s).");
  publicarStatus();
}

void verificarAgenda() {
  struct tm t;
  if (!horaAtual(t)) return;
  uint32_t agoraEp = (uint32_t)time(nullptr);

  // 1) Programação individualizada
  bool mudou = false;
  for (uint16_t i = 0; i < prog.nDoses; i++) {
    Dose& d = prog.doses[i];
    if (d.status != DS_AGENDADA || d.epoch > agoraEp || alarmeContem(d.id)) continue;
    if (agoraEp - d.epoch > JANELA_PERDIDA_S) {    // caixa ficou desligada além da janela
      d.status = DS_PERDIDA; mudou = true;
      eventoDose("DOSE_PERDIDA", i, (agoraEp - d.epoch) / 60, nullptr);
      continue;
    }
    adicionarDoseAoAlarme(i);
  }
  if (mudou) { salvarProg(prog); publicarStatus(); }

  // 2) Agenda fixa (comando HORARIOS) — comportamento da Etapa 3/4
  if (!modoLegado()) return;
  int minutoDia = t.tm_hour * 60 + t.tm_min;
  long marca = (long)t.tm_yday * 1440 + minutoDia;
  if (marca == ultimoDisparo) return;
  for (uint8_t i = 0; i < qtdHorarios; i++) {
    if (agenda[i] == minutoDia) {
      ultimoDisparo = marca;
      if (estado == EM_ESPERA) {
        iniciarLembrete("AGENDA", minutoDia);
        eventoSimples("LEMBRETE_INICIADO", minutoDia, -1);
        publicarStatus();
      } else Serial.println("[aviso] Horario chegou com lembrete ainda ativo; lembrete atual mantido.");
      return;
    }
  }
}

void verificarAtraso() {
  if (estado != HORA_DA_DOSE) return;
  if (millis() - inicioLembrete >= (uint32_t)toleranciaMin * 60000UL) {
    estado = DOSE_ATRASADA;
    if (alN == 0) eventoSimples("DOSE_ATRASADA", horarioLembrete, toleranciaMin);
    for (uint8_t a = 0; a < alN; a++) {
      int i = buscarDose(alDoses[a]);
      if (i >= 0) eventoDose("DOSE_ATRASADA", i, ((uint32_t)time(nullptr) - prog.doses[i].epoch) / 60, nullptr);
    }
    publicarStatus();
  }
}

void lerTampa() {
  bool leitura = (digitalRead(PIN_TAMPA) == HIGH);
  uint32_t agora = millis();
  if (leitura != leituraAnterior) { leituraAnterior = leitura; mudouEm = agora; }
  if (leitura != tampaAberta && (agora - mudouEm) >= DEBOUNCE_MS) {
    tampaAberta = leitura;
    Serial.println(tampaAberta ? "[tampa] ABERTA" : "[tampa] FECHADA");
    if (tampaAberta) {
      if (estado == EM_ESPERA) eventoSimples("ABERTURA_FORA_DE_HORARIO", -1, -1, false);
      else if (!precisaFechar) {               // inicia a contagem de 5 s (não bloqueante)
        contandoAbertura = true;
        aberturaEm = agora;
        Serial.println("[tampa] Mantenha aberta por 5 s para confirmar a dose.");
      }
    } else {
      precisaFechar = false;
      if (contandoAbertura) {                  // fechou antes de 5 s: alarme volta
        contandoAbertura = false;
        ultimoPiscaLed = ultimoBipe = agora;
        JsonDocument doc;
        doc["evento"] = "ABERTURA_PREMATURA";
        doc["duracao_ms"] = agora - aberturaEm;
        if (horarioLembrete >= 0) doc["horario"] = minutoParaTexto(horarioLembrete);
        doc["origem"] = origemLembrete;
        publicarEvento(doc);
        Serial.println("[tampa] Fechada antes de 5 s: alarme retomado.");
      }
    }
    publicarStatus();
  }
  if (contandoAbertura && tampaAberta && agora - aberturaEm >= CONFIRMA_ABERTURA_MS) encerrarLembreteComDose();
}

// ------------------------------ ATUALIZAR_PROGRAMACAO -----------------------
int cmpDose(const void* a, const void* b) {
  uint32_t ea = ((const Dose*)a)->epoch, eb = ((const Dose*)b)->epoch;
  return ea < eb ? -1 : ea > eb ? 1 : 0;
}
void recusarProg(const char* pid, uint32_t ver, const char* motivo) {
  stgAtivo = false;                              // a programação ativa NÃO é alterada
  ackProg(pid, ver, "RECUSADO", motivo);
}
void finalizarProg() {
  if ((stgEspMeds >= 0 && stg.nMeds != stgEspMeds) || (stgEspDoses >= 0 && stg.nDoses != stgEspDoses)) {
    recusarProg(stg.progId, stg.versao, "CONTAGEM_DIVERGENTE"); return;
  }
  qsort(stg.doses, stg.nDoses, sizeof(Dose), cmpDose);          // ordem cronológica
  for (uint16_t i = 0; i < stg.nDoses; i++) {                    // preserva doses já atendidas
    int j = buscarDose(stg.doses[i].id);
    if (j >= 0 && prog.doses[j].status != DS_AGENDADA) stg.doses[i].status = prog.doses[j].status;
  }
  stg.magic = PROG_MAGIC;
  if (!salvarProg(stg)) { recusarProg(stg.progId, stg.versao, "FALHA_ARMAZENAMENTO"); return; }
  memcpy(&prog, &stg, sizeof(Programacao));                      // ativa somente após gravar
  stgAtivo = false;
  // doses de um alarme em andamento que saíram da programação deixam de valer
  uint8_t k = 0;
  for (uint8_t a = 0; a < alN; a++) if (buscarDose(alDoses[a]) >= 0) strlcpy(alDoses[k++], alDoses[a], 24);
  if (alN > 0 && k == 0) { alN = 0; contandoAbertura = false; desligarAlarme(); estado = EM_ESPERA; }
  alN = k;
  Serial.printf("[prog] %s v%u ativa: %u medicamento(s), %u dose(s)\n", prog.progId, prog.versao, prog.nMeds, prog.nDoses);
  ackProg(prog.progId, prog.versao, "ACEITO");
  publicarStatus();
}

void processarProgramacao(JsonDocument& doc) {
  const char* pid = doc["programacao_id"] | "";
  uint32_t ver = doc["versao"] | 0;
  int parte = doc["parte"] | 1, total = doc["total_partes"] | 1;
  if (!*pid || strlen(pid) >= sizeof(stg.progId) || ver == 0 || total < 1 || total > MAX_PARTES || parte < 1 || parte > total) {
    ackProg(pid, ver, "RECUSADO", "ESTRUTURA_INVALIDA"); return;
  }
  if (strcmp(doc["timezone"] | FUSO_ROTULO, FUSO_ROTULO)) { ackProg(pid, ver, "RECUSADO", "TIMEZONE_NAO_SUPORTADO"); return; }
  if (!doc["medicamentos"].is<JsonArray>()) { recusarProg(pid, ver, "ESTRUTURA_INVALIDA"); return; }
  if (prog.magic == PROG_MAGIC && ver == prog.versao && !strcmp(pid, prog.progId)) {   // duplicado
    ackProg(pid, ver, "PARTE_OK", nullptr, parte, total);
    if (parte == total) ackProg(pid, ver, "ACEITO", "DUPLICADO");
    return;
  }
  if (prog.magic == PROG_MAGIC && ver <= prog.versao) { ackProg(pid, ver, "RECUSADO", "VERSAO_ANTIGA"); return; }
  if (!stgAtivo || strcmp(stg.progId, pid) || stg.versao != ver) {
    if (parte != 1) { ackProg(pid, ver, "RECUSADO", "SEGMENTO_FORA_DE_ORDEM"); return; }
    memset(&stg, 0, sizeof stg);
    strlcpy(stg.progId, pid, sizeof stg.progId);
    stg.versao = ver; stgAtivo = true; stgTotal = total; stgMask = 0;
    stgEspMeds = doc["total_medicamentos"] | -1;
    stgEspDoses = doc["total_doses"] | -1;
    if (stgEspDoses > MAX_DOSES) { recusarProg(pid, ver, "LIMITE_DOSES"); return; }
  }
  uint64_t bit = 1ULL << (parte - 1);
  if (stgMask & bit) { ackProg(pid, ver, "PARTE_OK", nullptr, parte, total); return; }

  for (JsonObject m : doc["medicamentos"].as<JsonArray>()) {
    const char* mid = m["medication_id"] | "";
    if (!*mid || strlen(mid) >= sizeof(Med::id)) { recusarProg(pid, ver, "MEDICAMENTO_ID_INVALIDO"); return; }
    int idx = -1;
    for (uint16_t i = 0; i < stg.nMeds; i++) if (!strcmp(stg.meds[i].id, mid)) { idx = i; break; }
    if (idx < 0) {
      if (stg.nMeds >= MAX_MEDS) { recusarProg(pid, ver, "LIMITE_MEDICAMENTOS"); return; }
      idx = stg.nMeds++;
      Med& md = stg.meds[idx];
      strlcpy(md.id, mid, sizeof md.id);
      strlcpy(md.nome, m["nome"] | "", sizeof md.nome);
      strlcpy(md.dosagem, m["dosagem"] | "", sizeof md.dosagem);
      md.qtd = (uint8_t)constrain((int)(m["quantidade_por_dose"] | 1), 1, 50);
    }
    for (JsonObject d : m["doses"].as<JsonArray>()) {
      const char* did = d["dose_id"] | "";
      const char* st = d["status"] | "AGENDADA";
      uint32_t ep;
      if (!*did || strlen(did) >= sizeof(Dose::id)) { recusarProg(pid, ver, "DOSE_ID_INVALIDO"); return; }
      if (!parseIso(d["data_hora_programada"] | "", ep)) { recusarProg(pid, ver, "DATA_HORA_INVALIDA"); return; }
      if (strcmp(st, "AGENDADA") && strcmp(st, "AGUARDANDO")) continue;   // TOMADA/CANCELADA não alarmam
      for (uint16_t i = 0; i < stg.nDoses; i++) if (!strcmp(stg.doses[i].id, did)) { recusarProg(pid, ver, "DOSE_DUPLICADA"); return; }
      if (stg.nDoses >= MAX_DOSES) { recusarProg(pid, ver, "LIMITE_DOSES"); return; }
      Dose& ds = stg.doses[stg.nDoses++];
      ds.epoch = ep; strlcpy(ds.id, did, sizeof ds.id); ds.med = (uint8_t)idx; ds.status = DS_AGENDADA;
    }
  }
  stgMask |= bit;
  stgUltimaMs = millis();
  ackProg(pid, ver, "PARTE_OK", nullptr, parte, total);
  uint64_t completo = stgTotal >= 64 ? ~0ULL : ((1ULL << stgTotal) - 1);
  if (stgMask == completo) finalizarProg();
}

// ------------------------------ Comandos ------------------------------------
void reenviarHistorico(uint32_t desde) {
  for (uint8_t i = 0; i < nHist; i++) {
    JsonDocument d;
    if (deserializeJson(d, hist[i]) || (uint32_t)(d["seq"] | 0) <= desde) continue;
    d["reenvio"] = true;
    String out; serializeJson(d, out);
    if (mqtt.connected()) { mqtt.publish(T_EVENTO, out.c_str(), false); mqtt.loop(); }
  }
}

void processarComando(JsonDocument& doc) {
  const char* cmd = doc["cmd"] | "";
  const char* dev = doc["device"] | DEVICE_ID;
  if (strcmp(dev, DEVICE_ID)) return;
  const char* mid = doc["msg_id"] | "";
  if (*mid) {                                    // prevenção de comandos duplicados
    for (uint8_t i = 0; i < 10; i++) if (msgIds[i] == mid) return;
    msgIds[msgIdx] = mid; msgIdx = (msgIdx + 1) % 10;
  }

  if (strcmp(cmd, "LEMBRETE") == 0) {
    if (estado != EM_ESPERA) { publicarAck("LEMBRETE", false, "LEMBRETE_EM_ANDAMENTO"); return; }
    publicarAck("LEMBRETE", true, nullptr);
    iniciarLembrete("REMOTO", -1);
    eventoSimples("LEMBRETE_INICIADO", -1, -1);
    publicarStatus();
    return;
  }
  if (strcmp(cmd, "HORARIOS") == 0) {
    JsonArray lista = doc["horarios"].as<JsonArray>();
    if (lista.isNull() || lista.size() == 0 || lista.size() > MAX_HORARIOS) { publicarAck("HORARIOS", false, "HORARIO_INVALIDO"); return; }
    uint16_t nova[MAX_HORARIOS]; uint8_t n = 0;
    for (JsonVariant v : lista) {
      int m = textoParaMinuto(v.as<const char*>());
      if (m < 0) { publicarAck("HORARIOS", false, "HORARIO_INVALIDO"); return; }
      for (uint8_t i = 0; i < n; i++) if (nova[i] == m) { publicarAck("HORARIOS", false, "HORARIO_DUPLICADO"); return; }
      nova[n++] = m;
    }
    for (uint8_t i = 1; i < n; i++)
      for (uint8_t j = i; j > 0 && nova[j - 1] > nova[j]; j--) { uint16_t tmp = nova[j]; nova[j] = nova[j - 1]; nova[j - 1] = tmp; }
    memcpy(agenda, nova, sizeof(uint16_t) * n);
    qtdHorarios = n;
    salvarAgenda();
    publicarAck("HORARIOS", true, nullptr);
    JsonDocument e; e["evento"] = "HORARIOS_ATUALIZADOS";
    JsonArray h = e["horarios"].to<JsonArray>();
    for (uint8_t i = 0; i < n; i++) h.add(minutoParaTexto(agenda[i]));
    publicarEvento(e);
    publicarStatus();
    return;
  }
  if (strcmp(cmd, "ATUALIZAR_PROGRAMACAO") == 0) { processarProgramacao(doc); return; }
  if (strcmp(cmd, "STATUS") == 0) { publicarStatus(); return; }
  if (strcmp(cmd, "SINCRONIZAR") == 0) { esvaziarFila(); reenviarHistorico(doc["desde_seq"] | 0); publicarStatus(); return; }
  if (strcmp(cmd, "TESTE_BUZZER") == 0 || strcmp(cmd, "TESTE_LED") == 0) {
    if (estado != EM_ESPERA) { publicarAck(cmd, false, "LEMBRETE_EM_ANDAMENTO"); return; }
    if (cmd[6] == 'B') testeBuzzerAte = millis() + 2000; else testeLedAte = millis() + 3000;
    publicarAck(cmd, true, nullptr);
    return;
  }
  publicarAck(strlen(cmd) ? cmd : "?", false, "COMANDO_DESCONHECIDO");
}

void aoReceberMqtt(char* topico, byte* payload, unsigned int len) {
  if (len > MQTT_BUFFER) return;
  memcpy(rxBuf, payload, len);   // copia: o buffer da PubSubClient é reutilizado ao publicar
  rxBuf[len] = 0;
  Serial.print("[cmd] "); Serial.println(len > 160 ? String(rxBuf).substring(0, 160) + "..." : String(rxBuf));
  JsonDocument doc;
  if (deserializeJson(doc, rxBuf)) { publicarAck("?", false, "JSON_INVALIDO"); return; }
  processarComando(doc);
}

// ------------------------------ Monitor Serial (testes no Wokwi) ------------
void ajustarHoraManual(int minutoDia) {
  struct tm t;
  if (!horaAtual(t)) { memset(&t, 0, sizeof(t)); t.tm_year = 2026 - 1900; t.tm_mon = 10; t.tm_mday = 4; }
  t.tm_hour = minutoDia / 60; t.tm_min = minutoDia % 60; t.tm_sec = 0; t.tm_isdst = 0;
  struct timeval tv = { mktime(&t), 0 };
  settimeofday(&tv, nullptr);
  relogioValido = true; ultimoDisparo = -1;
  Serial.print("[relogio] Ajustado manualmente para "); Serial.println(carimboISO());
}

void mostrarAjuda() {
  Serial.println(F("--- Comandos (Monitor Serial, final de linha LF) ---"));
  Serial.println(F("{\"cmd\":\"LEMBRETE\"}        lembrete remoto (igual ao MQTT)"));
  Serial.println(F("{\"cmd\":\"HORARIOS\",\"horarios\":[\"08:00\",\"20:00\"]}  agenda fixa"));
  Serial.println(F("status / agenda / prog / fila   telemetria, agenda fixa, programacao, fila offline"));
  Serial.println(F("teste                  agenda fixa para daqui a 1 minuto (se nao houver programacao)"));
  Serial.println(F("tol <min>              tolerancia ate DOSE ATRASADA (1-60, volta a 10 ao reiniciar)"));
  Serial.println(F("hora HH:MM             ajusta o relogio sem internet"));
  Serial.println(F("mqtt off|on            simula queda/volta do broker (T18/T19)"));
  Serial.println(F("wifi off|on            simula queda/volta do Wi-Fi"));
  Serial.println(F("apagar prog            remove a programacao individual (volta ao modo HORARIOS)"));
  Serial.println(F("ajuda                  esta lista"));
}

void listarProg() {
  Serial.printf("[prog] %s v%u · %u medicamento(s) · %u dose(s) · %u pendente(s)\n", prog.progId, prog.versao, prog.nMeds, prog.nDoses, dosesPendentes());
  uint16_t mostradas = 0;
  for (uint16_t i = 0; i < prog.nDoses && mostradas < 15; i++) {
    if (prog.doses[i].status != DS_AGENDADA) continue;
    char iso[32]; epochISO(prog.doses[i].epoch, iso, sizeof iso);
    Serial.printf("   %s  %-16s %s\n", iso, prog.meds[prog.doses[i].med].nome, prog.doses[i].id);
    mostradas++;
  }
}

void processarLinha(String linha) {
  linha.trim();
  if (linha.length() == 0) return;
  if (linha.charAt(0) == '{') {
    JsonDocument doc;
    if (deserializeJson(doc, linha)) { publicarAck("?", false, "JSON_INVALIDO"); return; }
    processarComando(doc);
    return;
  }
  String l = linha; l.toLowerCase();
  if (l == "status") { publicarStatus(); return; }
  if (l == "ajuda" || l == "help") { mostrarAjuda(); return; }
  if (l == "prog") { listarProg(); return; }
  if (l == "fila") { Serial.printf("[fila] %u evento(s), %u descartado(s)\n", nFila, descartados); for (uint8_t i = 0; i < nFila; i++) Serial.println("   " + fila[i]); return; }
  if (l == "agenda") {
    Serial.print("[agenda] ");
    for (uint8_t i = 0; i < qtdHorarios; i++) { Serial.print(minutoParaTexto(agenda[i])); Serial.print(' '); }
    Serial.println(modoLegado() ? "(ativa)" : "(inativa: ha programacao individual pendente)");
    return;
  }
  if (l == "teste") {
    struct tm t;
    if (!horaAtual(t)) { Serial.println("[erro] Relogio sem hora. Use 'hora HH:MM' ou conecte o Wi-Fi."); return; }
    if (!modoLegado()) Serial.println("[aviso] Ha programacao individual pendente: a agenda fixa nao vai tocar.");
    int alvo = (t.tm_hour * 60 + t.tm_min + 1) % 1440;
    Serial.print("[teste] Dose agendada para "); Serial.println(minutoParaTexto(alvo));
    processarLinha("{\"cmd\":\"HORARIOS\",\"horarios\":[\"" + minutoParaTexto(alvo) + "\"]}");
    return;
  }
  if (l.startsWith("tol ")) {
    int v = l.substring(4).toInt();
    if (v < 1 || v > 60) { Serial.println("[erro] Tolerancia deve ser de 1 a 60 min."); return; }
    toleranciaMin = v; Serial.printf("[tol] Tolerancia = %d min\n", v); return;
  }
  if (l.startsWith("hora ")) {
    String h = linha.substring(5); h.trim();
    int m = textoParaMinuto(h.c_str());
    if (m < 0) { Serial.println("[erro] Use hora HH:MM, ex.: hora 19:59"); return; }
    ajustarHoraManual(m); return;
  }
  if (l == "mqtt off") { simularQuedaMqtt = true; mqtt.disconnect(); Serial.println("[mqtt] Queda simulada (Last Will so e enviado em queda real)."); return; }
  if (l == "mqtt on")  { simularQuedaMqtt = false; ultimaTentativaMqtt = 0; Serial.println("[mqtt] Reconexao liberada."); return; }
  if (l == "wifi off") { simularQuedaWifi = true; mqtt.disconnect(); WiFi.disconnect(); Serial.println("[wifi] Queda simulada."); return; }
  if (l == "wifi on")  { simularQuedaWifi = false; ultimaTentativaWifi = 0; Serial.println("[wifi] Reconexao liberada."); return; }
  if (l == "apagar prog") { memset(&prog, 0, sizeof prog); LittleFS.remove("/prog.bin"); alN = 0; Serial.println("[prog] Programacao removida."); publicarStatus(); return; }
  Serial.println("[erro] Comando desconhecido. Digite 'ajuda'.");
}

void lerSerial() {
  while (Serial.available()) {
    char c = Serial.read();
    if (c == '\n' || c == '\r') { if (linhaSerial.length()) { processarLinha(linhaSerial); linhaSerial = ""; } }
    else if (linhaSerial.length() < 300) linhaSerial += c;
  }
}

// ------------------------------ Rede ----------------------------------------
void conectarMqtt() {
  String id = String(DEVICE_ID) + "-" + String((uint32_t)ESP.getEfuseMac(), HEX);   // final do MAC
  Serial.print("[mqtt] Conectando como "); Serial.println(id);
  if (mqtt.connect(id.c_str(), nullptr, nullptr, T_ONLINE, 1, true, "offline")) {    // Last Will retido
    Serial.println("[mqtt] Conectado ao broker");
    mqtt.publish(T_ONLINE, "online", true);
    mqtt.subscribe(T_CMD, 1);
    esvaziarFila();
    publicarStatus();
  } else {
    Serial.printf("[mqtt] Falha (rc=%d); nova tentativa em 5 s\n", mqtt.state());
  }
}

void cuidarDaRede() {
  uint32_t agora = millis();
  bool conectado = (WiFi.status() == WL_CONNECTED);
  if (!conectado && !simularQuedaWifi && agora - ultimaTentativaWifi >= RECONEXAO_MS) {
    ultimaTentativaWifi = agora;
    if (WiFi.getMode() != WIFI_STA || WiFi.status() == WL_DISCONNECTED) WiFi.begin(WIFI_SSID, WIFI_SENHA); else WiFi.reconnect();
  }
  if (conectado != wifiAntes) {
    wifiAntes = conectado;
    if (conectado) {
      Serial.print("[wifi] Conectado, IP "); Serial.println(WiFi.localIP());
      if (!ntpConfigurado) { configTzTime(FUSO_HORARIO, NTP_SERVIDOR); ntpConfigurado = true; }
    } else Serial.println("[wifi] Desconectado; logica local segue funcionando.");
  }
  if (!relogioValido) {
    struct tm t;
    if (horaAtual(t)) { relogioValido = true; Serial.print("[relogio] Sincronizado: "); Serial.println(carimboISO()); publicarStatus(); }
  }
  if (conectado && !simularQuedaMqtt && !mqtt.connected() && agora - ultimaTentativaMqtt >= RECONEXAO_MS) {
    ultimaTentativaMqtt = agora;
    conectarMqtt();
  }
  if (mqtt.connected()) mqtt.loop();
  digitalWrite(PIN_LED_REDE, mqtt.connected() ? HIGH : LOW);   // LED azul = broker
}

// ------------------------------ Setup / Loop --------------------------------
void setup() {
  Serial.begin(115200);
  pinMode(PIN_TAMPA, INPUT_PULLUP);
  pinMode(PIN_LED, OUTPUT); pinMode(PIN_BUZZER, OUTPUT); pinMode(PIN_LED_REDE, OUTPUT);
  desligarAlarme(); digitalWrite(PIN_LED_REDE, LOW);
  tampaAberta = leituraAnterior = (digitalRead(PIN_TAMPA) == HIGH);

  nvs.begin("caixa", false);
  seqEvento = nvs.getUInt("seq", 0);
  carregarAgenda();
  if (!LittleFS.begin(true)) Serial.println("[erro] LittleFS indisponivel: programacao nao sera persistida.");
  carregarProg();
  nFila = carregarLinhas("/fila.txt", fila, MAX_FILA);
  nHist = carregarLinhas("/hist.txt", hist, MAX_HIST);

  setenv("TZ", FUSO_HORARIO, 1); tzset();
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_SENHA);
  ultimaTentativaWifi = millis();

  mqtt.setServer(MQTT_HOST, MQTT_PORTA);
  mqtt.setBufferSize(MQTT_BUFFER);
  mqtt.setKeepAlive(30);
  mqtt.setSocketTimeout(MQTT_TIMEOUT_S);
  mqtt.setCallback(aoReceberMqtt);

  Serial.println();
  Serial.println(F("=== Caixa de Remedios Inteligente IoT ==="));
  Serial.print(F("Firmware ")); Serial.print(FIRMWARE_VERSAO);
  Serial.print(F(" | dispositivo ")); Serial.println(DEVICE_ID);
  Serial.print(F("Tampa: ")); Serial.println(tampaAberta ? "ABERTA" : "FECHADA");
  Serial.printf("Programacao: %s v%u (%u doses) | fila: %u | seq: %u\n", prog.progId, prog.versao, prog.nDoses, nFila, seqEvento);
  Serial.println(F("Digite 'ajuda' para ver os comandos."));
}

void loop() {
  lerSerial();
  lerTampa();
  cuidarDaRede();
  static uint32_t ultimaAgenda = 0;
  if (millis() - ultimaAgenda >= 1000) { ultimaAgenda = millis(); verificarAgenda(); }
  verificarAtraso();
  atualizarAlarme();
  if (stgAtivo && millis() - stgUltimaMs > SEGMENTO_TIMEOUT_MS) recusarProg(stg.progId, stg.versao, "TIMEOUT_SEGMENTOS");
  if (millis() - ultimoStatus >= STATUS_INTERVALO_MS) publicarStatus();
}
