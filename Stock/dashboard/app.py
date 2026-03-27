"""
Streamlit dashboard backed by SQLite.
"""

from __future__ import annotations

from pathlib import Path

import pandas as pd
import plotly.graph_objects as go
import streamlit as st

from dashboard.monitor import build_dashboard_snapshot


st.set_page_config(page_title="策略监控面板", page_icon="📊", layout="wide")


@st.cache_data(ttl=30, show_spinner=False)
def load_snapshot(db_path_text: str) -> dict:
    return build_dashboard_snapshot(Path(db_path_text))


def format_money(value: float) -> str:
    return f"{value:,.2f}"


def format_number(value: object) -> str:
    if isinstance(value, float):
        return f"{value:,.2f}"
    if isinstance(value, int):
        return f"{value:,}"
    return str(value)


def tone_for_value(value: object, semantic: str = "neutral") -> str:
    if semantic == "pnl" and isinstance(value, (int, float)):
        if value > 0:
            return "#ff6b7a"
        if value < 0:
            return "#29c27f"
    return "#dbe5f5"


def render_metric_band(snapshot: dict) -> None:
    cards = [
        ("策略数量", snapshot["strategy_count"], "neutral"),
        ("总现金", format_money(snapshot["total_cash"]), "neutral"),
        ("总市值", format_money(snapshot["total_stock_value"]), "neutral"),
        ("最近运行数据源", snapshot["latest_run_provider"], "neutral"),
        ("最近交易日", snapshot["latest_run_date"], "neutral"),
    ]
    cols = st.columns(len(cards))
    for col, (label, value, _semantic) in zip(cols, cards):
        col.markdown(
            f"""
            <div class="metric-card">
              <div class="metric-label">{label}</div>
              <div class="metric-value">{value}</div>
            </div>
            """,
            unsafe_allow_html=True,
        )


def render_sidebar(snapshot: dict) -> str:
    navigation = ["总览驾驶舱"] + [page["display_name"] for page in snapshot["strategy_pages"].values()]
    selected_page = st.sidebar.selectbox("页面", navigation, index=0)
    st.sidebar.markdown("### 策略快照")
    for page in snapshot["strategy_pages"].values():
        st.sidebar.markdown(
            f"""
            <div class="sidebar-snapshot">
              <div class="sidebar-snapshot-title">{page['display_name']}</div>
              <div class="sidebar-snapshot-sub">总资产 {page['current_total_asset']:,.0f}</div>
              <div class="sidebar-snapshot-sub">持仓 {len(page['positions'])} / 本期交易 {page['month_trade_count']}</div>
            </div>
            """,
            unsafe_allow_html=True,
        )
    return selected_page


def build_overview_chart(curve_df: pd.DataFrame) -> go.Figure:
    fig = go.Figure()
    palette = ["#5da8ff", "#ff6b7a", "#f3b43f", "#29c27f", "#b59cff"]
    for idx, (strategy_name, group) in enumerate(curve_df.groupby("策略")):
        fig.add_trace(
            go.Scatter(
                x=group["日期"].astype(str),
                y=group["总资产"],
                mode="lines+markers",
                name=strategy_name,
                line=dict(width=3, color=palette[idx % len(palette)]),
                marker=dict(size=7),
                hovertemplate="%{x}<br>总资产 %{y:,.2f}<extra>%{fullData.name}</extra>",
            )
        )

    fig.update_layout(
        height=460,
        hovermode="x unified",
        margin=dict(l=24, r=24, t=18, b=18),
        paper_bgcolor="#0f1728",
        plot_bgcolor="#0f1728",
        font=dict(color="#dbe5f5"),
        legend=dict(
            orientation="h",
            yanchor="bottom",
            y=1.02,
            xanchor="right",
            x=1,
            bgcolor="rgba(0,0,0,0)",
        ),
    )
    fig.update_xaxes(
        title_text="日期",
        type="category",
        showgrid=True,
        gridcolor="rgba(143,163,191,0.14)",
        tickfont=dict(size=12),
        showspikes=True,
        spikemode="across",
        spikecolor="#3a4d6d",
    )
    fig.update_yaxes(
        title_text="总资产",
        showgrid=True,
        gridcolor="rgba(143,163,191,0.14)",
        tickformat=",.0f",
        separatethousands=True,
        zeroline=False,
        showspikes=True,
        spikemode="across",
        spikecolor="#3a4d6d",
    )
    return fig


