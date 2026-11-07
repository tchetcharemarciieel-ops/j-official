/**
 * Réduit une image (photo de plat, logo) avant l'envoi : petite taille, poids limité.
 * Le résultat ne dépasse jamais `maxChars` (limite acceptée par le serveur) : la qualité puis la
 * taille baissent jusqu'à ce que la photo tienne, même pour une photo très détaillée.
 */
export async function shrinkImage(file: File, max: number, type: "image/jpeg" | "image/png" = "image/jpeg", maxChars = 300_000): Promise<string> {
  // Photos de la galerie : PNG, JPEG, WebP, ou HEIC/HEIF des iPhone (converties ici en JPEG/PNG).
  if (file.type && !/^image\/(png|jpe?g|webp|heic|heif)$/i.test(file.type)) throw new Error("Choisissez une photo (JPEG, PNG, WebP ou photo d'iPhone).");
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = () => rej(new Error("Ce téléphone ne peut pas lire cette photo : choisissez-en une autre (ou une capture d'écran)."));
      i.src = url;
    });
    let size = max;
    for (let attempt = 0; attempt < 8; attempt++) {
      const r = Math.min(1, size / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.max(1, Math.round(img.width * r));
      c.height = Math.max(1, Math.round(img.height * r));
      const g = c.getContext("2d")!;
      if (type === "image/jpeg") {
        // Fond blanc : une image transparente ne devient pas noire en JPEG.
        g.fillStyle = "#ffffff";
        g.fillRect(0, 0, c.width, c.height);
      }
      g.drawImage(img, 0, 0, c.width, c.height);
      for (const q of type === "image/jpeg" ? [0.8, 0.7, 0.6] : [1]) {
        const out = c.toDataURL(type, q);
        if (out.length <= maxChars) return out;
      }
      // PNG trop lourd (logo) : on passe en JPEG ; sinon on réduit la taille.
      if (type === "image/png" && attempt === 0) {
        const jpg = c.toDataURL("image/jpeg", 0.85);
        if (jpg.length <= maxChars) return jpg;
      }
      size = Math.round(size * 0.75);
    }
    throw new Error("Photo trop lourde : choisissez-en une autre.");
  } finally {
    URL.revokeObjectURL(url);
  }
}
