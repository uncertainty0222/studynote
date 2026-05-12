import type { TaSnapshot } from './ta-calculator';
import type { StyleProfile } from './style-builder';

export function scoreSetup(params: {
  detectedPattern: string;
  snapshot: TaSnapshot;
  indicators: string[];
  timeframe: string;
  style: StyleProfile;
}): { score: number; reasoning: string } {
  const { detectedPattern, snapshot, indicators, timeframe, style } = params;
  let score = 0;
  const reasons: string[] = [];

  // 패턴 매칭 (최대 0.35점)
  const patternMatch = style.topPatterns.find((p) => p.name === detectedPattern);
  if (patternMatch) {
    const pts = Math.min(0.35, patternMatch.frequency * 0.7);
    score += pts;
    reasons.push(`패턴 '${detectedPattern}' HaxKai 사용빈도 ${Math.round(patternMatch.frequency * 100)}%`);
  }

  // 타임프레임 매칭 (최대 0.20점)
  const tfMatch = style.preferredTimeframes.find((t) => t.tf === timeframe);
  if (tfMatch) {
    const pts = Math.min(0.20, tfMatch.frequency * 0.4);
    score += pts;
    reasons.push(`타임프레임 ${timeframe} 선호도 ${Math.round(tfMatch.frequency * 100)}%`);
  }

  // 지표 매칭 (최대 0.25점)
  const topIndicators = style.topIndicators.slice(0, 8).map((i) => i.name.toUpperCase());
  const matchedIndicators = indicators.filter((ind) =>
    topIndicators.some((ti) => ind.toUpperCase().includes(ti) || ti.includes(ind.toUpperCase()))
  );
  if (matchedIndicators.length > 0) {
    const pts = Math.min(0.25, (matchedIndicators.length / topIndicators.length) * 0.5);
    score += pts;
    reasons.push(`HaxKai 주요 지표 ${matchedIndicators.join(', ')} 감지`);
  }

  // RSI 조건 보너스 (최대 0.10점)
  if (snapshot.rsi14 !== null) {
    if (snapshot.rsi14 < 35) { score += 0.10; reasons.push(`RSI(14)=${snapshot.rsi14.toFixed(1)} 과매도`); }
    else if (snapshot.rsi14 > 65) { score += 0.05; reasons.push(`RSI(14)=${snapshot.rsi14.toFixed(1)} 과매수`); }
    else if (snapshot.rsi14 > 50 && snapshot.rsi14 < 60) { score += 0.05; reasons.push(`RSI(14)=${snapshot.rsi14.toFixed(1)} 상승 모멘텀 구간`); }
  }

  // 거래량 확인 (최대 0.10점)
  if (snapshot.volumeRatio && snapshot.volumeRatio > 1.3) {
    score += 0.10;
    reasons.push(`거래량 평균 대비 ${snapshot.volumeRatio.toFixed(1)}배 (관심 증가)`);
  }

  // EMA 정렬 보너스
  if (snapshot.ema20 && snapshot.ema50 && snapshot.ema200) {
    if (snapshot.ema20 > snapshot.ema50 && snapshot.ema50 > snapshot.ema200) {
      score = Math.min(1.0, score + 0.05);
      reasons.push('EMA 정배열 (상승 추세)');
    } else if (snapshot.ema20 < snapshot.ema50 && snapshot.ema50 < snapshot.ema200) {
      score = Math.min(1.0, score + 0.05);
      reasons.push('EMA 역배열 (하락 추세)');
    }
  }

  score = Math.min(1.0, score);

  const reasoning = [
    `${Math.round(score * 100)}% 유사도 | ${detectedPattern} 패턴`,
    ...reasons,
    snapshot.rsi14 ? `RSI: ${snapshot.rsi14.toFixed(1)}` : '',
    snapshot.macdHistogram ? `MACD 히스토그램: ${snapshot.macdHistogram > 0 ? '양수(상승)' : '음수(하락)'}` : '',
  ].filter(Boolean).join(' | ');

  return { score, reasoning };
}