def build_detail_chart(curve_df: pd.DataFrame, selected_date: str | None) -> go.Figure:
    fig = go.Figure(
        data=[
            go.Scatter(
                x=curve_df["日期"].astype(str),
                y=curve_df["总资产"],
                mode="lines+markers",
                line=dict(width=3, color="#5da8ff"),
                marker=dict(size=7, color="#8fc0ff"),
                fill="tozeroy",
                fillcolor="rgba(93,168,255,0.10)",
                hovertemplate="%{x}<br>总资产 %{y:,.2f}<extra></extra>",
            )
        ]
    )
    if selected_date:
        selected = curve_df[curve_df["日期"].astype(str) == selected_date]
        if not selected.empty:
            selected_value = float(selected.iloc[0]["总资产"])
            fig.add_vline(x=selected_date, line_width=1, line_dash="dash", line_color="#f3b43f")
            fig.add_annotation(
                x=selected_date,
                y=selected_value,
                text=f"{selected_date}<br>{selected_value:,.0f}",
                showarrow=True,
                arrowhead=2,
                arrowcolor="#f3b43f",
                bgcolor="#111b2f",
                bordercolor="#2a3d5d",
                font=dict(color="#dbe5f5", size=12),
            )

    fig.update_layout(
        height=430,
        hovermode="x unified",
        margin=dict(l=24, r=24, t=14, b=18),
        paper_bgcolor="#0f1728",
        plot_bgcolor="#0f1728",
        font=dict(color="#dbe5f5"),
    )
    fig.update_xaxes(
        title_text="日期",
        type="category",
        showgrid=True,
        gridcolor="rgba(143,163,191,0.14)",
        showspikes=True,
        spikemode="across",
        spikecolor="#3a4d6d",
    )
    fig.update_yaxes(
        title_text="总资产",
        showgrid=True,
        gridcolor="rgba(143,163,191,0.14)",
        tickformat=",.0f",
        separatethousands=True,
        zeroline=False,
        showspikes=True,
        spikemode="across",
        spikecolor="#3a4d6d",
    )
    return fig


def render_dark_table(title: str, rows: list[dict[str, object]], empty_message: str) -> None:
    st.subheader(title)
    if not rows:
        st.info(empty_message)
        return

    headers = list(rows[0].keys())
    header_html = "".join(f"<th>{header}</th>" for header in headers)
    body_rows: list[str] = []
    for row in rows:
        cells = []
        for header in headers:
            raw_value = row[header]
            semantic = "pnl" if any(token in header for token in ("盈亏", "收益")) else "neutral"
            color = tone_for_value(raw_value, semantic=semantic)
            align = "right" if isinstance(raw_value, (int, float)) else "left"
            cells.append(
                f"<td style='color:{color};text-align:{align};'>{format_number(raw_value)}</td>"
            )
        body_rows.append("<tr>" + "".join(cells) + "</tr>")

    st.markdown(
        f"""
        <div class="section-card dark-table-card">
          <table class="dark-table">
            <thead><tr>{header_html}</tr></thead>
            <tbody>{''.join(body_rows)}</tbody>
          </table>
        </div>
        """,
        unsafe_allow_html=True,
    )


def render_source_panel(snapshot: dict) -> None:
    info = snapshot["source_info"]
    summary = snapshot["data_source_summary"]
    left, right = st.columns([2.2, 1.0])

    with left:
        st.subheader("策略净值与收益对比")
        curve_df = pd.DataFrame(snapshot["overview_curve"])
        if curve_df.empty:
            st.info("暂无总资产走势数据。")
        else:
            if curve_df["日期"].nunique() <= 1:
                st.caption("当前仅有 1 个交易日样本，曲线会在后续交易日累积后拉开。")
            st.plotly_chart(build_overview_chart(curve_df), use_container_width=True)

    with right:
        st.subheader("最新数据更新情况")
        cards = [
            ("更新时间", info["最新更新时间"]),
            ("数据状态", info["数据状态"]),
            ("数据库路径", info["数据库路径"]),
            ("数据库标的总数量", info["数据库标的总数量"]),
            ("数据库更新频率", info["数据库更新频率"]),
        ]
        for label, value in cards:
            st.markdown(
                f"""
                <div class="section-card side-info-card">
                  <div class="side-info-label">{label}</div>
                  <div class="side-info-value">{value}</div>
                </div>
                """,
                unsafe_allow_html=True,
            )
        st.caption(
            f"告警 {summary['告警数']} 次 | 降级 {summary['降级次数']} 次 | 跳过标的 {summary['跳过标的数']} 个"
        )


