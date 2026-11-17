/** Sunucu işlemlerinin (server action) forma döndürdüğü durum */
export type ActionState = {
  ok: boolean;
  message?: string;
  fieldErrors?: Record<string, string>;
  /** Yalnızca bir kez gösterilecek bilgiler (geçici şifre, sıfırlama bağlantısı vb.) */
  data?: Record<string, string>;
} | null;

export type ServerAction = (prev: ActionState, fd: FormData) => Promise<ActionState>;
