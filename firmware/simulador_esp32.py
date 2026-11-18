#!/usr/bin/env python3
"""
Simulador do ESP32 da Caixa de Remédios (mesmo protocolo do firmware 0.5.0-etapa5).
Útil para testar o app sem o hardware. NÃO rode junto com a caixa real no
mesmo prefixo (os dois responderiam aos comandos).

Uso:
  pip install paho-mqtt
  python3 simulador_esp32.py                    # interativo: digite 'abrir', 'fechar', 'status', 'sair'
  python3 simulador_esp32.py --auto-abrir 8     # abre a tampa 8 s após cada alarme e mantém 6 s
"""
import argparse, json, threading, time, sys
from datetime import datetime, timedelta, timezone
import paho.mqtt.client as mqtt

TZ = timezone(timedelta(hours=-3))
ap = argparse.ArgumentParser()
ap.add_argument("--host", default="broker.hivemq.com")
ap.add_argument("--port", type=int, default=1883)
ap.add_argument("--prefix", default="catolica/iot/remedios01/")
ap.add_argument("--device", default="remedios01")
ap.add_argument("--auto-abrir", type=float, default=0)
args = ap.parse_args()
P = args.prefix
T = {k: P + k for k in ("online", "status", "evento", "cmd", "ack")}

prog = {"progId": "", "versao": 0, "meds": {}, "doses": []}  # doses: dict(id, epoch, med, status)
stg = None
seq = 0
hist = []
msg_ids = []
alarme = {"estado": "INATIVO", "doses": [], "origem": "AGENDA", "aberta_em": None}
tampa = {"aberta": False}
lock = threading.RLock()

now_iso = lambda: datetime.now(TZ).isoformat(timespec="seconds")
iso = lambda e: datetime.fromtimestamp(e, TZ).isoformat(timespec="seconds")

cli = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id=f"{args.device}-sim-{int(time.time())}")
cli.will_set(T["online"], "offline", qos=1, retain=True)


def pub(topic, obj, retain=False):
    cli.publish(topic, obj if isinstance(obj, str) else json.dumps(obj, ensure_ascii=False), qos=0, retain=retain)


def evento(e, guardar=False):
    global seq
    seq += 1
    e.update(device=args.device, seq=seq, ts=now_iso())
    if guardar:
        hist.append(e); del hist[:-40]
    pub(T["evento"], e)
    print("[EVT]", e["evento"], e.get("dose_id", ""))


def status():
    pend = [d for d in prog["doses"] if d["status"] == "AGENDADA"]
    nxt = next((d for d in pend if d["epoch"] + 6 * 3600 >= time.time()), None)
    pub(T["status"], {
        "device": args.device, "estado": "ESPERA" if alarme["estado"] == "INATIVO" else "HORA_DA_DOSE",
        "tampa": "ABERTA" if tampa["aberta"] else "FECHADA",
        "proxima_dose": datetime.fromtimestamp(nxt["epoch"], TZ).strftime("%H:%M") if nxt else None,
        "relogio": "OK", "wifi": True, "rssi": -58, "mqtt": True, "fila": 0, "descartados": 0, "fw": "sim-0.5.0",
        "alarme": {"INATIVO": "INATIVO", "TOCANDO": "TOCANDO", "TAMPA_ABERTA": "CONFIRMANDO"}[alarme["estado"]],
        "modo": "PROGRAMACAO" if pend else "HORARIOS",
        "programacao_id": prog["progId"], "versao": prog["versao"], "total_doses": len(prog["doses"]),
        "doses_pendentes": len(pend), "uptime_s": int(time.monotonic()),
        "proxima_dose_info": ({"dose_id": nxt["id"], "medication_id": nxt["med"], "nome": prog["meds"][nxt["med"]]["nome"],
                          "data_hora_programada": iso(nxt["epoch"])} if nxt else None), "ts": now_iso()}, retain=True)


def ack_prog(pid, ver, res, motivo=None, parte=None, total=None):
    a = {"device": args.device, "cmd": "ATUALIZAR_PROGRAMACAO", "programacao_id": pid, "versao": ver, "resultado": res, "ts": now_iso()}
    if motivo: a["motivo"] = motivo
    if parte: a.update(parte=parte, total_partes=total)
    if res == "ACEITO": a.update(medicamentos_recebidos=len(prog["meds"]), doses_recebidas=len(prog["doses"]))
    if res == "RECUSADO": a["versao_atual"] = prog["versao"]
    pub(T["ack"], a)
    print("[ACK]", res, motivo or "", parte or "")


