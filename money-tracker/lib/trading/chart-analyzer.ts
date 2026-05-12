import Anthropic from '@anthropic-ai/sdk';
import type { TaSnapshot } from './ta-calculator';

const SYSTEM_PROMPT = `You are a technical analysis extraction engine. Given a crypto chart image, tweet text, and optionally the real market state at the time of posting, extract structured data as JSON with NO additional text or explanation.

Return ONLY valid JSON matching this exact schema:
{
  "symbol": "string or null (e.g. BTCUSDT)",
  "timeframe": "1M|5M|15M|1H|4H|1D|1W or null",
  "pattern_type": "bull_flag|bear_flag|double_top|double_bottom|head_shoulders|triangle_ascending|triangle_descending|wedge_rising|wedge_falling|breakout|breakdown|support_bounce|resistance_reject|channel|consolidation|other|none",
  "indicators_visible": ["array of indicator names visible on chart, e.g. RSI, MACD, EMA20, EMA200, BB, Volume"],
  "key_levels": [{"type": "support|resistance|entry|target|stop", "price": number}],
  "entry_condition": "text description of entry trigger or null",
  "target_condition": "text description of profit target or null",
  "stop_condition": "text description of stop loss or null",
  "bias": "bullish|bearish|neutral",
  "risk_reward_estimate": number or null,
  "confidence": 0.0 to 1.0,
  "notes": "any other key observations",
  "timing_reasoning": "한국어로 작성. 이 차트가 게시된 시점에 왜 지금이 매수/매도 타이밍인지 TA 논리로 설명. 제공된 실제 지표값(RSI, EMA, MACD, 거래량)을 구체적으로 인용하여 설명할 것. 2-4문장."
}

If no chart is present or the tweet is not technical analysis related, return confidence: 0.0, pattern_type: "none", and timing_reasoning: null.`;

export interface ChartAnalysis {
  symbol: string | null;
  timeframe: string | null;
  pattern_type: string;
  indicators_visible: string[];
  key_levels: { type: string; price: number }[];
  entry_condition: string | null;
  target_condition: string | null;
  stop_condition: string | null;
  bias: 'bullish' | 'bearish' | 'neutral';
  risk_reward_estimate: number | null;
  confidence: number;
  notes: string;
  timing_reasoning: string | null;
}

export interface TimingContext {
  symbol: string;
  timeframe: string;
  tweetTime: string;        // ISO 8601
  price: number;
  rsi14: number | null;
  macdHistogram: number | null;
  ema20: number | null;
  ema50: number | null;
  ema200: number | null;
  priceVsEma200: number | null;
  volumeRatio: number | null;
  atr14: number | null;
}

function buildTimingContextText(ctx: TimingContext): string {
  const kstTime = new Date(ctx.tweetTime).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });
  const lines = [
    `===이 차트가 게시된 시점(${kstTime} KST)의 실제 시장 상태===`,
    `심볼: ${ctx.symbol} | 타임프레임: ${ctx.timeframe}`,
    `현재가: $${ctx.price.toLocaleString()}`,
  ];
  if (ctx.rsi14 !== null) {
    const rsiNote = ctx.rsi14 < 30 ? '(과매도)' : ctx.rsi14 > 70 ? '(과매수)' : ctx.rsi14 < 45 ? '(약세 구간)' : '(강세 구간)';
    lines.push(`RSI(14): ${ctx.rsi14.toFixed(1)} ${rsiNote}`);
  }
  if (ctx.ema200 !== null) {
    const pct = ctx.priceVsEma200?.toFixed(1);
    lines.push(`EMA200: $${ctx.ema200.toLocaleString()} (현재가 대비 ${pct && Number(pct) >= 0 ? '+' : ''}${pct}%)`);
  }
  if (ctx.ema20 !== null) lines.push(`EMA20: $${ctx.ema20.toLocaleString()}`);
  if (ctx.ema50 !== null) lines.push(`EMA50: $${ctx.ema50.toLocaleString()}`);
  if (ctx.macdHistogram !== null) {
    lines.push(`MACD 히스토그램: ${ctx.macdHistogram > 0 ? '+' : ''}${ctx.macdHistogram.toFixed(6)} (${ctx.macdHistogram > 0 ? '상승 모멘텀' : '하락 모멘텀'})`);
  }
  if (ctx.volumeRatio !== null) {
    lines.push(`거래량: 20일 평균 대비 ${ctx.volumeRatio.toFixed(1)}배`);
  }
  if (ctx.atr14 !== null) {
    lines.push(`ATR(14): $${ctx.atr14.toFixed(2)} (변동성 지표)`);
  }
  return lines.join('\n');
}

