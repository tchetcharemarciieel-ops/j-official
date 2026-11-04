/** Réduit une image (photo de plat, logo) avant l'envoi : petite taille, poids limité. */
export async function shrinkImage(file: File, max: number, type: "image/jpeg" | "image/png" = "image/jpeg"): Promise<string> {
  if (!/^image\/(png|jpe?g|webp)$/.test(file.type)) throw new Error("Choisissez une image PNG, JPEG ou WebP.");
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = () => rej(new Error("Image illisible : choisissez une autre photo."));
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
