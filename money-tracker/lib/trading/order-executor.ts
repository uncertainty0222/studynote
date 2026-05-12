import crypto from 'crypto';
import { saveTradeLog, updateScanResultStatus, addDailyLoss, addDailyProfit } from '../db';
import { sendTradeExecutedAlert, sendDailyLimitAlert } from './telegram-notifier';
import { calculatePositionSize, checkRiskLimits, DEFAULT_RISK_CONFIG } from './risk-manager';
import type { ScanResult } from '../db';

function hmac(secret: string, data: string): string {
  return crypto.createHmac('sha256', secret).update(data).digest('hex');
}

async function binanceFuturesRequest(
  method: 'GET' | 'POST' | 'DELETE',
  path: string,
  params: Record<string, string | number>
): Promise<unknown> {
  const apiKey = process.env.BINANCE_API_KEY;
  const apiSecret = process.env.BINANCE_API_SECRET;
  if (!apiKey || !apiSecret) throw new Error('Binance API 키가 설정되지 않았습니다');

  const ts = Date.now();
  const allParams: Record<string, string> = { timestamp: String(ts) };
  for (const [k, v] of Object.entries(params)) allParams[k] = String(v);
  const qs = new URLSearchParams(allParams).toString();
  const sig = hmac(apiSecret, qs);
  const url = `https://fapi.binance.com${path}?${qs}&signature=${sig}`;

  const res = await fetch(url, {
    method,
    headers: { 'X-MBX-APIKEY': apiKey, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: method !== 'GET' ? `${qs}&signature=${sig}` : undefined,
  });

  const data = await res.json();
  if (!res.ok) throw new Error(`Binance API 오류: ${JSON.stringify(data)}`);
  return data;
}

export async function executeTrade(scanResult: ScanResult): Promise<{ success: boolean; message: string; tradeId?: number }> {
  const { id, symbol, entry_price, target_price, stop_price, scan_reasoning } = scanResult;
  if (!entry_price || !target_price || !stop_price) {
    return { success: false, message: '진입/목표/손절 가격 정보 없음' };
  }

  const isLong = target_price > entry_price;
  const side = isLong ? 'BUY' : 'SELL';
  const closeSide = isLong ? 'SELL' : 'BUY';
  const riskUsdt = Math.min(
    DEFAULT_RISK_CONFIG.maxSingleTradeRiskUsdt,
    DEFAULT_RISK_CONFIG.maxDailyLossUsdt * 0.1
  );

  const riskCheck = await checkRiskLimits(riskUsdt);
  if (!riskCheck.allowed) {
    return { success: false, message: riskCheck.reason };
  }

  const { quantity, leverage } = calculatePositionSize({
    entryPrice: entry_price,
    stopPrice: stop_price,
    riskUsdt,
  });

  try {
    await binanceFuturesRequest('POST', '/fapi/v1/leverage', {
      symbol, leverage: String(leverage),
    });

    const entryOrder = await binanceFuturesRequest('POST', '/fapi/v1/order', {
      symbol, side, type: 'MARKET', quantity: String(quantity),
    }) as { orderId: number };

    const slOrder = await binanceFuturesRequest('POST', '/fapi/v1/order', {
      symbol, side: closeSide, type: 'STOP_MARKET',
      stopPrice: stop_price.toFixed(4), closePosition: 'true',
    }) as { orderId: number };

    const tpOrder = await binanceFuturesRequest('POST', '/fapi/v1/order', {
      symbol, side: closeSide, type: 'TAKE_PROFIT_MARKET',
      stopPrice: target_price.toFixed(4), closePosition: 'true',
    }) as { orderId: number };

    const trade = await saveTradeLog({
      scan_result_id: id,
      symbol,
      side: isLong ? 'LONG' : 'SHORT',
      entry_price,
      quantity,
      target_price,
      stop_price,
      binance_order_id: String(entryOrder.orderId),
      binance_sl_order_id: String(slOrder.orderId),
      binance_tp_order_id: String(tpOrder.orderId),
      status: 'open',
      reasoning: scan_reasoning,
      approved_at: new Date().toISOString(),
    });

    await updateScanResultStatus(id, 'traded');

    await sendTradeExecutedAlert({
      symbol,
      side: isLong ? 'LONG' : 'SHORT',
      entry: entry_price,
      quantity,
      riskUsdt,
    });

    return { success: true, message: '매매 실행 완료', tradeId: trade.id };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, message: `주문 실패: ${message}` };
  }
}

export async function closeTrade(tradeId: number, side: 'LONG' | 'SHORT', symbol: string, pnlUsdt: number): Promise<void> {
  const { closeTradeLog } = await import('../db');
  const status = pnlUsdt >= 0 ? 'closed_tp' : 'closed_sl';
  await closeTradeLog(tradeId, status, pnlUsdt);

  if (pnlUsdt < 0) {
    await addDailyLoss(Math.abs(pnlUsdt));
    const today = await (await import('../db')).getTodayRiskLimits();
    if (today.daily_loss_usdt >= DEFAULT_RISK_CONFIG.maxDailyLossUsdt) {
      await sendDailyLimitAlert(today.daily_loss_usdt, DEFAULT_RISK_CONFIG.maxDailyLossUsdt);
    }
  } else {
    await addDailyProfit(pnlUsdt);
  }
}
