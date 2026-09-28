// Kontekstowa warstwa AI: router dostawców (n8n na VPS, Gemini, Anthropic) + lokalny silnik bez AI.

import type { ProviderId, Settings } from './types';
import { tokenize } from './extract';

export const SYSTEM_PROMPT =
  'Jesteś elitarnym orkiestratorem AI w środowisku WESA ALAW (Adaptive Layered AI Workflowstation). ' +
  'Specjalizujesz się w geologii, finansach ilościowych, wycenie aktywów surowcowych i prawie korporacyjnym. ' +
  'Analizujesz dostarczony kontekst i zwracasz ustrukturyzowane wnioski, tabele danych lub podsumowania. ' +
  'Odpowiadaj po polsku, w Markdown (nagłówki ##, akapity, listy "-", tabele |). ' +
  'Nigdy nie wymyślaj liczb: każdą wartość bierz z kontekstu i wskaż plik źródłowy. Jeśli danych brak — napisz to wprost.';

export const PROVIDER_LABEL: Record<ProviderId, string> = {
  local: 'Silnik lokalny (bez AI)',
  n8n: 'Jądro n8n (VPS)',
  gemini: 'Google Gemini',
  anthropic: 'Anthropic Claude',
};

export function providerReady(p: ProviderId, s: Settings): boolean {
  if (p === 'local') return true;
  if (p === 'n8n') return /^https?:\/\//.test(s.n8nUrl);
  if (p === 'gemini') return s.geminiKey.length > 10;
  return s.anthropicKey.length > 10;
}

export interface AiRequest {
  executionType: 'TEXT_MUTATION' | 'WORMHOLE_INJECTION' | 'WORKSPACE_SPAWN' | 'CROSS_OBJECT_FUSION' | 'DATA_LINTER';
  action: string;
  instruction: string;
  context: string;
}

export async function runAi(provider: ProviderId, s: Settings, req: AiRequest, signal?: AbortSignal): Promise<string> {
  const user = `${req.instruction}\n\n=== KONTEKST OPERACYJNY ===\n${req.context.slice(0, 60000)}`;
  if (provider === 'n8n') {
    const res = await fetch(s.n8nUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal,
      body: JSON.stringify({
        execution_type: req.executionType,
        action: req.action,
        system: SYSTEM_PROMPT,
        payload: user,
      }),
    });
    if (!res.ok) throw new Error(`Jądro n8n: HTTP ${res.status} ${res.statusText}`);
    const raw = await res.text();
    try {
      const j = JSON.parse(raw);
      const v = Array.isArray(j) ? j[0] : j;
      return String(v.output ?? v.text ?? v.response ?? v.result ?? v.message ?? raw);
    } catch {
      return raw;
    }
  }
  if (provider === 'gemini') {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(s.geminiModel)}:generateContent`;
    const res = await fetch(url, {
      method: 'POST',
      signal,
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': s.geminiKey },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: [{ role: 'user', parts: [{ text: user }] }],
      }),
    });
    const j = await res.json();
    if (!res.ok) throw new Error(`Gemini: ${j?.error?.message ?? res.status}`);
    return (j.candidates?.[0]?.content?.parts ?? []).map((p: { text?: string }) => p.text ?? '').join('');
  }
  if (provider === 'anthropic') {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      signal,
      headers: {
        'content-type': 'application/json',
        'x-api-key': s.anthropicKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: s.anthropicModel,
        max_tokens: 4096,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: user }],
      }),
    });
    const j = await res.json();
    if (!res.ok) throw new Error(`Anthropic: ${j?.error?.message ?? res.status}`);
    return (j.content ?? []).filter((c: { type: string }) => c.type === 'text').map((c: { text: string }) => c.text).join('');
  }
  return localEngine(req);
}

// ------------------------------------------------------------ Silnik lokalny (deterministyczny, offline)

export function summarize(text: string, maxSentences = 4): string[] {
  const sentences = text
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+(?=[A-ZĄĆĘŁŃÓŚŹŻ0-9])/u)
    .map((s) => s.trim())
    .filter((s) => s.length > 30 && s.length < 400);
  if (sentences.length <= maxSentences) return sentences;
  const freq = new Map<string, number>();
  for (const w of tokenize(text)) freq.set(w, (freq.get(w) ?? 0) + 1);
  const scored = sentences.map((s, i) => {
    const words = tokenize(s);
    const score = words.reduce((a, w) => a + (freq.get(w) ?? 0), 0) / Math.sqrt(words.length || 1) + (/\d/.test(s) ? 2 : 0);
    return { s, i, score };
  });
  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, maxSentences)
    .sort((a, b) => a.i - b.i)
    .map((x) => x.s);
}

export function keywords(text: string, n = 8): string[] {
  const freq = new Map<string, number>();
  for (const w of text.toLowerCase().split(/[^\p{L}]+/u)) if (w.length > 4) freq.set(w, (freq.get(w) ?? 0) + 1);
  return [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([w]) => w);
}

function localEngine(req: AiRequest): string {
  const text = req.context;
  switch (req.action) {
    case 'summarize':
      return summarize(text, 2).join(' ') || text;
    case 'expand':
      return `${text}\n\nKontekst analityczny: fragment odnosi się do pojęć ${keywords(text, 4).join(', ')}. Zaleca się weryfikację wartości liczbowych względem dokumentów źródłowych oraz ocenę ich wpływu na wycenę.`;
    case 'formal':
      return text
        .replace(/\bjest\b/g, 'pozostaje')
        .replace(/\bduż[yea]\b/g, 'istotny')
        .replace(/!+/g, '.')
        .replace(/^./, (c) => c.toUpperCase());
    case 'bullets':
      return summarize(text, 6).map((s) => `- ${s}`).join('\n') || `- ${text}`;
    default:
      return summarize(text, 5).join('\n\n') || text;
  }
}
