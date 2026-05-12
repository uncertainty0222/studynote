import { getTaPatterns, getLatestStyleProfile, saveStyleProfile } from '../db';

export interface StyleProfile {
  topIndicators: { name: string; frequency: number }[];
  topPatterns: { name: string; frequency: number }[];
  preferredTimeframes: { tf: string; frequency: number }[];
  avgRiskReward: number;
  biasSplit: { bullish: number; bearish: number; neutral: number };
  avgConfidence: number;
  totalPatterns: number;
}

export async function buildStyleProfile(): Promise<StyleProfile | null> {
  const patterns = await getTaPatterns(200);
  const meaningful = patterns.filter((p) => (p.confidence_score ?? 0) >= 0.4);
  if (meaningful.length < 5) return null;

  const indicatorCount: Record<string, number> = {};
  const patternCount: Record<string, number> = {};
  const tfCount: Record<string, number> = {};
  let totalRR = 0; let rrCount = 0;
  let bullish = 0, bearish = 0, neutral = 0;
  let totalConf = 0;

  for (const p of meaningful) {
    for (const ind of (p.indicators_used ?? [])) {
      indicatorCount[ind] = (indicatorCount[ind] ?? 0) + 1;
    }
    if (p.pattern_type && p.pattern_type !== 'none') {
      patternCount[p.pattern_type] = (patternCount[p.pattern_type] ?? 0) + 1;
    }
    if (p.timeframe) {
      tfCount[p.timeframe] = (tfCount[p.timeframe] ?? 0) + 1;
    }
    if (p.risk_reward_ratio) { totalRR += p.risk_reward_ratio; rrCount++; }
    const bias = (p.raw_analysis as Record<string, string> | null)?.bias;
    if (bias === 'bullish') bullish++;
    else if (bias === 'bearish') bearish++;
    else neutral++;
    totalConf += p.confidence_score ?? 0;
  }

  const toRanked = (map: Record<string, number>) =>
    Object.entries(map)
      .map(([name, count]) => ({ name, frequency: count / meaningful.length }))
      .sort((a, b) => b.frequency - a.frequency)
      .slice(0, 10);

  const profile: StyleProfile = {
    topIndicators: toRanked(indicatorCount),
    topPatterns: toRanked(patternCount),
    preferredTimeframes: toRanked(tfCount).map(({ name, frequency }) => ({ tf: name, frequency })),
    avgRiskReward: rrCount > 0 ? totalRR / rrCount : 2,
    biasSplit: {
      bullish: bullish / meaningful.length,
      bearish: bearish / meaningful.length,
      neutral: neutral / meaningful.length,
    },
    avgConfidence: totalConf / meaningful.length,
    totalPatterns: meaningful.length,
  };

  const latest = await getLatestStyleProfile();
  const nextVersion = (latest?.version ?? 0) + 1;
  await saveStyleProfile({
    version: nextVersion,
    profile_data: profile as unknown as Record<string, unknown>,
    tweet_count: meaningful.length,
  });

  return profile;
}

export function buildStylePromptContext(profile: StyleProfile): string {
  const indicators = profile.topIndicators.slice(0, 5).map((i) => `${i.name}(${Math.round(i.frequency * 100)}%)`).join(', ');
  const patterns = profile.topPatterns.slice(0, 5).map((p) => `${p.name}(${Math.round(p.frequency * 100)}%)`).join(', ');
  const tfs = profile.preferredTimeframes.slice(0, 3).map((t) => `${t.tf}(${Math.round(t.frequency * 100)}%)`).join(', ');
  return [
    `HaxKai TA 스타일 프로파일 (${profile.totalPatterns}개 분석 기반):`,
    `- 주요 지표: ${indicators}`,
    `- 선호 패턴: ${patterns}`,
    `- 선호 타임프레임: ${tfs}`,
    `- 평균 R:R = ${profile.avgRiskReward.toFixed(1)}:1`,
    `- 성향: 불리시 ${Math.round(profile.biasSplit.bullish * 100)}% / 베어리시 ${Math.round(profile.biasSplit.bearish * 100)}%`,
  ].join('\n');
}
