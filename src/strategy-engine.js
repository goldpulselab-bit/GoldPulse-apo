/* GoldPulse Lab — strategy engine prototype
 * Pure functions only. This file is NOT yet connected to index.html and is not a live signal service.
 * Candle format: {time, open, high, low, close}; timestamps must be chronological.
 */
(function (root) {
  "use strict";

  function validateCandles(candles) {
    if (!Array.isArray(candles)) throw new TypeError("candles must be an array");
    for (let i = 0; i < candles.length; i++) {
      const c = candles[i];
      if (!c || !["open", "high", "low", "close"].every(k => Number.isFinite(Number(c[k])))) {
        throw new TypeError("Invalid OHLC candle at index " + i);
      }
      if (Number(c.high) < Math.max(Number(c.open), Number(c.close), Number(c.low)) ||
          Number(c.low) > Math.min(Number(c.open), Number(c.close), Number(c.high))) {
        throw new RangeError("Inconsistent OHLC candle at index " + i);
      }
      if (i && Number(c.time) < Number(candles[i - 1].time)) {
        throw new RangeError("Candles must be sorted chronologically");
      }
    }
  }

  // Confirms a 3-candle pivot only when the right-hand candle has closed.
  // At array index i, the pivot is candle i-1; the returned confirmation time is candle i's time.
  function confirmedPivotAt(candles, i) {
    if (i < 2 || i >= candles.length) return null;
    const left = candles[i - 2], pivot = candles[i - 1], right = candles[i];
    const isHigh = pivot.high > left.high && pivot.high > right.high;
    const isLow = pivot.low < left.low && pivot.low < right.low;
    if (isHigh && isLow) {
      return { type: "BOTH", index: i - 1, time: pivot.time, confirmedAt: right.time,
        high: pivot.high, low: pivot.low };
    }
    if (isHigh) return { type: "HIGH", index: i - 1, time: pivot.time,
      confirmedAt: right.time, price: pivot.high, high: pivot.high, low: pivot.low };
    if (isLow) return { type: "LOW", index: i - 1, time: pivot.time,
      confirmedAt: right.time, price: pivot.low, high: pivot.high, low: pivot.low };
    return null;
  }

  // Produces a transparent candidate list. Alternation/structural-extreme updates are intentionally
  // left as a separate explicit stage so equal/overlapping pivots can be reviewed in tests.
  function findConfirmedPivotCandidates(candles) {
    validateCandles(candles);
    const result = [];
    for (let i = 2; i < candles.length; i++) {
      const p = confirmedPivotAt(candles, i);
      if (p) result.push(p);
    }
    return result;
  }

  function wickZone(candle, type) {
    if (!candle || !["HIGH", "LOW"].includes(type)) throw new TypeError("type must be HIGH or LOW");
    if (type === "HIGH") {
      const bodyTop = Math.max(Number(candle.open), Number(candle.close));
      return { type, low: bodyTop, high: Number(candle.high), valid: Number(candle.high) > bodyTop, virgin: true };
    }
    const bodyBottom = Math.min(Number(candle.open), Number(candle.close));
    return { type, low: Number(candle.low), high: bodyBottom, valid: bodyBottom > Number(candle.low), virgin: true };
  }

  // A touch invalidates a virgin zone unless the calling strategy logic has already generated
  // the valid setup on that candle. Call only after checking the setup condition for the candle.
  function zoneTouched(zone, candle) {
    if (!zone || !candle || !zone.valid || !zone.virgin) return false;
    return Number(candle.high) >= zone.low && Number(candle.low) <= zone.high;
  }

  function balanceReferenceLot(balance) {
    const b = Number(balance);
    if (!Number.isFinite(b) || b < 0) throw new RangeError("balance must be a non-negative number");
    if (b <= 500) return 0.01;
    return 0.02 + Math.floor((b - 501) / 300) * 0.01;
  }

  // pipValuePer001 is the account-currency value of one pip at 0.01 lot.
  // stopPips should already include the configured spread allowance.
  function sizeForRisk({ balance, riskPercent, stopPips, pipValuePer001 = 0.09 }) {
    const b = Number(balance), r = Number(riskPercent), s = Number(stopPips), pv = Number(pipValuePer001);
    if (![b, r, s, pv].every(Number.isFinite) || b < 0 || r <= 0 || s <= 0 || pv <= 0) {
      throw new RangeError("Invalid balance, risk, stop distance or pip value");
    }
    const riskCash = b * r / 100;
    const rawLots = riskCash / (s * pv) * 0.01;
    const rounded = Math.floor((rawLots + 1e-10) * 100) / 100;
    const lot = Math.max(0.01, rounded);
    const actualRiskCash = s * pv * (lot / 0.01);
    return {
      lot: Number(lot.toFixed(2)),
      riskCash,
      actualRiskCash,
      actualRiskPercent: b > 0 ? actualRiskCash / b * 100 : null,
      minimumLotExceedsRisk: actualRiskCash > riskCash + 1e-8,
      balanceReferenceLot: balanceReferenceLot(b),
      referenceLotExceeded: lot > balanceReferenceLot(b) + 1e-8
    };
  }

  function rewardRisk(entry, stop, target, side) {
    const e = Number(entry), s = Number(stop), t = Number(target);
    if (![e, s, t].every(Number.isFinite)) return null;
    const risk = side === "LONG" ? e - s : s - e;
    const reward = side === "LONG" ? t - e : e - t;
    if (!["LONG", "SHORT"].includes(side) || risk <= 0 || reward <= 0) return null;
    return reward / risk;
  }

  function summarizeTrades(trades, startingBalance) {
    const start = Number(startingBalance);
    if (!Number.isFinite(start) || start < 0) throw new RangeError("Invalid starting balance");
    let balance = start, peak = start, maxDrawdownCash = 0, grossProfit = 0, grossLoss = 0;
    let wins = 0, losses = 0, consecutiveLosses = 0, maxConsecutiveLosses = 0;
    for (const trade of trades || []) {
      const pnl = Number(trade.pnl);
      if (!Number.isFinite(pnl)) throw new TypeError("Every trade must have a numeric pnl");
      balance += pnl;
      if (pnl > 0) { wins++; grossProfit += pnl; consecutiveLosses = 0; }
      else if (pnl < 0) { losses++; grossLoss += Math.abs(pnl); consecutiveLosses++; maxConsecutiveLosses = Math.max(maxConsecutiveLosses, consecutiveLosses); }
      peak = Math.max(peak, balance);
      if (peak > 0) maxDrawdownCash = Math.max(maxDrawdownCash, (peak - balance) / peak * 100);
    }
    const count = (trades || []).length;
    return {
      trades: count, wins, losses, winRatePercent: count ? wins / count * 100 : 0,
      netPnl: balance - start, endingBalance: balance,
      profitFactor: grossLoss > 0 ? grossProfit / grossLoss : (grossProfit > 0 ? Infinity : 0),
      maxDrawdownPercent: maxDrawdownCash, maxConsecutiveLosses
    };
  }

  const api = { validateCandles, confirmedPivotAt, findConfirmedPivotCandidates, wickZone,
    zoneTouched, balanceReferenceLot, sizeForRisk, rewardRisk, summarizeTrades };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.GoldPulseStrategyEngine = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
