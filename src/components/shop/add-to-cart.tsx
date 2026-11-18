import { addToCartAction } from "@/actions/member";
import { ActionForm, SubmitButton } from "@/components/form";

/**
 * Kompakt sepete ekle formu. Miktar sipariş birimi (koli/adet/kg/paket) cinsindendir;
 * asgari miktar ve artış kuralı tarayıcıda da, sunucuda da kontrol edilir.
 */
export function AddToCart({
  offerId,
  minOrderQty,
  orderStep,
  packLabel,
  outOfStock,
  label,
}: {
  offerId: string;
  minOrderQty: string;
  orderStep: string;
  /** "koli", "adet" … */
  packLabel: string;
  outOfStock?: boolean;
  /** Ekran okuyucu için ürün/tedarikçi bilgisi */
  label?: string;
}) {
  if (outOfStock)
    return (
      <button type="button" disabled className="btn-secondary px-3 py-1.5 text-sm" aria-label={label ? `${label}: stokta yok` : undefined}>
        Stokta yok
      </button>
    );
  return (
    <ActionForm action={addToCartAction} compact className="min-w-[11rem]">
      <input type="hidden" name="supplierProductId" value={offerId} />
      <div className="flex items-center gap-1.5">
        <label className="flex items-center gap-1">
          <input
            type="number"
            name="quantity"
            inputMode="decimal"
            required
            min={minOrderQty}
            step={orderStep}
            defaultValue={minOrderQty}
            aria-label={label ? `${label} — miktar (${packLabel})` : `Miktar (${packLabel})`}
            className="input w-20 px-2 py-1.5 text-sm tabular-nums"
          />
          <span className="text-xs text-slate-500">{packLabel}</span>
        </label>
        <SubmitButton className="whitespace-nowrap px-3 py-1.5 text-sm">Sepete ekle</SubmitButton>
      </div>
    </ActionForm>
  );
}
