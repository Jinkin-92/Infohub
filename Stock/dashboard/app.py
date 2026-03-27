"""
Streamlit dashboard backed by SQLite.
"""

from __future__ import annotations

from pathlib import Path

import pandas as pd
import plotly.express as px
import streamlit as st

from dashboard.monitor import build_dashboard_snapshot


st.set_page_config(page_title="策略监控面板", page_icon="📈", layout="wide")
st.title("策略监控面板")

db_path = st.sidebar.text_input("数据库路径", value="data/portfolio.db")
snapshot = build_dashboard_snapshot(Path(db_path))

strategy_df = pd.DataFrame(snapshot["strategies"])
nav_df = pd.DataFrame(snapshot["nav_compare"])
position_df = pd.DataFrame(snapshot["positions"])
transaction_df = pd.DataFrame(snapshot["transactions"])
signal_df = pd.DataFrame(snapshot["signals"])

col1, col2, col3 = st.columns(3)
col1.metric("策略数量", snapshot["strategy_count"])
col2.metric("总现金", f"{snapshot['total_cash']:.2f}")
col3.metric("总持仓市值", f"{snapshot['total_stock_value']:.2f}")

st.subheader("五策略总览")
st.dataframe(strategy_df, use_container_width=True, hide_index=True)

if not nav_df.empty:
    st.subheader("净值与收益率对比")
    tabs = st.tabs(["总资产", "累计收益率"])
    with tabs[0]:
        total_nav_chart = px.line(nav_df, x="日期", y="总资产", color="策略名称", markers=True)
        st.plotly_chart(total_nav_chart, use_container_width=True)
    with tabs[1]:
        return_chart = px.line(nav_df, x="日期", y="累计收益率(%)", color="策略名称", markers=True)
        st.plotly_chart(return_chart, use_container_width=True)

left, right = st.columns(2)
with left:
    st.subheader("持仓明细")
    st.dataframe(position_df, use_container_width=True, hide_index=True)
with right:
    st.subheader("交易记录")
    st.dataframe(transaction_df.head(50), use_container_width=True, hide_index=True)

st.subheader("信号记录")
st.dataframe(signal_df.head(50), use_container_width=True, hide_index=True)