def render_overview_tables(snapshot: dict) -> None:
    left, right = st.columns([1.4, 1.0])
    with left:
        render_dark_table("持仓与交易总览", snapshot["overview_rows"], "暂无策略资产汇总。")
    with right:
        render_dark_table("执行流水", snapshot["latest_trade_execution_rows"], "暂无执行流水。")


def render_strategy_detail(strategy_code: str, strategy_data: dict) -> None:
    st.subheader(strategy_data["display_name"])
    cards = [
        ("当前总资产", format_money(strategy_data["current_total_asset"])),
        ("可用现金", format_money(strategy_data["cash"])),
        ("持仓市值", format_money(strategy_data["stock_value"])),
        ("本期交易笔数", strategy_data["month_trade_count"]),
    ]
    cols = st.columns(4)
    for col, (label, value) in zip(cols, cards):
        col.markdown(
            f"""
            <div class="metric-card detail-metric">
              <div class="metric-label">{label}</div>
              <div class="metric-value">{value}</div>
            </div>
            """,
            unsafe_allow_html=True,
        )

    left, right = st.columns([1.9, 0.9])
    selected_date = strategy_data["curve"][-1]["日期"] if strategy_data["curve"] else None

    with left:
        st.subheader("总资产走势")
        st.caption("点击曲线日期点，切换下方当日操作记录和信号说明。")
        curve_df = pd.DataFrame(strategy_data["curve"])
        if curve_df.empty:
            st.info("暂无总资产走势数据。")
        else:
            if curve_df["日期"].nunique() <= 1:
                st.caption("当前仅有 1 个交易日样本，建议继续累积交易日后观察趋势。")
            event = st.plotly_chart(
                build_detail_chart(curve_df, selected_date),
                use_container_width=True,
                key=f"curve_{strategy_code}",
                on_select="rerun",
                selection_mode="points",
            )
            selection = event.selection if event else {}
            points = selection.get("points", []) if isinstance(selection, dict) else []
            if points:
                point_index = points[0].get("point_index")
                if point_index is not None and point_index < len(curve_df):
                    selected_date = str(curve_df.iloc[point_index]["日期"])
            st.caption(f"当前联动日期：{selected_date or '-'}")

    with right:
        st.subheader("策略情报")
        info_cards = [
            ("调仓规则", strategy_data["rule_text"]),
            ("信号状态", strategy_data["signal_status"]),
            ("数据质量", strategy_data["data_status"]),
            ("基准", strategy_data["benchmark"]),
        ]
        for label, value in info_cards:
            st.markdown(
                f"""
                <div class="section-card side-info-card">
                  <div class="side-info-label">{label}</div>
                  <div class="side-info-value" style="line-height:1.7;">{value}</div>
                </div>
                """,
                unsafe_allow_html=True,
            )

    bottom_left, bottom_right = st.columns([1.1, 1.4])
    with bottom_left:
        render_dark_table("持仓明细", strategy_data["positions"], "当前无持仓，可在下一交易日或新信号出现后查看。")
    with bottom_right:
        records = strategy_data["records"]
        if not records:
            render_dark_table("操作记录 / 信号说明", [], "当前无交易记录也无信号说明。")
        else:
            filtered = [item for item in records if item["日期"] == selected_date] if selected_date else records[:20]
            if selected_date and not filtered:
                render_dark_table(
                    "操作记录 / 信号说明",
                    [],
                    f"{selected_date} 当天没有交易记录或信号说明。",
                )
            else:
                render_dark_table("操作记录 / 信号说明", filtered, "暂无记录。")


