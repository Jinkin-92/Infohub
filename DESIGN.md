# InfoHub Design System

Version: `v2.0`
Last updated: `2026-04-23`
Applies to: `frontend/app/**`

This document replaces the earlier visual-only spec. Its purpose is to make UI decisions explicit, repeatable, and reviewable. Future UI changes should map to the tokens and component contracts below instead of inventing local styles ad hoc.

## 1. Product Goal

InfoHub is not a generic dashboard. It is a local-first content aggregator with unstable upstreams.

That changes the UI priority order:

1. Users must understand whether content is fresh, stale, partially failed, or blocked.
2. Users must be able to continue reading old content even while refresh is still running.
3. When a source or platform fails, the UI must say what failed and what to do next.
4. Visual polish matters, but never more than state clarity.

The web UI therefore optimizes for:

- trust over novelty
- reading flow over feature density
- explicit status over silent fallback
- progressive disclosure over crowded control panels

## 2. Design Principles

### 2.1 One Primary Job Per Screen

The home page exists to help the user read the latest useful content.

It does not exist to foreground:

- settings
- platform connection management
- RSS source administration
- diagnostic details

Those remain available, but visually subordinate.

### 2.2 Old Content Is Better Than Blank Content

If refresh is running, show the last known content immediately and label it clearly.

Never block the main reading surface with an indefinite loading state unless there is literally no cached content to show.

### 2.3 Status Must Be Actionable

Bad:

- `连接失败`
- `最近一次刷新未完成`
- `采集失败`

Good:

- `微博当前缺少可复用浏览器登录态，需重新连接微博后才能刷新时间线。`
- `最近一次刷新已完成 83 个源，3 个失败；旧内容仍可阅读。`
- `当前显示的是上次同步内容，后台刷新完成后会自动更新。`

### 2.4 Components, Not Page-Local Styling

All core UI states should be rendered by named, reusable components.

At minimum:

- `StatusBanner`
- `SectionHeader`
- `SourceChip`
- `SourceHealthBadge`
- `EmptyState`
- `ActionButton`
- `PanelCard`

### 2.5 Prefer Calm, Dense Interfaces

This product is closer to a reading tool than a marketing site. The visual system should stay quiet:

- low-chroma backgrounds
- few accent colors
- limited motion
- strong hierarchy
- compact but readable density

## 3. Brand and Visual Direction

The current product should look like:

- practical
- local-first
- trustworthy
- technical but not developer-only

It should not look like:

- a crypto dashboard
- a consumer news app with oversized cards
- an AI SaaS landing page
- an ultra-glassy concept UI

### 3.1 Keywords

Use these as taste anchors:

- quiet
- precise
- grounded
- readable
- diagnostic

### 3.2 Anti-Goals

Avoid:

- purple-heavy gradients
- oversized glass blur panels as a default style
- decorative icon walls
- excessive rounded corners everywhere
- center-aligned copy blocks in operational surfaces
- ambiguous green/red color usage without labels

## 4. Design Tokens

These tokens are the contract. CSS variables, Tailwind theme extensions, and component styles should align to them.

```yaml
colors:
  bg:
    canvas: "#F7F8FA"
    surface: "#FFFFFF"
    surfaceMuted: "#F3F4F6"
    surfaceStrong: "#EDEFF2"
    overlay: "rgba(15, 23, 42, 0.52)"
  text:
    primary: "#111827"
    secondary: "#4B5563"
    tertiary: "#6B7280"
    muted: "#9CA3AF"
    inverse: "#FFFFFF"
  border:
    subtle: "#E5E7EB"
    strong: "#CBD5E1"
    accent: "#7DD3FC"
  accent:
    primary: "#0EA5E9"
    hover: "#0284C7"
    active: "#0369A1"
    soft: "#E0F2FE"
  feedback:
    success: "#16A34A"
    successSoft: "#DCFCE7"
    warning: "#D97706"
    warningSoft: "#FEF3C7"
    error: "#DC2626"
    errorSoft: "#FEE2E2"
    info: "#2563EB"
    infoSoft: "#DBEAFE"
  unread:
    dot: "#EF4444"
platform:
  zhihu: "#1677FF"
  x: "#111111"
  wechat: "#07C160"
  weibo: "#E6162D"
  bilibili: "#FB7299"
  youtube: "#FF0000"
  news: "#F97316"
  custom: "#6B7280"
category:
  tech: "#2563EB"
  news: "#EA580C"
  finance: "#059669"
  life: "#DB2777"
  design: "#7C3AED"
  video: "#DC2626"
  aggregator: "#475569"
typography:
  fontSans: '-apple-system, BlinkMacSystemFont, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Helvetica Neue", Helvetica, Arial, sans-serif'
  pageTitle:
    size: "24px"
    weight: 700
    lineHeight: 1.3
  sectionTitle:
    size: "18px"
    weight: 600
    lineHeight: 1.35
  cardTitle:
    size: "15px"
    weight: 600
    lineHeight: 1.5
  body:
    size: "14px"
    weight: 400
    lineHeight: 1.65
  meta:
    size: "12px"
    weight: 400
    lineHeight: 1.5
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
  xxl: "32px"
radius:
  sm: "8px"
  md: "12px"
  lg: "16px"
shadow:
  card: "0 1px 3px rgba(15, 23, 42, 0.08)"
  hover: "0 8px 24px rgba(15, 23, 42, 0.10)"
  modal: "0 24px 64px rgba(15, 23, 42, 0.18)"
motion:
  fast: "150ms ease"
  normal: "200ms ease"
layout:
  contentMaxWidth: "1280px"
  panelMaxWidth: "960px"
  feedCardHeight: "420px"
```

