import Paho from "paho-mqtt";

import { MQTT_PREFIX, MQTT_WS_URL } from "../config";
import { MqttState } from "../types";

// Conexão direta do celular ao HiveMQ via MQTT sobre WebSocket seguro (wss, porta 8884).
// O ESP32 continua usando TCP 1883 — ambos falam com o mesmo broker e os mesmos tópicos.
// ATENÇÃO: broker público sem autenticação, adequado apenas para protótipo/ensino.

export const TOPICOS = {
  online: MQTT_PREFIX + "online",
  status: MQTT_PREFIX + "status",
  evento: MQTT_PREFIX + "evento",
  cmd: MQTT_PREFIX + "cmd",
  ack: MQTT_PREFIX + "ack",
};

type Handlers = {
  onState: (s: MqttState) => void;
  onMessage: (topic: string, payload: string, retained: boolean) => void;
  onConnected: () => void;
};

class MqttService {
  private client: any = null;
  private handlers: Handlers | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private attempt = 0;
  private connecting = false;
  connected = false;

  start(h: Handlers) {
    this.handlers = h;
    this.connect();
  }

  stop() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.handlers = null;
    try {
      if (this.client?.isConnected()) this.client.disconnect();
    } catch {}
    this.client = null;
    this.connected = false;
  }

  /** Força uma tentativa imediata (ex.: app voltou ao primeiro plano). */
  reconnectNow() {
    if (this.connected || this.connecting) return;
    if (this.timer) clearTimeout(this.timer);
    this.attempt = 0;
    this.connect();
  }

  private schedule() {
    if (!this.handlers) return;
    const delay = Math.min(30_000, 2000 * 2 ** Math.min(this.attempt, 4));
    this.attempt++;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => this.connect(), delay);
  }

  private connect() {
    if (!this.handlers || this.connecting) return;
    this.connecting = true;
    this.handlers.onState("conectando");
    const clientId = "app_remedios_" + Math.random().toString(36).slice(2, 10);
    try {
      const client = new Paho.Client(MQTT_WS_URL, clientId);
      this.client = client;
      client.onConnectionLost = () => {
        this.connected = false;
        this.connecting = false;
        this.handlers?.onState("desconectado");
        this.schedule();
      };
      client.onMessageArrived = (m: any) => {
        let payload = "";
        try {
          payload = m.payloadString;
        } catch {
          return;
        }
        this.handlers?.onMessage(m.destinationName, payload, !!m.retained);
      };
      client.connect({
        timeout: 10,
        keepAliveInterval: 30,
        cleanSession: true,
        useSSL: MQTT_WS_URL.startsWith("wss"),
        onSuccess: () => {
          this.connected = true;
          this.connecting = false;
          this.attempt = 0;
          [TOPICOS.online, TOPICOS.status, TOPICOS.evento, TOPICOS.ack].forEach((t) => client.subscribe(t, { qos: 1 }));
          this.handlers?.onState("conectado");
          this.handlers?.onConnected();
        },
        onFailure: () => {
          this.connected = false;
          this.connecting = false;
          this.handlers?.onState("desconectado");
          this.schedule();
        },
      });
    } catch {
      this.connecting = false;
      this.handlers?.onState("desconectado");
      this.schedule();
    }
  }

  publishCmd(obj: Record<string, unknown>): boolean {
    if (!this.connected || !this.client) return false;
    try {
      const msg = new Paho.Message(JSON.stringify(obj));
      msg.destinationName = TOPICOS.cmd;
      msg.qos = 1;
      msg.retained = false;
      this.client.send(msg);
      return true;
    } catch {
      return false;
    }
  }
}

export const mqttService = new MqttService();
