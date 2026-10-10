# GoldPulse Strategy Engine — implementation specification

Status: implementation specification, not a validated trading system. No historical backtest results are claimed.

## 1. Data and timing
- Instrument initially: XAUUSD (Gold).
- Required candles: Daily and H1 OHLC, timestamped, with a documented broker/data source and timezone.
- Evaluate swings only after the relevant Daily candle has closed.
- Evaluate H1 setup conditions only after each H1 candle has closed. Breakout entries can trigger intrabar only after a valid confirmation candle exists.
- New entries permitted 09:00–18:00 Europe/Rome. Existing positions are not closed merely because the entry window ends.
- If the high-impact news calendar cannot be loaded, continue technical evaluation but show a prominent warning; do not silently claim the news filter is active.

## 2. Daily swings and structure
- Swing High candidate: the middle candle's high is strictly above the high of the immediately previous and immediately following Daily candles. Swing Low is the inverse.
- A candidate is confirmed only after the following Daily candle closes.
- Confirmed swing points alternate High/Low. Do not append consecutive same-type swings. If a higher high (or lower low) occurs before the opposite swing confirms, update the current structural extreme instead.
- If a single extreme candle qualifies as both types under the implementation's confirmed sequence, record the special case as one vertical marker spanning the full candle and log it for review.
- Trend classification: bullish when both confirmed highs and lows rise; bearish when both fall; otherwise neutral/unclassified.

## 3. Liquidity zones
- A confirmed Swing High creates a zone from the candle's upper wick only, from high to the wick/body intersection. A confirmed Swing Low uses the lower wick only, from the wick/body intersection to low.
- Only untouched/virgin zones can generate a new setup.
- Invalidate a zone when price touches or crosses it without producing a valid signal under the setup rules. Log and alert the invalidation; do not automatically delete an associated user-visible signal.
- In bearish structure, a completed H1 candle must close inside a Swing High zone; a later completed H1 candle must close back below the zone to trigger SELL at that candle's close. In bullish structure, invert this at a Swing Low zone for BUY.
- If one H1 candle traverses the entire zone and closes beyond its opposite edge, invalidate the setup rather than generating a trade.
- Stop: originating swing extreme / outer edge of the zone. Target: opposite eligible blue zone.
- Reject a trade if reward-to-risk is not strictly positive. Move SL to breakeven when price reaches 1R; once moved, keep it at breakeven.

## 4. Fibonacci reversal setup
- Bullish reversal: confirm when a Daily candle closes above the prior structural swing high after a bullish break. Draw Fib from the breaking leg's Swing Low to Swing High. Bearish reversal is inverse.
- Levels: 0, 23.6, 38.2, 50, 61.8, 100 and extension targets -0.27 and -0.618 (keep these labels configurable and verify price-coordinate convention in tests).
- Long setup: an H1 candle closes below 61.8, then a later H1 candle closes above 61.8. The setup is armed; entry triggers when price breaks the high of the confirming candle. Short is inverse: close above 61.8, later close below, then break the confirming candle low.
- SL: beyond the origin swing extreme. Apply a configurable spread allowance to the entry-to-SL risk calculation.
- Target is user-selectable: opposite blue zone, Fib -0.27, or Fib -0.618. Do not force partial close.
- Move SL to breakeven when price reaches Fib level 0; keep it there thereafter.
- A pending/confirmed signal remains valid until the user cancels it. If Daily structure reverses, alert but do not auto-cancel.

## 5. Overlapping setups and sizing
- When both blue-zone and Fibonacci setups are actionable, offer the user the choice: blue-zone only, Fibonacci only, or both with the planned total size split between them.
- If the Fibonacci trigger occurs first, permit full planned size on Fibonacci; do not require waiting for the blue-zone trigger.
- If both are selected, combined size must not exceed the planned total size. If total size is only 0.01, open one 0.01 entry and suppress the second entry.
- Risk presets: 0.5%, 1%, 2%, 3%. Round calculated size down to 0.01-lot increments, with 0.01 as the minimum. If 0.01 exceeds the selected risk, keep the minimum but show an explicit risk-overrun warning.
- Balance-based reference lot: €0–500 => 0.01; €501–800 => 0.02; €801–1100 => 0.03; then +0.01 for each further €300 band. Risk limit takes precedence over the reference lot. Recalculate using closed balance after trade P/L and deposits/withdrawals; exclude floating P/L.
- Spread allowance must be included in risk sizing. Pip size/value must be configurable and checked against the actual broker's XAUUSD contract specification before any live use.

## 6. Alerts and user controls
- Separate preliminary alert (price enters a zone of interest) from confirmed signal (all candle-close conditions met).
- Show entry, SL, target(s), planned lot, risk in currency and percent, reward/risk, signal type, and data timestamp.
- User can cancel a signal manually. Zone invalidation and Daily structure change produce alerts, not silent deletion.
- Block new entries outside 09:00–18:00 Europe/Rome and during 30 minutes before/after high-impact Gold-relevant calendar events, when calendar data is available.
- Calendar failure must be visible as “news filter unavailable”; technical signals may still be shown with that warning.

## 7. Backtest acceptance criteria
Do not publish a win rate or profitability claim until all of the following are recorded:
1. Historical OHLC source, date range, timezone, missing-bar checks, and data version.
2. Explicit spread/slippage/commission assumptions and conservative handling of bars where both SL and TP could be hit.
3. No look-ahead: Daily swing confirmation only after the right-hand candle closes; H1 entries only after the corresponding trigger is observable.
4. Separate metrics for blue-zone and Fibonacci trades, plus combined portfolio: trade count, win rate, net P/L, profit factor, maximum drawdown, average R, and consecutive losses.
5. Reproducible trade log containing timestamps, setup, entry, SL, target, lot, costs, outcome, and reason for exit.
6. Unit tests for swing alternation, zone virginity/invalidation, H1 close sequence, Fibonacci trigger, BE transitions, time/news filters, and split-size exposure.

## Important unresolved implementation checks
- Exact treatment of equal highs/lows and overlapping swing candidates must be deterministic and tested.
- Verify Fib extension price coordinates and the meaning of “2 pips” pending-order margin for the chosen broker's XAUUSD pip convention.
- Obtain historical data and validate timezone, spread, contract/pip value, and missing candles before computing performance.
- This file defines intended rules; it is not itself a live signal service or a completed backtest.