def prog_parte(d):
    global stg, prog
    pid, ver = d.get("programacao_id", ""), d.get("versao", 0)
    parte, total = d.get("parte", 1), d.get("total_partes", 1)
    if not pid or not ver or not (1 <= parte <= total <= 64):
        return ack_prog(pid, ver, "RECUSADO", "ESTRUTURA_INVALIDA")
    if ver == prog["versao"] and pid == prog["progId"]:
        ack_prog(pid, ver, "PARTE_OK", None, parte, total)
        return ack_prog(pid, ver, "ACEITO", "DUPLICADO") if parte == total else None
    if prog["versao"] and ver <= prog["versao"]:
        return ack_prog(pid, ver, "RECUSADO", "VERSAO_ANTIGA")
    if not stg or stg["progId"] != pid or stg["versao"] != ver:
        if parte != 1:
            return ack_prog(pid, ver, "RECUSADO", "SEGMENTO_FORA_DE_ORDEM")
        stg = {"progId": pid, "versao": ver, "meds": {}, "doses": [], "partes": set(), "total": total,
               "em": d.get("total_medicamentos", -1), "ed": d.get("total_doses", -1)}
    if parte in stg["partes"]:
        return ack_prog(pid, ver, "PARTE_OK", None, parte, total)
    ids = {x["id"] for x in stg["doses"]}
    for m in d.get("medicamentos", []):
        mid = m.get("medication_id")
        if not mid: stg = None; return ack_prog(pid, ver, "RECUSADO", "MEDICAMENTO_ID_INVALIDO")
        stg["meds"].setdefault(mid, {"nome": m.get("nome", ""), "dosagem": m.get("dosagem", ""), "qtd": m.get("quantidade_por_dose", 1)})
        for ds in m.get("doses", []):
            try:
                ep = datetime.fromisoformat(ds["data_hora_programada"]).timestamp()
            except Exception:
                stg = None; return ack_prog(pid, ver, "RECUSADO", "DATA_HORA_INVALIDA")
            if ds.get("status", "AGENDADA") not in ("AGENDADA", "AGUARDANDO"): continue
            if ds["dose_id"] in ids: stg = None; return ack_prog(pid, ver, "RECUSADO", "DOSE_DUPLICADA")
            ids.add(ds["dose_id"])
            stg["doses"].append({"id": ds["dose_id"], "epoch": ep, "med": mid, "status": "AGENDADA"})
    stg["partes"].add(parte)
    ack_prog(pid, ver, "PARTE_OK", None, parte, total)
    if len(stg["partes"]) == stg["total"]:
        if (stg["em"] >= 0 and len(stg["meds"]) != stg["em"]) or (stg["ed"] >= 0 and len(stg["doses"]) != stg["ed"]):
            stg = None; return ack_prog(pid, ver, "RECUSADO", "CONTAGEM_DIVERGENTE")
        antigos = {x["id"]: x["status"] for x in prog["doses"]}
        for x in stg["doses"]:
            if antigos.get(x["id"], "AGENDADA") != "AGENDADA": x["status"] = antigos[x["id"]]
        stg["doses"].sort(key=lambda x: x["epoch"])
        prog = {"progId": pid, "versao": ver, "meds": stg["meds"], "doses": stg["doses"]}
        stg = None
        ack_prog(pid, ver, "ACEITO")
        status()


def on_message(c, u, m):
    with lock:
        try:
            d = json.loads(m.payload.decode())
        except Exception:
            return pub(T["ack"], {"device": args.device, "cmd": "?", "resultado": "RECUSADO", "motivo": "JSON_INVALIDO"})
        mid = d.get("msg_id")
        if mid:
            if mid in msg_ids: return
            msg_ids.append(mid); del msg_ids[:-10]
        cmd = d.get("cmd", "")
        print("[CMD]", cmd)
        simple = lambda r, mo=None: pub(T["ack"], {"device": args.device, "cmd": cmd, "resultado": r, **({"motivo": mo} if mo else {}), "ts": now_iso()})
        if cmd == "ATUALIZAR_PROGRAMACAO": prog_parte(d)
        elif cmd == "STATUS": status()
        elif cmd == "SINCRONIZAR":
            for e in hist:
                if e["seq"] > d.get("desde_seq", 0): pub(T["evento"], {**e, "reenvio": True})
            status()
        elif cmd == "LEMBRETE":
            iniciar("MANUAL"); evento({"evento": "LEMBRETE_INICIADO", "origem": "MANUAL"}); simple("OK")
        elif cmd == "HORARIOS": simple("OK")
        elif cmd in ("TESTE_BUZZER", "TESTE_LED"):
            simple("RECUSADO", "ALARME_ATIVO") if alarme["estado"] != "INATIVO" else simple("OK")
        else: simple("RECUSADO", "COMANDO_DESCONHECIDO")


