import { NextRequest, NextResponse } from 'next/server';
import { runAI, type Provider } from '@/lib/ai';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const provider = body.provider as Provider;
    const prompt = String(body.prompt || '').trim();
    const context = String(body.context || '').slice(0, 120000);
    if (!['gemini','claude'].includes(provider)) return NextResponse.json({error:'Unsupported provider.'},{status:400});
    if (!prompt) return NextResponse.json({error:'Prompt is required.'},{status:400});
    const result = await runAI(provider,prompt,context);
    return NextResponse.json({provider,result});
  } catch (e:any) {
    return NextResponse.json({error:e?.message || 'AI request failed.'},{status:500});
  }
}
