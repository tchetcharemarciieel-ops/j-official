# Landing page « cinématique » MiniSoft RCA

Un seul fichier : `index.html` (HTML + CSS + JS). GSAP et ScrollTrigger sont chargés depuis cdnjs, uniquement si la connexion le permet.

## Fichiers à ajouter à côté de `index.html` (tous facultatifs : sans eux, la page reste belle avec des dégradés)
- `images/hero-poster.webp` — image du hero, 1080×1920, < 120 Ko (s'affiche tout de suite, avant la vidéo)
- `videos/hero-mobile.mp4` (720×1280) et `videos/hero-desktop.mp4` (1280×720) — muettes, **< 3 Mo chacune**
- `images/metier-boutique|restaurant|pharmacie|ecole|garage|hotel|salon|transport.webp` — 600×800, < 70 Ko
- Témoignages : renseigner `data-video` et `data-poster` sur chaque case `.slot` (mp4 vertical < 3 Mo)

## Préparer les fichiers (légers pour la 3G)
```bash
cwebp -q 70 -resize 1080 1920 photo.jpg -o images/hero-poster.webp
cwebp -q 65 -resize 600 800  boutique.jpg -o images/metier-boutique.webp
ffmpeg -i source.mp4 -vf "scale=720:1280,fps=24" -an -c:v libx264 -crf 30 -preset slow -movflags +faststart videos/hero-mobile.mp4
```

## Mode « lite » (automatique)
Connexion 2G/3G, économiseur de données ou « réduire les animations » : pas de vidéo (image seule), GSAP n'est même pas téléchargé, pas de pin ni de parallaxe, simples apparitions douces. Même chose si GSAP ne se charge pas en 8 s.
