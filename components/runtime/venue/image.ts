/** Réduit une image (photo de plat, logo) avant l'envoi : petite taille, poids limité. */
export async function shrinkImage(file: File, max: number, type: "image/jpeg" | "image/png" = "image/jpeg"): Promise<string> {
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
    const r = Math.min(1, max / Math.max(img.width, img.height));
    const c = document.createElement("canvas");
    c.width = Math.round(img.width * r);
    c.height = Math.round(img.height * r);
    c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL(type, 0.78);
  } finally {
    URL.revokeObjectURL(url);
  }
}