async function callClaude(
  imageContents: Anthropic.ImageBlockParam[],
  tweetText: string,
  timingContextText: string,
  model: string,
  maxTokens: number
): Promise<ChartAnalysis> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY 환경변수가 필요합니다');
  const anthropic = new Anthropic({ apiKey });

  const userContent: Anthropic.ContentBlockParam[] = [
    ...imageContents,
    {
      type: 'text',
      text: `트윗 텍스트: "${tweetText}"\n\n${timingContextText}\n\n위 정보를 바탕으로 TA 분석 JSON을 반환하세요.`,
    },
  ];

  const response = await anthropic.messages.create({
    model,
    max_tokens: maxTokens,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userContent }],
  });

  const text = response.content.find((b) => b.type === 'text')?.text ?? '{}';
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  const parsed = JSON.parse(jsonMatch?.[0] ?? '{}') as ChartAnalysis;

  return {
    symbol: parsed.symbol ?? null,
    timeframe: parsed.timeframe ?? null,
    pattern_type: parsed.pattern_type ?? 'none',
    indicators_visible: parsed.indicators_visible ?? [],
    key_levels: parsed.key_levels ?? [],
    entry_condition: parsed.entry_condition ?? null,
    target_condition: parsed.target_condition ?? null,
    stop_condition: parsed.stop_condition ?? null,
    bias: parsed.bias ?? 'neutral',
    risk_reward_estimate: parsed.risk_reward_estimate ?? null,
    confidence: parsed.confidence ?? 0,
    notes: parsed.notes ?? '',
    timing_reasoning: parsed.timing_reasoning ?? null,
  };
}

const EMPTY_ANALYSIS: ChartAnalysis = {
  symbol: null, timeframe: null, pattern_type: 'none',
  indicators_visible: [], key_levels: [],
  entry_condition: null, target_condition: null, stop_condition: null,
  bias: 'neutral', risk_reward_estimate: null, confidence: 0, notes: '',
  timing_reasoning: null,
};

export async function analyzeChartTweet(
  tweetText: string,
  imageUrls: string[],
  timingCtx?: TimingContext
): Promise<ChartAnalysis> {
  const imageContents: Anthropic.ImageBlockParam[] = await Promise.all(
    imageUrls.slice(0, 2).map(async (url) => {
      const res = await fetch(url);
      const buffer = await res.arrayBuffer();
      const base64 = Buffer.from(buffer).toString('base64');
      const contentType = (res.headers.get('content-type') ?? 'image/jpeg')
        .split(';')[0] as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';
      return {
        type: 'image' as const,
        source: { type: 'base64' as const, media_type: contentType, data: base64 },
      };
    })
  );

  const timingContextText = timingCtx ? buildTimingContextText(timingCtx) : '';

  try {
    return await callClaude(imageContents, tweetText, timingContextText, 'claude-sonnet-4-6', 1024);
  } catch {
    return EMPTY_ANALYSIS;
  }
}

export async function analyzeTextOnlyTweet(
  tweetText: string,
  timingCtx?: TimingContext
): Promise<ChartAnalysis> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY 환경변수가 필요합니다');
  const anthropic = new Anthropic({ apiKey });

  const timingContextText = timingCtx ? buildTimingContextText(timingCtx) : '';

  try {
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 512,
      system: SYSTEM_PROMPT,
      messages: [{
        role: 'user',
        content: `트윗 텍스트 (이미지 없음): "${tweetText}"\n\n${timingContextText}\n\nJSON으로 반환하세요.`,
      }],
    });
    const text = response.content.find((b) => b.type === 'text')?.text ?? '{}';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    const parsed = JSON.parse(jsonMatch?.[0] ?? '{}') as ChartAnalysis;
    return { ...EMPTY_ANALYSIS, ...parsed };
  } catch {
    return EMPTY_ANALYSIS;
  }
}
