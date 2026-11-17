"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { createContext, startTransition, useActionState, useContext, useEffect, useRef, useState } from "react";
import type { ActionState, ServerAction } from "@/lib/action-types";

const FormCtx = createContext<{ state: ActionState; pending: boolean }>({ state: null, pending: false });

/**
 * Sunucu işlemine bağlı form. Hata olduğunda girilen değerler korunur,
 * alan hataları ilgili alanın altında gösterilir.
 */
export function ActionForm({
  action,
  children,
  className,
  confirm,
  resetOnSuccess,
  compact,
}: {
  action: ServerAction;
  children: React.ReactNode;
  className?: string;
  /** Gönderimden önce onay sorusu */
  confirm?: string;
  resetOnSuccess?: boolean;
  /** Tablo satırı gibi dar alanlar için kısa mesaj */
  compact?: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  const ref = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.ok && resetOnSuccess) ref.current?.reset();
  }, [state, resetOnSuccess]);

  return (
    <FormCtx.Provider value={{ state, pending }}>
      <form
        ref={ref}
        className={className}
        onSubmit={(e) => {
          e.preventDefault();
          if (confirm && !window.confirm(confirm)) return;
          const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLElement | null;
          const fd = new FormData(e.currentTarget, submitter);
          startTransition(() => formAction(fd));
        }}
      >
        {compact ? <CompactMessage /> : <FormMessage />}
        {children}
      </form>
    </FormCtx.Provider>
  );
}

function FormMessage() {
  const { state } = useContext(FormCtx);
  if (!state) return null;
  return (
    <div className="mb-4 space-y-3">
      {state.message && (
        <div
          role={state.ok ? "status" : "alert"}
          className={`rounded-lg border px-4 py-3 text-sm ${
            state.ok ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-800"
          }`}
        >
          {state.message}
        </div>
      )}
      {state.ok && state.data && <OneTimeData data={state.data} />}
      {state.ok && state.data?.href && <RecordLink href={state.data.href} />}
    </div>
  );
}

/** Yeni oluşturulan kaydın sayfasına bağlantı (bulunulan panele göre) */
function RecordLink({ href }: { href: string }) {
  const pathname = usePathname();
  const base = pathname.startsWith("/personel") ? "/personel" : pathname.startsWith("/tedarikci") ? "/tedarikci" : "/yonetim";
  return (
    <Link href={`${base}/${href}`} className="inline-block text-sm font-semibold text-brand-600 hover:underline">
      Kaydı aç →
    </Link>
  );
}

function CompactMessage() {
  const { state } = useContext(FormCtx);
  if (!state?.message) return null;
  return (
    <div className="mb-1 space-y-2">
      <div role={state.ok ? "status" : "alert"} className={`text-xs ${state.ok ? "text-emerald-700" : "text-red-700"}`}>
        {state.message}
      </div>
      {state.ok && state.data && <OneTimeData data={state.data} />}
    </div>
  );
}

/** Geçici şifre / sıfırlama bağlantısı — yalnızca bir kez gösterilir */
function OneTimeData({ data }: { data: Record<string, string> }) {
  const [copied, setCopied] = useState(false);
  if (!data.tempPassword && !data.resetLink) return null;
  const text = data.resetLink
    ? data.resetLink
    : `Kullanıcı adı: ${data.username ?? ""}\nGeçici şifre: ${data.tempPassword}`;
  return (
    <div className="rounded-lg border-2 border-accent-400 bg-amber-50 p-4 text-sm text-slate-900">
      <div className="font-semibold">Giriş bilgileri — yalnızca bu ekranda bir kez gösterilir</div>
      {data.username && (
        <div className="mt-2">
          Kullanıcı adı: <code className="rounded bg-white px-1.5 py-0.5 font-mono">{data.username}</code>
        </div>
      )}
      {data.tempPassword && (
        <div className="mt-1">
          Geçici şifre: <code className="rounded bg-white px-1.5 py-0.5 font-mono text-base">{data.tempPassword}</code>
        </div>
      )}
      {data.resetLink && (
        <div className="mt-1 break-all">
          Şifre yenileme bağlantısı (1 saat geçerli): <code className="rounded bg-white px-1.5 py-0.5 font-mono">{data.resetLink}</code>
        </div>
      )}
      <p className="mt-2 text-xs text-slate-600">
        Bilgileri kişiye güvenli bir yolla iletin. İlk girişte şifre değiştirmek zorunludur.
      </p>
      <button
        type="button"
        className="mt-2 rounded-md border border-slate-300 bg-white px-3 py-1 text-xs font-medium hover:bg-slate-50"
        onClick={() => navigator.clipboard?.writeText(text).then(() => setCopied(true))}
      >
        {copied ? "Kopyalandı" : "Kopyala"}
      </button>
    </div>
  );
}