st.markdown(
    """
    <style>
    .stApp {
      background:
        radial-gradient(circle at top right, rgba(72, 99, 160, 0.16), transparent 28%),
        linear-gradient(180deg, #0b1220 0%, #0e1627 100%);
      color: #dbe5f5;
    }
    [data-testid="stHeader"] {
      background: transparent;
    }
    [data-testid="stToolbar"] {
      visibility: hidden;
      height: 0;
      position: fixed;
    }
    .block-container {
      padding-top: 2rem;
    }
    [data-testid="stSidebar"] {
      background: #101928;
      border-right: 1px solid #22324f;
    }
    [data-baseweb="select"] > div {
      background: #101828 !important;
      border: 1px solid #22324f !important;
      border-radius: 12px !important;
    }
    .metric-card {
      background: linear-gradient(180deg, rgba(17,27,47,0.98), rgba(15,24,40,0.98));
      border: 1px solid #22324f;
      border-radius: 16px;
      padding: 16px 18px;
      min-height: 92px;
      box-shadow: inset 0 1px 0 rgba(255,255,255,0.03);
    }
    .detail-metric {
      min-height: 84px;
    }
    .metric-label {
      color: #8fa3bf;
      font-size: 13px;
      margin-bottom: 8px;
    }
    .metric-value {
      color: #f3f7ff;
      font-size: 24px;
      font-weight: 700;
      letter-spacing: 0.2px;
    }
    .section-card {
      background: #101828;
      border: 1px solid #22324f;
      border-radius: 16px;
      padding: 14px 16px;
      box-shadow: inset 0 1px 0 rgba(255,255,255,0.02);
    }
    .side-info-card {
      margin-bottom: 12px;
    }
    .side-info-label {
      color: #8fa3bf;
      font-size: 13px;
      margin-bottom: 8px;
    }
    .side-info-value {
      color: #dbe5f5;
      font-size: 16px;
      font-weight: 600;
      word-break: break-word;
    }
    .sidebar-snapshot {
      background: #101828;
      border: 1px solid #22324f;
      border-radius: 12px;
      padding: 10px 12px;
      margin-bottom: 10px;
    }
    .sidebar-snapshot-title {
      color: #dbe5f5;
      font-weight: 600;
      margin-bottom: 4px;
    }
    .sidebar-snapshot-sub {
      color: #8fa3bf;
      font-size: 12px;
      line-height: 1.5;
    }
    .stPlotlyChart {
      border: 1px solid #22324f;
      border-radius: 16px;
      background: #101828;
      padding: 6px;
    }
    .dark-table-card {
      padding: 0;
      overflow: hidden;
    }
    .dark-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 13px;
    }
    .dark-table thead th {
      text-align: left;
      color: #8fa3bf;
      font-weight: 600;
      padding: 12px 14px;
      border-bottom: 1px solid #22324f;
      background: #0f1728;
      white-space: nowrap;
    }
    .dark-table tbody td {
      padding: 12px 14px;
      border-bottom: 1px solid rgba(35,50,79,0.45);
      color: #dbe5f5;
      white-space: nowrap;
    }
    .dark-table tbody tr:nth-child(odd) {
      background: #121c31;
    }
    .dark-table tbody tr:nth-child(even) {
      background: #101828;
    }
    .dark-table tbody tr:hover {
      background: #16233b;
    }
    @media (max-width: 1100px) {
      .metric-value {
        font-size: 20px;
      }
      .dark-table {
        font-size: 12px;
      }
    }
    </style>
    """,
    unsafe_allow_html=True,
)

st.title("策略监控面板")
db_path = st.sidebar.text_input("数据库路径", value="data/portfolio.db")
snapshot = load_snapshot(db_path)
selected_page = render_sidebar(snapshot)

if selected_page == "总览驾驶舱":
    render_metric_band(snapshot)
    render_source_panel(snapshot)
    render_overview_tables(snapshot)
    with st.expander("查看数据源事件", expanded=False):
        render_dark_table("数据源事件", snapshot["data_source_events"], "最近没有数据源事件。")
else:
    page_lookup = {page["display_name"]: code for code, page in snapshot["strategy_pages"].items()}
    render_strategy_detail(page_lookup[selected_page], snapshot["strategy_pages"][page_lookup[selected_page]])