## 5. Dark Mode Mapping

Dark mode is supported, but should stay operational rather than cinematic.

```yaml
darkMode:
  bg:
    canvas: "#0B1220"
    surface: "#111827"
    surfaceMuted: "#1F2937"
    surfaceStrong: "#273449"
  text:
    primary: "#F3F4F6"
    secondary: "#D1D5DB"
    tertiary: "#9CA3AF"
    muted: "#6B7280"
  border:
    subtle: "#374151"
    strong: "#4B5563"
```

Rules:

- keep status colors recognizable but slightly softened in dark mode
- avoid heavy glow effects
- keep content contrast high enough for long reading sessions

## 6. State Model

This is the most important part of the design system.

### 6.1 Refresh State

Every refresh-related surface must map to one of these states:

```yaml
refreshStates:
  idle:
    label: "当前内容已同步"
    tone: "neutral"
  refreshing:
    label: "正在后台刷新订阅源"
    tone: "info"
    rule: "show cached content underneath"
  partialFailure:
    label: "最近一次刷新部分失败"
    tone: "warning"
    rule: "show old content and list failed sources count"
  failed:
    label: "刷新未完成"
    tone: "error"
    rule: "show retry path and diagnostic summary"
  recovered:
    label: "刷新完成，内容已更新"
    tone: "success"
```

### 6.2 Platform Connection State

Platform cards must not collapse everything into `已连接/未连接`.

```yaml
platformStates:
  connected:
    label: "已连接"
    tone: "success"
  warning:
    label: "连接受限"
    tone: "warning"
  expired:
    label: "已过期"
    tone: "warning"
  invalid:
    label: "需重连"
    tone: "error"
  disconnected:
    label: "未连接"
    tone: "neutral"
```

Rules:

- `cookie exists` does not equal `connected`
- `connected` requires the collector path actually needed by that platform
- warning text must explain the gap between login state and collection state

### 6.3 Source Health State

Each source item in settings and feed-related admin views should map to:

```yaml
sourceHealth:
  active:
    badge: "采集正常"
    tone: "success"
  stale:
    badge: "等待刷新"
    tone: "neutral"
  interrupted:
    badge: "采集中断"
    tone: "warning"
  error:
    badge: "采集失败"
    tone: "error"
  disabled:
    badge: "已停用"
    tone: "neutral"
```

## 7. Component Contracts

These are the components that future UI refactors should converge on.

### 7.1 `StatusBanner`

Purpose:

- communicate system-wide state without hiding the main reading surface

Used in:

- home page top notices
- RSSHub outage warnings
- refresh-complete confirmations

Required props:

```yaml
StatusBanner:
  variant: ["info", "success", "warning", "error"]
  title: string
  description: string
  actionLabel: optional
  actionType: ["primary", "secondary", "danger"]
```

Rules:

- max one primary system banner at a time
- if multiple issues exist, show the most user-blocking one first
- success banners should auto-dismiss or yield to warning/error

### 7.2 `PanelCard`

Purpose:

- consistent shell for settings blocks, source panels, and modal sections

Rules:

- default radius: `md`
- background: `surface`
- border: `subtle`
- use shadow sparingly; settings lists should not feel over-layered

### 7.3 `ActionButton`

Variants:

```yaml
ActionButton:
  primary:
    use: "main task, one per area"
  secondary:
    use: "supporting task"
  subtle:
    use: "row actions, filters"
  danger:
    use: "delete, disconnect"
```

Rules:

- one primary action per local group
- avoid putting more than one saturated button in the same row

### 7.4 `SourceChip`

Purpose:

- represent platform/category/source filters

Rules:

- selected state uses filled background
- unselected state uses tinted surface with colored text only when the tint is still readable
- if there are zero items in a category, show disabled or hide it; do not present dead filters without explanation

### 7.5 `EmptyState`

Required structure:

```yaml
EmptyState:
  icon: optional
  title: string
  description: string
  primaryAction: optional
  secondaryAction: optional
```

Rules:

- empty states must be specific to cause
- `暂无内容` is acceptable only when the cause is truly unknown
- otherwise prefer:
  - `当前筛选下没有内容`
  - `该分类暂无可添加的公开 RSS`
  - `当前订阅源采集失败，请先修复连接`

