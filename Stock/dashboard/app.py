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


def metric_delta_color(label: str) -> str:
    neutral_labels = {"总现金", "今日成交", "执行策略", "策略数量", "最近运行数据源", "最近交易日", "本期交易笔数", "信号状态", "数据质量", "基准"}
    return "off" if label in neutral_labels else "normal"


def render_metric_cards(snapshot: dict) -> None:
    cols = st.columns(5)
    cols[0].metric("策略数量", snapshot["strategy_count"], delta_color=metric_delta_color("策略数量"))
    cols[1].metric("总现金", format_money(snapshot["total_cash"]), delta_color=metric_delta_color("总现金"))
    cols[2].metric("总市值", format_money(snapshot["total_stock_value"]))
    cols[3].metric("最近运行数据源", snapshot["latest_run_provider"], delta_color=metric_delta_color("最近运行数据源"))
    cols[4].metric("最近交易日", snapshot["latest_run_date"], delta_color=metric_delta_color("最近交易日"))


def render_sidebar(snapshot: dict) -> str:
    navigation = ["总览驾驶舱"] + [page["display_name"] for page in snapshot["strategy_pages"].values()]
    selected_page = st.sidebar.radio("页面", navigation, index=0)
    st.sidebar.markdown("### 策略快照")
    for page in snapshot["strategy_pages"].values():
        st.sidebar.markdown(
            f"""
            <div style="background:#101828;border:1px solid #23324f;border-radius:12px;padding:10px 12px;margin-bottom:10px;">
              <div style="color:#dbe5f5;font-weight:600;">{page['display_name']}</div>
              <div style="color:#8fa3bf;font-size:12px;margin-top:4px;">总资产 {page['current_total_asset']:,.0f} / 持仓 {len(page['positions'])} / 交易 {page['month_trade_count']}</div>
            </div>
            """,
            unsafe_allow_html=True,
        )
    return selected_page


def build_overview_chart(curve_df: pd.DataFrame) -> go.Figure:
    fig = go.Figure()
    for strategy_name, group in curve_df.groupby("策略"):
        fig.add_trace(
            go.Scatter(
                x=group["日期"],
                y=group["总资产"],
                mode="lines+markers",
                name=strategy_name,
                hovertemplate="%{x}<br>总资产 %{y:,.2f}<extra>%{fullData.name}</extra>",
            )
        )
    fig.update_layout(
        height=430,
        hovermode="x unified",
        margin=dict(l=24, r=24, t=24, b=24),
        xaxis=dict(title="日期", showgrid=True, gridcolor="rgba(140,160,190,0.12)"),
        yaxis=dict(title="总资产", showgrid=True, gridcolor="rgba(140,160,190,0.12)", tickformat=",.0f"),
        legend=dict(orientation="v", yanchor="top", y=1, xanchor="right", x=1),
    )
    return fig


def render_source_info(snapshot: dict) -> None:
    info = snapshot["source_info"]
    summary = snapshot["data_source_summary"]
    col1, col2 = st.columns([2.2, 1.2])
    with col1:
        st.subheader("策略总资产与收益对比")
        curve_df = pd.DataFrame(snapshot["overview_curve"])
        if curve_df.empty:
            st.info("暂无总资产走势数据。")
        else:
            st.plotly_chart(build_overview_chart(curve_df), use_container_width=True)
    with col2:
        st.subheader("数据更新信息栏")
        card_pairs = [
            ("最新更新时间", info["最新更新时间"]),
            ("数据状态", info["数据状态"]),
            ("数据库路径", info["数据库路径"]),
            ("数据库标的总数量", info["数据库标的总数量"]),
            ("数据库更新频率", info["数据库更新频率"]),
        ]
        for title, value in card_pairs:
            st.markdown(
                f"""
                <div style="background:#101828;border:1px solid #23324f;border-radius:14px;padding:14px 16px;margin-bottom:12px;">
                  <div style="color:#8fa3bf;font-size:13px;">{title}</div>
                  <div style="color:#dbe5f5;font-size:16px;font-weight:600;margin-top:6px;">{value}</div>
                </div>
                """,
                unsafe_allow_html=True,
            )
        st.caption(
            f"告警数：{summary['告警数']} | 降级次数：{summary['降级次数']} | 跳过标的数：{summary['跳过标的数']}"
        )


def render_overview_tables(snapshot: dict) -> None:
    left, right = st.columns([1.35, 1.0])
    with left:
        st.subheader("策略资产汇总")
        st.dataframe(pd.DataFrame(snapshot["overview_rows"]), use_container_width=True, hide_index=True)
    with right:
        st.subheader("最近一个交易日买卖统计")
        st.dataframe(pd.DataFrame(snapshot["latest_trade_execution_rows"]), use_container_width=True, hide_index=True)