function useFieldError(name: string) {
  return useContext(FormCtx).state?.fieldErrors?.[name];
}

function FieldWrap({
  label,
  name,
  hint,
  required,
  className,
  children,
}: {
  label?: string;
  name: string;
  hint?: string;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  const error = useFieldError(name);
  return (
    <div className={className}>
      {label && (
        <label htmlFor={`f-${name}`} className="label">
          {label}
          {required && <span className="text-red-600"> *</span>}
        </label>
      )}
      {children}
      {error ? (
        <p className="mt-1 text-xs text-red-700" id={`f-${name}-err`}>
          {error}
        </p>
      ) : (
        hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>
      )}
    </div>
  );
}

type InputProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, "name"> & {
  name: string;
  label?: string;
  hint?: string;
  wrapClassName?: string;
};

export function Field({ label, name, hint, wrapClassName, required, ...rest }: InputProps) {
  const error = useFieldError(name);
  return (
    <FieldWrap label={label} name={name} hint={hint} required={required} className={wrapClassName}>
      <input
        id={`f-${name}`}
        name={name}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `f-${name}-err` : undefined}
        className={`input ${error ? "border-red-400" : ""}`}
        {...rest}
      />
    </FieldWrap>
  );
}

export function TextareaField({
  label,
  name,
  hint,
  wrapClassName,
  required,
  ...rest
}: Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, "name"> & { name: string; label?: string; hint?: string; wrapClassName?: string }) {
  const error = useFieldError(name);
  return (
    <FieldWrap label={label} name={name} hint={hint} required={required} className={wrapClassName}>
      <textarea
        id={`f-${name}`}
        name={name}
        required={required}
        rows={4}
        aria-invalid={error ? true : undefined}
        className={`input ${error ? "border-red-400" : ""}`}
        {...rest}
      />
    </FieldWrap>
  );
}

export function SelectField({
  label,
  name,
  hint,
  options,
  placeholder,
  wrapClassName,
  required,
  ...rest
}: Omit<React.SelectHTMLAttributes<HTMLSelectElement>, "name"> & {
  name: string;
  label?: string;
  hint?: string;
  options: { value: string; label: string }[];
  placeholder?: string;
  wrapClassName?: string;
}) {
  const error = useFieldError(name);
  return (
    <FieldWrap label={label} name={name} hint={hint} required={required} className={wrapClassName}>
      <select
        id={`f-${name}`}
        name={name}
        required={required}
        aria-invalid={error ? true : undefined}
        className={`input ${error ? "border-red-400" : ""}`}
        {...rest}
      >
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </FieldWrap>
  );
}

export function CheckboxField({ label, name, defaultChecked, hint }: { label: string; name: string; defaultChecked?: boolean; hint?: string }) {
  const error = useFieldError(name);
  return (
    <div>
      <label className="flex cursor-pointer items-start gap-2.5 text-sm text-slate-800">
        <input type="checkbox" name={name} defaultChecked={defaultChecked} className="mt-0.5 h-5 w-5 rounded border-slate-300 accent-brand-600" />
        <span>{label}</span>
      </label>
      {error ? <p className="mt-1 text-xs text-red-700">{error}</p> : hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

export function SubmitButton({
  children,
  variant = "primary",
  name,
  value,
  className = "",
}: {
  children: React.ReactNode;
  variant?: "primary" | "secondary" | "danger" | "small" | "small-danger";
  name?: string;
  value?: string;
  className?: string;
}) {
  const { pending } = useContext(FormCtx);
  const styles = {
    primary: "btn-primary",
    secondary: "btn-secondary",
    danger: "btn bg-red-600 text-white hover:bg-red-700 focus-visible:ring-red-500",
    small: "rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60",
    "small-danger": "rounded-md border border-red-200 bg-white px-2.5 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-60",
  }[variant];
  return (
    <button type="submit" name={name} value={value} disabled={pending} className={`${styles} ${className}`}>
      {pending ? "İşleniyor…" : children}
    </button>
  );
}
