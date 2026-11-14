import json, subprocess, os
VOICE = "/tmp/claude-0/-home-user-j-official/11f896a2-23ac-5793-a0ab-e3520efc1add/scratchpad/voice/fr-siwis-medium.onnx"
def fix(t): return t.replace("MiniSoft", "Mini Soft").replace("Childerick", "Childe-rick")
dur = lambda f: float(subprocess.check_output(["ffprobe","-v","error","-show_entries","format=duration","-of","csv=p=0",f]).decode())
PREV = 49
ABO = int(os.environ["ABO"])
NEW = ABO - PREV
SEGS = [
 ("hier", f"Hier, notre quartier avait {PREV} boutiques.", f"{PREV} BOUTIQUES"),
 ("auj", f"Aujourd'hui, il en a {ABO} ! Merci aux {NEW} nouveaux abonnés.", f"+{NEW} BOUTIQUES"),
 ("resultat", "Résultat du vote d'hier…", "RÉSULTAT"),
 ("gagne", "A : la boulangerie gagne !", "A GAGNE"),
 ("childerick", "Grâce à Childerick, qui a voté A. Sa boulangerie porte son nom.", "CHILDERICK"),
 ("logiciel", "Et elle reçoit son mini-logiciel MiniSoft : ventes, stock et commandes.", "SON LOGICIEL"),
 ("palier", "À cent abonnés, vous donnerez son nom au quartier.", "100 ABONNÉS"),
 ("vote", "Nouveau vote : quel commerce ouvre ensuite ?", "NOUVEAU VOTE"),
 ("a", "A : la pharmacie.", "A"),
 ("b", "B : le garage.", "B"),
 ("c", "C : le restaurant.", "C"),
 ("ecris", "Écris A, B ou C en commentaire. Le plus liké gagne.", "A, B OU C"),
 ("demain", "Résultat demain, au jour trois !", "JOUR 3"),
]
os.makedirs("vo2", exist_ok=True)
t = 0.4; out = []
for i, (k, txt, hl) in enumerate(SEGS):
    f = f"vo2/s{i}.wav"
    subprocess.run(["python3","-m","piper","-m",VOICE,"-f",f,"--length-scale","0.92","--sentence-silence","0.1"], input=fix(txt).encode(), stderr=subprocess.DEVNULL, check=True)
    d = dur(f)
    gap = 0.9 if k in ("auj", "gagne", "logiciel", "palier") else 0.35
    out.append({"k": k, "t": round(t, 2), "d": round(d, 2), "f": f, "txt": txt, "hl": hl})
    t += d + gap
json.dump({"segs": out, "end": round(t + 0.3, 2), "abo": ABO, "prev": PREV}, open("timeline2.json", "w"), ensure_ascii=False, indent=1)
print(round(t, 1), [(s["k"], s["t"]) for s in out])
