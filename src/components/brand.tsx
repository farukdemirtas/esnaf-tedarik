export function Logo({ size = "md", inverted = false }: { size?: "md" | "lg"; inverted?: boolean }) {
  const box = size === "lg" ? "h-12 w-12 text-lg" : "h-9 w-9 text-sm";
  return (
    <div className="flex items-center gap-3">
      <div
        className={`${box} grid shrink-0 place-items-center rounded-lg bg-accent-500 font-extrabold tracking-tight text-brand-900`}
        aria-hidden
      >
        ET
      </div>
      <div className="leading-tight">
        <div className={`font-extrabold tracking-wide ${inverted ? "text-white" : "text-brand-800"} ${size === "lg" ? "text-xl" : "text-base"}`}>
          ESNAF TEDARİK
        </div>
        <div className={`text-xs ${inverted ? "text-brand-100" : "text-slate-500"}`}>Ortak Güç, Ortak Kazanç</div>
      </div>
    </div>
  );
}

export function Alert({ tone, children }: { tone: "error" | "success" | "info" | "warning"; children: React.ReactNode }) {
  const styles = {
    error: "border-red-200 bg-red-50 text-red-800",
    success: "border-emerald-200 bg-emerald-50 text-emerald-800",
    info: "border-brand-100 bg-brand-50 text-brand-800",
    warning: "border-amber-200 bg-amber-50 text-amber-900",
  }[tone];
  return (
    <div role={tone === "error" ? "alert" : "status"} className={`rounded-lg border px-4 py-3 text-sm ${styles}`}>
      {children}
    </div>
  );
}
