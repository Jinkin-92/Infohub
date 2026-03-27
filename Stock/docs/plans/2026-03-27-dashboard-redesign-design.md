# Dashboard Redesign Research

## Requirement Corrections

The previous preview used rebalance windows inferred from the current codebase. That does not match the clarified product rule.

The corrected product rule is:

- every strategy can evaluate and adjust positions every trading day
- execution only needs to obey:
  - A-share market open-day constraints
  - A-share T+1 sell rule

This means the dashboard should not visually imply monthly or quarterly-only trading unless a specific strategy explicitly defines one later.

## Why Some Strategies Traded But Others Did Not In The Current Build

This is currently caused by code-level strategy scheduling, not by your intended product rule.

Current code behavior:

- `momentum`: only rebalances when `day <= 3`
- `dividend_lowvol`: only rebalances in quarter months and `day <= 5`
- `high_growth`: only rebalances in selected months and `day <= 10`
- `global_alloc`: rebalances near month-end or on allocation drift
- `personal`: dynamic allocation, can act every run

So the current implementation is inconsistent with your clarified requirement and should be corrected in the next implementation pass.

## Corrected Design Targets

### Overview Page

The overview page should behave like a strategy command center rather than a general BI dashboard.

Right information rail should show only operational facts:

- latest data update status
- database path
- total symbol count stored in database
- database update frequency

Main comparison zone should show:

- detailed total-asset comparison chart across strategies
- visible axes
- visible grid lines
- value labels or hover values
- clearer scale reading

Summary table should not list individual holdings. It should show strategy-level aggregates only:

- total assets
- total market value
- floating PnL
- reference daily PnL
- holding ratio

Execution summary should show, for the latest trading day only:

- buy count per strategy
- sell count per strategy

### Strategy Detail Page

Each strategy gets its own dedicated page.

The main chart should be:

- total asset curve
- no per-symbol K-line in the default layout
- with axes, grid lines, and visible values

The right information rail should contain only:

- strategy rebalance/trading rule description

Interactive linkage:

- when the mouse moves on the total-asset curve, the operation record panel and signal explanation panel should switch to the selected date

Holdings detail table should include:

- symbol
- name
- shares
- position weight
- average cost
- current price
- holding days
- floating PnL

## Tonghuashun-Inspired Layout Direction

The redesigned UI should borrow the feel of Tonghuashun trading and holdings pages:

- dense desktop-first information layout
- dark workstation background with strong panel segmentation
- bright numeric emphasis
- compact tables above the fold
- trading-centric hierarchy rather than marketing-card hierarchy

Recommended visual traits:

- graphite and deep navy surfaces
- red / green used only for China-market gain-loss semantics
- compact Chinese tables
- wider central chart area
- narrow but useful right-side operational rail

## Revised Preview Deliverables

Generated preview images:

- `design_previews/dashboard_overview_preview.png`
- `design_previews/dashboard_strategy_detail_preview.png`

These revised previews reflect the corrected requirement set above and should be used as the approval checkpoint before implementation.
