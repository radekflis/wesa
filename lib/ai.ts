export type Provider = 'gemini' | 'claude';

function modelFor(provider: Provider) {
  return provider === 'gemini'
    ? process.env.GEMINI_MODEL || 'gemini-3.8-flash'
    : process.env.CLAUDE_MODEL || 'claude-opus-5-5';
}

export async function runAI(provider: Provider, prompt: string, context: string) {
  const system = `You are the contextual AI orchestrator inside WESA ALAW, an operating system for knowledge work.
Work from the supplied active workspace context. Be precise, traceable, and explicit about assumptions.
Do not invent source facts. Distinguish extracted facts, calculations, assumptions, and recommendations.
Return concise structured prose suitable for insertion into an editable workspace block.

ACTIVE CONTEXT:
${context}`;

  if (provider === 'gemini') {
    const key = process.env.GEMINI_API_KEY;
    if (!key) throw new Error('GEMINI_API_KEY is not configured.');
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelFor(provider)}:generateContent?key=${encodeURIComponent(key)}`, {
      method: 'POST',
      headers: {'content-type':'application/json'},
      body: JSON.stringify({contents:[{role:'user',parts:[{text:`${system}\n\nUSER TASK:\n${prompt}`}]}]}),
      cache: 'no-store',
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error?.message || 'Gemini request failed.');
    return data?.candidates?.[0]?.content?.parts?.map((p:any)=>p.text||'').join('') || 'Gemini returned no text.';
  }

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('ANTHROPIC_API_KEY is not configured.');
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method:'POST',
    headers:{
      'content-type':'application/json',
      'x-api-key':key,
      'anthropic-version':'2023-06-01',
    },
    body: JSON.stringify({
      model:modelFor(provider),
      max_tokens:4096,
      system,
      messages:[{role:'user',content:prompt}],
    }),
    cache:'no-store',
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || 'Claude request failed.');
  return data?.content?.filter((x:any)=>x.type==='text').map((x:any)=>x.text).join('') || 'Claude returned no text.';
}
