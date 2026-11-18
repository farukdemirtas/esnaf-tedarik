export function Logo({ size = "md", inverted = false }: { size?: "md" | "lg"; inverted?: boolean }) {
  const box = size === "lg" ? "h-12 w-12 text-lg" : "h-9 w-9 text-sm";
  return (
    <div className="flex items-center gap-3">
      <div
        className={`${box} relative grid shrink-0 place-items-center overflow-hidden rounded-xl font-extrabold tracking-tight text-brand-950 shadow-[0_8px_18px_-10px_rgba(184,117,20,0.8)]`}
        aria-hidden
        style={{
          background: "linear-gradient(145deg, #f3c978 0%, #d4941f 55%, #b87514 100%)",
        }}
      >
        <span className="relative z-10">ET</span>
        <span className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.45),transparent_55%)]" />
      </div>
      <div className="leading-tight">
        <div
          className={`font-display font-semibold tracking-tight ${inverted ? "text-white" : "text-brand-900"} ${
            size === "lg" ? "text-2xl" : "text-[1.05rem]"
          }`}
        >
          ESNAF TEDARİK
        </div>
        <div className={`text-[11px] font-medium tracking-[0.08em] uppercase ${inverted ? "text-brand-100/85" : "text-slate-500"}`}>
          Ortak Güç, Ortak Kazanç
        </div>
      </div>
    </div>
  );
}

export function Alert({ tone, children }: { tone: "error" | "success" | "info" | "warning"; children: React.ReactNode }) {
  const styles = {
    error: "border-red-200/80 bg-red-50/90 text-red-900",
    success: "border-emerald-200/80 bg-emerald-50/90 text-emerald-900",
    info: "border-brand-200/80 bg-brand-50/90 text-brand-900",
    warning: "border-amber-200/80 bg-amber-50/90 text-amber-950",
  }[tone];
  return (
    <div role={tone === "error" ? "alert" : "status"} className={`rounded-xl border px-4 py-3 text-sm shadow-sm backdrop-blur-sm ${styles}`}>
      {children}
    </div>
  );
}
