import { Field, SelectField, TextareaField } from "@/components/form";
import { fmtNumber, UNIT_TYPE } from "@/lib/format";
import { toOptions } from "@/components/panel/ui";

type P = {
  name?: string;
  barcode?: string | null;
  brandId?: string;
  categoryId?: string;
  unitType?: string;
  unitAmount?: { toString(): string } | null;
  description?: string | null;
  status?: string;
};

export function ProductFields({
  p = {},
  brands,
  categories,
}: {
  p?: P;
  brands: { id: string; name: string }[];
  categories: { id: string; name: string; depth: number }[];
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field name="name" label="Ürün adı" required defaultValue={p.name} maxLength={150} wrapClassName="sm:col-span-2" placeholder="Örn. Kola 1 L Pet Şişe" />
      <Field name="barcode" label="Barkod" inputMode="numeric" defaultValue={p.barcode ?? ""} maxLength={14} hint="Aynı ürünün tedarikçiler arasında karşılaştırılması barkodla yapılır." />
      <SelectField name="brandId" label="Marka" required placeholder="Seçin" defaultValue={p.brandId ?? ""} options={brands.map((b) => ({ value: b.id, label: b.name }))} />
      <SelectField
        name="categoryId"
        label="Kategori"
        required
        placeholder="Seçin"
        defaultValue={p.categoryId ?? ""}
        options={categories.map((c) => ({ value: c.id, label: `${"— ".repeat(c.depth)}${c.name}` }))}
      />
      <div className="grid grid-cols-2 gap-3">
        <SelectField name="unitType" label="Birim" defaultValue={p.unitType ?? "ADET"} options={toOptions(UNIT_TYPE)} />
        <Field name="unitAmount" label="Birim miktarı" inputMode="decimal" defaultValue={p.unitAmount ? fmtNumber(p.unitAmount) : ""} placeholder="1 (L), 0,5 (kg)…" />
      </div>
      <SelectField
        name="status"
        label="Durum"
        defaultValue={p.status === "ARCHIVED" ? "ARCHIVED" : "ACTIVE"}
        options={[
          { value: "ACTIVE", label: "Yayında" },
          { value: "ARCHIVED", label: "Arşivde (üyelere gösterilmez)" },
        ]}
      />
      <TextareaField name="description" label="Açıklama" defaultValue={p.description ?? ""} maxLength={2000} rows={3} wrapClassName="sm:col-span-2" />
    </div>
  );
}