def build_detail_chart(curve_df: pd.DataFrame, selected_date: str | None) -> go.Figure:
    fig = go.Figure(
        data=[
            go.Scatter(
                x=curve_df["日期"],
                y=curve_df["总资产"],
                mode="lines+markers",
                line=dict(width=3),
                marker=dict(size=7),
                hovertemplate="%{x}<br>总资产 %{y:,.2f}<extra></extra>",
            )
        ]
    )
    if selected_date:
        fig.add_vline(x=selected_date, line_width=1, line_dash="dash", line_color="#f3b43f")
        matching = curve_df[curve_df["日期"] == selected_date]
        if not matching.empty:
            fig.add_annotation(
                x=selected_date,
                y=float(matching.iloc[0]["总资产"]),
                text=selected_date,
                showarrow=True,
                arrowhead=2,
                bgcolor="#101828",
                bordercolor="#23324f",
                font=dict(color="#dbe5f5"),
            )
    fig.update_layout(
        height=420,
        hovermode="x unified",
        margin=dict(l=24, r=24, t=20, b=20),
        xaxis=dict(title="日期", showgrid=True, gridcolor="rgba(140,160,190,0.12)"),
        yaxis=dict(title="总资产", showgrid=True, gridcolor="rgba(140,160,190,0.12)", tickformat=",.0f"),
    )
    return fig


def render_detail_page(strategy_code: str, strategy_data: dict) -> None:
    header_cols = st.columns(4)
    header_cols[0].metric("当前总资产", format_money(strategy_data["current_total_asset"]))
    header_cols[1].metric("可用现金", format_money(strategy_data["cash"]), delta_color="off")
    header_cols[2].metric("持仓市值", format_money(strategy_data["stock_value"]))
    header_cols[3].metric("本期交易笔数", strategy_data["month_trade_count"], delta_color="off")

    left, right = st.columns([1.8, 1.0])
    selected_date = None
    with left:
        st.subheader("总资产走势")
        st.caption("点击日期点切换右下方的操作记录与信号说明。")
        curve_df = pd.DataFrame(strategy_data["curve"])
        if curve_df.empty:
            st.info("暂无总资产走势数据。")
        else:
            selected_date = strategy_data["curve"][-1]["日期"] if strategy_data["curve"] else None
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
        st.markdown(
            f"""
            <div style="background:#101828;border:1px solid #23324f;border-radius:14px;padding:16px;margin-bottom:12px;">
              <div style="color:#8fa3bf;font-size:13px;">调仓规则</div>
              <div style="color:#dbe5f5;font-size:16px;font-weight:600;margin-top:8px;line-height:1.7;">{strategy_data['rule_text']}</div>
            </div>
            <div style="background:#101828;border:1px solid #23324f;border-radius:14px;padding:16px;margin-bottom:12px;">
              <div style="color:#8fa3bf;font-size:13px;">信号状态</div>
              <div style="color:#dbe5f5;font-size:16px;font-weight:600;margin-top:8px;">{strategy_data['signal_status']}</div>
            </div>
            <div style="background:#101828;border:1px solid #23324f;border-radius:14px;padding:16px;">
              <div style="color:#8fa3bf;font-size:13px;">数据质量</div>
              <div style="color:#dbe5f5;font-size:16px;font-weight:600;margin-top:8px;">{strategy_data['data_status']}</div>
            </div>
            """,
            unsafe_allow_html=True,
        )

    bottom_left, bottom_right = st.columns([1.15, 1.35])
    with bottom_left:
        st.subheader("持仓明细")
        position_df = pd.DataFrame(strategy_data["positions"])
        if position_df.empty:
            st.info("当前无持仓，可在下一交易日或新信号出现后查看。")
        else:
            st.dataframe(position_df, use_container_width=True, hide_index=True)
    with bottom_right:
        st.subheader("操作记录 / 信号说明")
        records_df = pd.DataFrame(strategy_data["records"])
        if records_df.empty:
            st.info("当前无交易记录也无信号说明。")
        else:
            if selected_date:
                filtered = records_df[records_df["日期"] == selected_date]
                if filtered.empty:
                    st.info(f"{selected_date} 当天没有交易记录或信号说明。")
                else:
                    st.dataframe(filtered, use_container_width=True, hide_index=True)
            else:
                st.dataframe(records_df.head(20), use_container_width=True, hide_index=True)


st.markdown(
    """
    <style>
    .stApp {
      background: linear-gradient(180deg, #0b1220 0%, #0d1628 100%);
      color: #dbe5f5;
    }
    [data-testid="stSidebar"] {
      background: #111b2f;
      border-right: 1px solid #22324f;
    }
    [data-testid="stMetricValue"] {
      color: #f3f7ff;
    }
    .stDataFrame, .stPlotlyChart {
      border: 1px solid #22324f;
      border-radius: 14px;
      background: #101828;
    }
    </style>
    """,
    unsafe_allow_html=True,
)

st.title("策略监控面板")
db_path = st.sidebar.text_input("数据库路径", value="data/portfolio.db")
snapshot = load_snapshot(db_path)
selected_page = render_sidebar(snapshot)
render_metric_cards(snapshot)

if selected_page == "总览驾驶舱":
    render_source_info(snapshot)
    render_overview_tables(snapshot)
    with st.expander("查看数据源事件", expanded=False):
        event_df = pd.DataFrame(snapshot["data_source_events"])
        if event_df.empty:
            st.info("最近没有数据源事件。")
        else:
            st.dataframe(event_df, use_container_width=True, hide_index=True)
else:
    page_lookup = {page["display_name"]: code for code, page in snapshot["strategy_pages"].items()}
    render_detail_page(page_lookup[selected_page], snapshot["strategy_pages"][page_lookup[selected_page]])
