#!/usr/bin/env python3
"""
MiniSoft Vision IA — passerelle de détection (programme de référence).

À installer sur un ordinateur du restaurant (PC, mini-PC ou Raspberry Pi 5) relié aux caméras.
Il lit l'image de la caméra SUR PLACE, compte les personnes assises à chaque table, et n'envoie
à MiniSoft RCA que l'état de chaque table : « occupée » ou « libre » (+ nombre de personnes).

  - Aucune image, aucune vidéo, aucun visage n'est envoyé ni enregistré.
  - Aucune reconnaissance faciale : le modèle ne détecte que des silhouettes de personnes.
  - Un état n'est envoyé qu'après être resté stable (par défaut 20 secondes).

Utilisation :
  1. pip install opencv-python ultralytics requests
  2. Copiez config_exemple.json en config.json et remplissez-le (adresse, identifiant, tables).
  3. Clé : définissez la variable MSV_KEY (recommandé) ou le champ "key" du fichier.
  4. python3 minisoft_passerelle.py --test        (vérifie la connexion, rien n'est détecté)
     python3 minisoft_passerelle.py --apercu      (image locale avec la grille, pour dessiner les tables)
     python3 minisoft_passerelle.py               (démarre la détection)
"""

import argparse
import json
import os
import sys
import time
import uuid

try:
    import requests
except ImportError:  # message clair plutôt qu'une trace Python
    sys.exit("Installez d'abord les dépendances : pip install opencv-python ultralytics requests")


def load_config(path):
    with open(path, encoding="utf-8") as f:
        cfg = json.load(f)
    cfg["key"] = os.environ.get("MSV_KEY") or cfg.get("key", "")
    missing = [k for k in ("endpoint", "camera_id", "key", "source", "tables") if not cfg.get(k)]
    if missing:
        sys.exit(f"Champs manquants dans la configuration : {', '.join(missing)}")
    if not cfg["key"].startswith("msv_"):
        sys.exit("La clé doit commencer par « msv_ » : copiez celle affichée dans MiniSoft RCA (Vision IA › Caméras).")
    cfg.setdefault("stable_seconds", 20)
    cfg.setdefault("interval_seconds", 2)
    cfg.setdefault("heartbeat_seconds", 60)
    cfg.setdefault("min_confidence", 0.45)
    return cfg


def send(cfg, observations):
    """Envoie l'état des tables. Ne contient jamais d'image."""
    body = {"camera_id": cfg["camera_id"], "observations": observations, "idem": f"gw-{uuid.uuid4()}"}
    r = requests.post(cfg["endpoint"], json=body, headers={"Authorization": f"Bearer {cfg['key']}"}, timeout=15)
    try:
        data = r.json()
    except ValueError:
        data = {}
    if r.status_code >= 400:
        raise RuntimeError(f"{r.status_code} : {data.get('error') or r.text[:200]}")
    return data.get("message", "OK")


def inside(point, polygon):
    """Point (x, y) dans un polygone (coordonnées entre 0 et 1)."""
    x, y = point
    hit = False
    j = len(polygon) - 1
    for i in range(len(polygon)):
        xi, yi = polygon[i]
        xj, yj = polygon[j]
        if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / ((yj - yi) or 1e-9) + xi:
            hit = not hit
        j = i
    return hit


def open_camera(source):
    import cv2

    cap = cv2.VideoCapture(int(source) if str(source).isdigit() else source)
    if not cap.isOpened():
        sys.exit(f"Impossible d'ouvrir la caméra « {source} ». Vérifiez l'adresse RTSP, le mot de passe de la caméra et le réseau.")
    return cap


