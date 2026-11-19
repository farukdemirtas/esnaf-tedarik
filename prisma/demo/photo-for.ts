/** Ürün türüne göre markasız stüdyo fotoğrafı. */
export function photoForSlug(slug: string) {
  if (slug.includes("marlboro")) return "pack.jpg";
  if (slug.includes("tuvalet")) return "tissue.jpg";
  if (slug.includes("camasir")) return "bleach.jpg";
  if (slug.includes("bulasik")) return "dishsoap.jpg";
  if (slug.includes("sabun")) return "soap.jpg";
  if (slug.includes("cips") || slug.includes("lays")) return "chips.jpg";
  if (slug.includes("findik-ezmesi")) return "spread.jpg";
  if (slug.includes("recel")) return "jam.jpg";
  if (slug.includes("findik")) return "hazelnut.jpg";
  if (slug.includes("peynir")) return "cheese.jpg";
  if (slug.includes("yogurt")) return "yogurt.jpg";
  if (slug.includes("ayran")) return "ayran.jpg";
  if (slug.includes("gofret") || slug.includes("halley") || slug.includes("metro") || slug.includes("cin") || slug.includes("wanted")) return "wafer.jpg";
  if (slug.includes("cikolata")) return "chocolate.jpg";
  if (slug.includes("biskuvi") || slug.includes("burcak") || slug.includes("tutku")) return "biscuit.jpg";
  if (slug.includes("fanta")) return "orange-soda.jpg";
  if (slug.includes("sprite") || slug.includes("gazoz")) return "lemon-soda.jpg";
  if (slug.includes("kola") || slug.includes("coca")) return "cola.jpg";
  if (slug.includes("maden")) return "sparkling.jpg";
  if (slug.includes("sut")) return "milk.jpg";
  if (slug.includes("su")) return "water.jpg";
  if (slug.includes("cay")) return "tea.jpg";
  if (slug.includes("kahve") || slug.includes("nescafe")) return "coffee.jpg";
  if (slug.includes("mercimek")) return "lentils.jpg";
  if (slug.includes("pirinc")) return "rice.jpg";
  if (slug.includes("salca")) return "paste.jpg";
  return "water.jpg";
}
