import Anthropic from '@anthropic-ai/sdk';

const SYSTEM_PROMPT = `You are a technical analysis extraction engine. Given a crypto chart image and tweet text, extract structured data as JSON with NO additional text or explanation.

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
  "notes": "any other key observations"
}

If no chart is present or the tweet is not technical analysis related, return confidence: 0.0 and pattern_type: "none".`;

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
}

export async function analyzeChartTweet(
  tweetText: string,
  imageUrls: string[]
): Promise<ChartAnalysis> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY 환경변수가 필요합니다');

  const anthropic = new Anthropic({ apiKey });

  const imageContents: Anthropic.ImageBlockParam[] = await Promise.all(
    imageUrls.slice(0, 2).map(async (url) => {
      const res = await fetch(url);
      const buffer = await res.arrayBuffer();
      const base64 = Buffer.from(buffer).toString('base64');
      const contentType = res.headers.get('content-type') ?? 'image/jpeg';
      return {
        type: 'image' as const,
        source: {
          type: 'base64' as const,
          media_type: contentType as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
          data: base64,
        },
      };
    })
  );

  const userContent: Anthropic.ContentBlockParam[] = [
    ...imageContents,
    {
      type: 'text',
      text: `Tweet text: "${tweetText}"\n\nExtract the technical analysis as JSON.`,
    },
  ];

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userContent }],
  });

  const text = response.content.find((b) => b.type === 'text')?.text ?? '{}';

  try {
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
    };
  } catch {
    return {
      symbol: null, timeframe: null, pattern_type: 'none',
      indicators_visible: [], key_levels: [],
      entry_condition: null, target_condition: null, stop_condition: null,
      bias: 'neutral', risk_reward_estimate: null, confidence: 0, notes: '',
    };
  }
}

export async function analyzeTextOnlyTweet(tweetText: string): Promise<ChartAnalysis> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY 환경변수가 필요합니다');

  const anthropic = new Anthropic({ apiKey });

  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 512,
    system: SYSTEM_PROMPT,
    messages: [{
      role: 'user',
      content: `Tweet text only (no image): "${tweetText}"\n\nExtract any technical analysis as JSON.`,
    }],
  });

  const text = response.content.find((b) => b.type === 'text')?.text ?? '{}';
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    return JSON.parse(jsonMatch?.[0] ?? '{}') as ChartAnalysis;
  } catch {
    return {
      symbol: null, timeframe: null, pattern_type: 'none',
      indicators_visible: [], key_levels: [],
      entry_condition: null, target_condition: null, stop_condition: null,
      bias: 'neutral', risk_reward_estimate: null, confidence: 0, notes: '',
    };
  }
}
