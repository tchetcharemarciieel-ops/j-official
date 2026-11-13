import json, subprocess, os
VOICE = "/tmp/claude-0/-home-user-j-official/11f896a2-23ac-5793-a0ab-e3520efc1add/scratchpad/voice/fr-siwis-medium.onnx"
def fix(t): return t.replace("MiniSoft", "Mini Soft")
dur = lambda f: float(subprocess.check_output(["ffprobe","-v","error","-show_entries","format=duration","-of","csv=p=0",f]).decode())
ABO = int(os.environ.get("ABO", "49"))
# (clé de scène, texte dit, mots du sous-titre mis en couleur)
SEGS = [
 ("hier", "Hier, ce quartier n'avait aucune boutique.", "AUCUNE BOUTIQUE"),
 ("auj", f"Aujourd'hui, il en a {ABO}.", f"{ABO}"),
 ("regle", "Ici, un abonné égale une boutique.", "1 ABONNÉ = 1 BOUTIQUE"),
 ("awa", "Moi, c'est Awa, la cheffe du quartier MiniSoft.", "AWA"),
 ("nom", "Les meilleurs commentaires auront leur nom sur une boutique.", "TON NOM"),
 ("palier", "À cent abonnés, c'est vous qui donnez son nom au quartier.", "100 ABONNÉS"),
 ("vote", "Premier vote : quel commerce ouvre en premier ?", "PREMIER VOTE"),
 ("a", "A : la boulangerie.", "A"),
 ("b", "B : la pharmacie.", "B"),
 ("c", "C : le garage.", "C"),
 ("ecris", "Écris A, B ou C en commentaire. Le plus liké gagne.", "A, B OU C"),
 ("logiciel", "Et le gagnant reçoit son mini-logiciel MiniSoft.", "SON MINI-LOGICIEL"),
 ("demain", "Résultat demain, au jour deux !", "JOUR 2"),
]
os.makedirs("vo", exist_ok=True)
t = 0.4; out = []
for i, (k, txt, hl) in enumerate(SEGS):
    f = f"vo/s{i}.wav"
    subprocess.run(["python3","-m","piper","-m",VOICE,"-f",f,"--length-scale","0.92","--sentence-silence","0.1"], input=fix(txt).encode(), stderr=subprocess.DEVNULL, check=True)
    d = dur(f)
    gap = 0.9 if k in ("auj", "awa", "palier", "logiciel") else 0.35
    out.append({"k": k, "t": round(t, 2), "d": round(d, 2), "f": f, "txt": txt, "hl": hl})
    t += d + gap
json.dump({"segs": out, "end": round(t + 0.3, 2), "abo": ABO}, open("timeline.json", "w"), ensure_ascii=False, indent=1)
print(round(t, 1), [(s["k"], s["t"]) for s in out])
