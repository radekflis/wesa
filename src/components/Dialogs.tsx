// Własne okna dialogowe zamiast confirm()/prompt() — natywne okna są blokowane w ramkach typu sandbox (np. podgląd na claude.ai).

import { useEffect, useRef, useState } from 'react';

interface Request {
  kind: 'confirm' | 'prompt';
  message: string;
  detail?: string;
  value?: string;
  okLabel?: string;
  danger?: boolean;
  resolve: (v: string | boolean | null) => void;
}

let push: ((r: Request) => void) | null = null;

export function askConfirm(message: string, opts: { detail?: string; okLabel?: string; danger?: boolean } = {}): Promise<boolean> {
  return new Promise((resolve) => (push ? push({ kind: 'confirm', message, ...opts, resolve: (v) => resolve(v === true) }) : resolve(false)));
}

export function askText(message: string, value = '', opts: { okLabel?: string } = {}): Promise<string | null> {
  return new Promise((resolve) => (push ? push({ kind: 'prompt', message, value, ...opts, resolve: (v) => resolve(typeof v === 'string' ? v : null) }) : resolve(null)));
}

export function DialogHost() {
  const [queue, setQueue] = useState<Request[]>([]);
  const [text, setText] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const current = queue[0];

  useEffect(() => {
    push = (r) => setQueue((q) => [...q, r]);
    return () => {
      push = null;
    };
  }, []);

  useEffect(() => {
    if (current?.kind === 'prompt') {
      setText(current.value ?? '');
      setTimeout(() => inputRef.current?.select(), 0);
    }
  }, [current]);

  if (!current) return null;
  const close = (v: string | boolean | null) => {
    current.resolve(v);
    setQueue((q) => q.slice(1));
  };
  const ok = () => close(current.kind === 'prompt' ? text : true);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/15 p-4" onClick={() => close(current.kind === 'prompt' ? null : false)}>
      <div
        role="dialog"
        aria-modal="true"
        className="glass w-full max-w-sm rounded-2xl p-5 shadow-2xl shadow-slate-300/40"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === 'Escape') close(current.kind === 'prompt' ? null : false);
          if (e.key === 'Enter') ok();
        }}
      >
        <div className="text-[15px] font-semibold text-slate-900">{current.message}</div>
        {current.detail && <p className="mt-1.5 text-[13px] leading-relaxed text-slate-500">{current.detail}</p>}
        {current.kind === 'prompt' && <input ref={inputRef} className="input mt-3" value={text} onChange={(e) => setText(e.target.value)} />}
        <div className="mt-4 flex justify-end gap-2">
          <button className="btn" onClick={() => close(current.kind === 'prompt' ? null : false)}>
            Anuluj
          </button>
          <button autoFocus={current.kind === 'confirm'} className={current.danger ? 'btn-primary bg-red-600 hover:bg-red-700' : 'btn-primary'} onClick={ok}>
            {current.okLabel ?? 'OK'}
          </button>
        </div>
      </div>
    </div>
  );
}