def iniciar(origem):
    if alarme["estado"] == "INATIVO":
        alarme.update(estado="TOCANDO", origem=origem, inicio=time.time())
        print("🔔 ALARME TOCANDO (buzzer + LED)")
        status()


def set_tampa(aberta):
    with lock:
        if tampa["aberta"] == aberta: return
        tampa["aberta"] = aberta
        if alarme["estado"] == "TOCANDO" and aberta:
            alarme.update(estado="TAMPA_ABERTA", aberta_em=time.time())
            status()
        elif alarme["estado"] == "TAMPA_ABERTA" and not aberta:
            alarme["estado"] = "TOCANDO"
            evento({"evento": "ABERTURA_PREMATURA", "duracao_ms": int((time.time() - alarme["aberta_em"]) * 1000)}); status()
        else:
            (evento({"evento": "ABERTURA_FORA_DE_HORARIO"}) if aberta else None); status()


def confirmar():
    conf = now_iso()
    for did in alarme["doses"]:
        d = next((x for x in prog["doses"] if x["id"] == did and x["status"] == "AGENDADA"), None)
        if not d: continue
        d["status"] = "TOMADA"
        evento({"evento": "DOSE_TOMADA", "medication_id": d["med"], "nome": prog["meds"][d["med"]]["nome"], "dose_id": d["id"],
                "horario_programado": datetime.fromtimestamp(d["epoch"], TZ).strftime("%H:%M"),
                "data_hora_programada": iso(d["epoch"]), "data_hora_confirmacao": conf, "origem": "AGENDA"}, True)
    if not alarme["doses"]:
        evento({"evento": "DOSE_TOMADA", "origem": alarme["origem"], "data_hora_confirmacao": conf}, True)
    alarme.update(estado="INATIVO", doses=[])
    print("✅ Atendimento confirmado (tampa aberta ≥ 5 s)")
    status()


def tick():
    last_status = 0
    while True:
        time.sleep(0.5)
        with lock:
            now = time.time()
            for d in prog["doses"]:
                if d["status"] != "AGENDADA" or d["epoch"] > now or d["id"] in alarme["doses"]: continue
                if now - d["epoch"] > 6 * 3600:
                    d["status"] = "PERDIDA"
                    evento({"evento": "DOSE_PERDIDA", "medication_id": d["med"], "dose_id": d["id"], "data_hora_programada": iso(d["epoch"]), "origem": "AGENDA"}, True)
                    continue
                alarme["doses"].append(d["id"]); iniciar("AGENDA")
                evento({"evento": "LEMBRETE_INICIADO", "medication_id": d["med"], "nome": prog["meds"][d["med"]]["nome"], "dose_id": d["id"],
                        "horario_programado": datetime.fromtimestamp(d["epoch"], TZ).strftime("%H:%M"), "data_hora_programada": iso(d["epoch"]), "origem": "AGENDA"})
            if alarme["estado"] == "TAMPA_ABERTA" and now - alarme["aberta_em"] >= 5: confirmar()
            if args.auto_abrir and alarme["estado"] == "TOCANDO" and not tampa["aberta"] and now - alarme.get("inicio", now) >= args.auto_abrir:
                threading.Thread(target=auto_ciclo, daemon=True).start(); alarme["inicio"] = now + 999
            if now - last_status > 30: status(); last_status = now


def auto_ciclo():
    set_tampa(True); time.sleep(6); set_tampa(False)


def on_connect(c, u, f, rc, p=None):
    print("[MQTT] conectado", rc)
    c.publish(T["online"], "online", qos=1, retain=True)
    c.subscribe(T["cmd"], qos=1)
    status()


cli.on_connect = on_connect
cli.on_message = on_message
cli.connect(args.host, args.port, 30)
cli.loop_start()
threading.Thread(target=tick, daemon=True).start()
try:
    while True:
        line = sys.stdin.readline() if sys.stdin and sys.stdin.isatty() else (time.sleep(3600) or "")
        cmd = line.strip().lower()
        if cmd == "abrir": set_tampa(True)
        elif cmd == "fechar": set_tampa(False)
        elif cmd == "status": status(); print(json.dumps(prog, default=str)[:500])
        elif cmd == "sair": break
except KeyboardInterrupt:
    pass
cli.publish(T["online"], "offline", qos=1, retain=True).wait_for_publish(3)
cli.loop_stop()