def snapshot(cfg):
    """Enregistre UNE image locale avec une grille (jamais envoyée) pour repérer les tables."""
    import cv2

    cap = open_camera(cfg["source"])
    ok, frame = cap.read()
    cap.release()
    if not ok:
        sys.exit("Aucune image reçue de la caméra.")
    h, w = frame.shape[:2]
    for i in range(1, 10):
        cv2.line(frame, (int(w * i / 10), 0), (int(w * i / 10), h), (255, 255, 255), 1)
        cv2.line(frame, (0, int(h * i / 10)), (w, int(h * i / 10)), (255, 255, 255), 1)
        cv2.putText(frame, f"{i / 10:.1f}", (int(w * i / 10) + 3, 18), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 255), 1)
        cv2.putText(frame, f"{i / 10:.1f}", (3, int(h * i / 10) - 4), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 255), 1)
    for t in cfg["tables"]:
        pts = [(int(x * w), int(y * h)) for x, y in t["zone"]]
        for a, b in zip(pts, pts[1:] + pts[:1]):
            cv2.line(frame, a, b, (0, 200, 0), 2)
        cv2.putText(frame, t.get("nom", "table"), pts[0], cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 200, 0), 2)
    cv2.imwrite("apercu_local.jpg", frame)
    print("Image locale enregistrée : apercu_local.jpg (elle n'est envoyée nulle part ; supprimez-la après réglage).")


def run(cfg):
    try:
        from ultralytics import YOLO
    except ImportError:
        sys.exit("Installez le modèle de détection : pip install ultralytics")
    model = YOLO(cfg.get("model", "yolov8n.pt"))  # détection de personnes (classe 0), aucune reconnaissance faciale
    cap = open_camera(cfg["source"])
    tables = cfg["tables"]
    state = {t["table_id"]: None for t in tables}  # dernier état envoyé
    pending = {}  # table_id -> (état candidat, depuis)
    last_beat = 0.0
    print("Détection démarrée. Ctrl+C pour arrêter.")
    while True:
        ok, frame = cap.read()
        if not ok:
            print("Image perdue : nouvelle tentative dans 5 s…")
            time.sleep(5)
            cap.release()
            cap = open_camera(cfg["source"])
            continue
        h, w = frame.shape[:2]
        result = model(frame, classes=[0], conf=cfg["min_confidence"], verbose=False)[0]
        # Point de référence : bas de la silhouette (personne assise à la table).
        feet = [((float(b[0]) + float(b[2])) / 2 / w, float(b[3]) / h) for b in result.boxes.xyxy.tolist()]
        del frame, result  # l'image n'est jamais conservée
        now = time.time()
        changes = []
        for t in tables:
            people = sum(1 for p in feet if inside(p, t["zone"]))
            occupied = people > 0
            cand, since = pending.get(t["table_id"], (None, now))
            if cand != occupied:
                pending[t["table_id"]] = (occupied, now)
            elif state[t["table_id"]] != occupied and now - since >= cfg["stable_seconds"]:
                state[t["table_id"]] = occupied
                changes.append({"table_id": t["table_id"], "occupied": occupied, "people": people})
        beat = now - last_beat >= cfg["heartbeat_seconds"]
        if changes or beat:
            obs = changes or [{"table_id": k, "occupied": v} for k, v in state.items() if v is not None]
            if obs:
                try:
                    print(time.strftime("%H:%M:%S"), send(cfg, obs))
                    last_beat = now
                except Exception as e:  # réseau coupé : on réessaie au prochain tour
                    print("Envoi impossible :", e)
        time.sleep(cfg["interval_seconds"])


def main():
    ap = argparse.ArgumentParser(description="Passerelle de détection MiniSoft Vision IA")
    ap.add_argument("--config", default="config.json")
    ap.add_argument("--test", action="store_true", help="vérifie la connexion avec MiniSoft RCA (aucune détection)")
    ap.add_argument("--apercu", action="store_true", help="enregistre une image locale avec la grille pour dessiner les tables")
    a = ap.parse_args()
    cfg = load_config(a.config)
    if a.test:
        # Annonce les tables comme libres : ne touche qu'aux tables détectées par cette caméra.
        try:
            print("Connexion réussie :", send(cfg, [{"table_id": t["table_id"], "occupied": False} for t in cfg["tables"]]))
            print("Dans MiniSoft RCA, la caméra doit maintenant apparaître « Connectée ».")
        except Exception as e:
            sys.exit(f"Connexion refusée : {e}")
    elif a.apercu:
        snapshot(cfg)
    else:
        run(cfg)


if __name__ == "__main__":
    main()