### 7.6 `SourceHealthBadge`

Purpose:

- compact, repeatable source health label

Rules:

- badge must always pair color with text
- never use color alone to convey state

## 8. Screen-Specific Guidance

### 8.1 Home Page

Current structure in code:

- `TabBar`
- top-level refresh/status banners
- `SearchBar`
- `FavoriteFilter`
- main `FeedList`

Home page hierarchy must remain:

1. system status
2. navigation and filters
3. content
4. management entry points

Rules:

- `添加定制订阅源` and `添加公开 RSS` are important but secondary to the reading surface
- refresh messages must never replace the feed with a blank blocking layer if cached content exists
- all unread and recency summaries should be compact and factual

### 8.2 `TabBar`

Current `TabBar` uses two dropdown roots:

- `定制订阅源`
- `公开订阅源`

Rules:

- keep the top bar compact; do not turn it into a control center
- selected state must be readable without opening dropdowns
- settings entry stays on the far right and visually lower priority than the current active reading mode

### 8.3 `FeedList`

This is the core reading surface.

Rules:

- cards optimize for scanning, not for full-article reading
- date sections are meaningful grouping, so the section header must stay visually stronger than source metadata
- item cards should surface:
  - title
  - short summary
  - publish time
  - read/favorite actions
- they should not become overloaded with admin controls

Do:

- keep `查看原文` visually clear
- keep unread state lightweight but visible
- preserve dense layout

Do not:

- add large visual chrome around each item
- overuse shadows or color blocks
- make favorite controls compete with the content headline

### 8.4 `PublicSourcesPanel`

This is a selection workflow, not a browsing destination.

Rules:

- category switching should be fast and non-blocking
- selected count stays anchored in the footer
- already subscribed sources should read as resolved, not as active call-to-action
- empty categories should be fixed at the data layer first; if one still appears, explain why

### 8.5 `SettingsModal`

Settings currently mixes:

- source management
- favorites
- general settings
- about
- platform connections

Rules:

- keep the left nav stable and low-noise
- every tab should begin with one sentence explaining its job
- status notices inside settings should use the same banner semantics as the home page
- destructive actions must require inline confirmation, not modal stacking

### 8.6 `PlatformConnectionsPanel`

This is the highest-risk UX area because upstream instability is common.

Rules:

- show real collector readiness, not just credential presence
- `测试连接` should report which path was tested
- reconnect warnings must name the actual user action required
- explanatory copy should say which platforms require browser login and which do not

## 9. Copy Rules

### 9.1 Tone

Copy must be:

- direct
- factual
- operational

Avoid:

- emotional wording
- product marketing voice
- vague reassurance

### 9.2 Message Templates

Preferred patterns:

- `当前显示的是上次同步内容，后台刷新完成后会自动更新。`
- `最近一次刷新完成，但 3 个订阅源失败；旧内容仍可正常阅读。`
- `微博当前缺少可复用浏览器登录态，请重新连接微博。`
- `该公开 RSS 已失效，已自动停用，不会继续影响刷新。`

Avoid:

- `系统正在尝试恢复` unless there is an actual recovery loop
- `连接成功` if collection is still impossible
- `暂无内容` when the real state is `采集失败`

## 10. Motion and Interaction

Use motion only when it clarifies state change.

Allowed:

- subtle hover elevation for cards
- dropdown open/close
- modal enter/exit
- skeleton shimmer

Avoid:

- long spring animations
- decorative floating movement
- attention-grabbing pulses outside warnings/errors

## 11. Accessibility and Usability

Minimum requirements:

- all actionable controls >= `40px` high on desktop, `44px` on touch surfaces
- all status colors paired with text labels
- keyboard focus always visible
- text contrast must meet WCAG AA for primary reading surfaces
- empty, loading, and error states must be screen-readable and not icon-only

## 12. Do / Don't

### Do

- show cached content while refreshing
- define UI states before styling them
- make source/platform failures explicit
- keep content surfaces calm and dense
- use one primary action per area

### Don't

- equate cookie presence with collector readiness
- show dead categories without explanation
- let warning and success banners compete at the same hierarchy
- overload feed cards with admin actions
- solve state ambiguity with more color alone

## 13. Immediate Refactor Targets

These are the first UI changes that should align to this document:

1. Extract a shared `StatusBanner`
2. Extract a shared `EmptyState`
3. Extract `SourceHealthBadge`
4. Normalize button variants across:
   - `TabBar`
   - `PublicSourcesPanel`
   - `SettingsModal`
   - `PlatformConnectionsPanel`
5. Move current root CSS variables in `frontend/app/globals.css` to match these tokens exactly

## 14. Review Checklist

Any UI PR should answer:

- Which token set did this change use?
- Which named state does this screen now represent?
- Does the user know whether content is fresh, stale, or failed?
- If something is broken, does the UI tell the user the next action?
- Did this change reduce or increase cognitive load?

If those questions cannot be answered clearly, the change is not ready.
