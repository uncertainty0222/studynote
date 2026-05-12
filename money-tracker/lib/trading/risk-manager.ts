import { getTodayRiskLimits, getOpenTrades } from '../db';

export interface RiskConfig {
  maxDailyLossUsdt: number;
  maxSingleTradeRiskUsdt: number;
  maxPositionSizePercent: number;
  maxOpenPositions: number;
  maxLeverageX: number;
  cooldownAfterLossMinutes: number;
}

export const DEFAULT_RISK_CONFIG: RiskConfig = {
  maxDailyLossUsdt: Number(process.env.MAX_DAILY_LOSS_USDT ?? 200),
  maxSingleTradeRiskUsdt: Number(process.env.MAX_TRADE_RISK_USDT ?? 50),
  maxPositionSizePercent: 0.05,
  maxOpenPositions: 3,
  maxLeverageX: 5,
  cooldownAfterLossMinutes: 60,
};

export interface RiskCheckResult {
  allowed: boolean;
  reason: string;
}

export async function checkRiskLimits(
  tradeRiskUsdt: number,
  config: RiskConfig = DEFAULT_RISK_CONFIG
): Promise<RiskCheckResult> {
  if (process.env.TRADING_ENABLED !== 'true') {
    return { allowed: false, reason: 'TRADING_ENABLED=false — 환경변수를 true로 변경 후 활성화' };
  }

  const today = await getTodayRiskLimits();
  if (today.daily_loss_usdt >= config.maxDailyLossUsdt) {
    return { allowed: false, reason: `일일 손실 한도 초과: $${today.daily_loss_usdt.toFixed(2)} / $${config.maxDailyLossUsdt}` };
  }

  const openTrades = await getOpenTrades();
  if (openTrades.length >= config.maxOpenPositions) {
    return { allowed: false, reason: `최대 동시 포지션 수 초과: ${openTrades.length}/${config.maxOpenPositions}` };
  }

  if (tradeRiskUsdt > config.maxSingleTradeRiskUsdt) {
    return { allowed: false, reason: `단일 매매 리스크 한도 초과: $${tradeRiskUsdt.toFixed(2)} > $${config.maxSingleTradeRiskUsdt}` };
  }

  return { allowed: true, reason: '리스크 체크 통과' };
}

export function calculatePositionSize(params: {
  entryPrice: number;
  stopPrice: number;
  riskUsdt: number;
  leverage?: number;
}): { quantity: number; leverage: number; notionalUsdt: number } {
  const { entryPrice, stopPrice, riskUsdt } = params;
  const priceDiff = Math.abs(entryPrice - stopPrice);
  if (priceDiff === 0) throw new Error('진입가와 손절가가 동일합니다');

  const quantity = riskUsdt / priceDiff;
  const notionalUsdt = quantity * entryPrice;
  const rawLeverage = Math.ceil(notionalUsdt / (riskUsdt * 20));
  const leverage = Math.max(1, Math.min(DEFAULT_RISK_CONFIG.maxLeverageX, rawLeverage));

  return { quantity: parseFloat(quantity.toFixed(6)), leverage, notionalUsdt };
}
