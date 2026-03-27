from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = ROOT / "design_previews"
OUT_DIR.mkdir(parents=True, exist_ok=True)

BG = "#0b1220"
SURFACE = "#121b2f"
SURFACE_ALT = "#0f1728"
CARD = "#17233a"
BORDER = "#2a3a58"
TEXT = "#dbe5f5"
MUTED = "#8fa3bf"
RED = "#ff5b6e"
GREEN = "#23c483"
AMBER = "#f3b43f"
BLUE = "#4b8dff"
CYAN = "#39c6d6"
PURPLE = "#b975ff"


def font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    candidates = [
        "C:/Windows/Fonts/msyhbd.ttc" if bold else "C:/Windows/Fonts/msyh.ttc",
        "C:/Windows/Fonts/simhei.ttf",
        "C:/Windows/Fonts/arialbd.ttf" if bold else "C:/Windows/Fonts/arial.ttf",
    ]
    for candidate in candidates:
        if Path(candidate).exists():
            return ImageFont.truetype(candidate, size=size)
    return ImageFont.load_default()


def rounded(draw: ImageDraw.ImageDraw, xy, fill, outline=None, radius=18, width=1):
    draw.rounded_rectangle(xy, radius=radius, fill=fill, outline=outline, width=width)


def text(draw: ImageDraw.ImageDraw, x: int, y: int, value: str, size: int = 20, color: str = TEXT, bold: bool = False):
    draw.text((x, y), value, font=font(size, bold=bold), fill=color)


def metric_card(draw: ImageDraw.ImageDraw, x: int, y: int, w: int, h: int, title: str, value: str, delta: str, color: str):
    rounded(draw, (x, y, x + w, y + h), fill=CARD, outline=BORDER, radius=20, width=2)
    text(draw, x + 24, y + 18, title, size=18, color=MUTED)
    text(draw, x + 24, y + 58, value, size=32, bold=True)
    text(draw, x + w - 126, y + 64, delta, size=18, color=color, bold=True)


def draw_sidebar(draw: ImageDraw.ImageDraw, active: str):
    rounded(draw, (24, 24, 276, 1512), fill=SURFACE, outline=BORDER, radius=24, width=2)
    text(draw, 48, 52, "策略工作台", size=34, bold=True)
    text(draw, 48, 96, "Tonghuashun 风格交易监控预览", size=18, color=MUTED)

    items = ["总览驾驶舱", "量化动量", "红利低波", "全球配置", "高成长", "永久组合"]
    y = 168
    for item in items:
        is_active = item == active
        rounded(draw, (40, y, 260, y + 74), fill="#23314f" if is_active else SURFACE_ALT, outline=BORDER, radius=18, width=2)
        text(draw, 64, y + 22, item, size=22, color=TEXT if is_active else "#b9c7dd", bold=is_active)
        y += 92

    text(draw, 48, 760, "数据状态", size=22, color=MUTED, bold=True)
    cards = [
        ("实时源", "Instock + AkShare"),
        ("降级模式", "2 次"),
        ("跳过标的", "3 只"),
        ("上海时间", "2026-03-27 15:42:10"),
    ]
    for index, (title, value) in enumerate(cards):
        top = 804 + index * 108
        rounded(draw, (40, top, 260, top + 88), fill=SURFACE_ALT, outline=BORDER, radius=18, width=2)
        text(draw, 58, top + 18, title, size=18, color=MUTED)
        text(draw, 58, top + 46, value, size=20, bold=True)


def draw_chart_grid(draw: ImageDraw.ImageDraw, left: int, top: int, right: int, bottom: int, rows: int, cols: int):
    rounded(draw, (left, top, right, bottom), fill="#0d1526", outline="#223250", radius=20, width=2)
    for i in range(rows + 1):
        y = top + 24 + i * ((bottom - top - 48) / rows)
        draw.line((left + 28, int(y), right - 28, int(y)), fill="#223250", width=1)
    for i in range(cols + 1):
        x = left + 56 + i * ((right - left - 112) / cols)
        draw.line((int(x), top + 20, int(x), bottom - 20), fill="#1c2941", width=1)


def draw_overview():
    image = Image.new("RGB", (2560, 1536), BG)
    draw = ImageDraw.Draw(image)

    draw_sidebar(draw, "总览驾驶舱")

    rounded(draw, (304, 24, 2536, 110), fill=SURFACE, outline=BORDER, radius=24, width=2)
    text(draw, 340, 48, "量化策略总览交易台", size=36, bold=True)
    text(draw, 340, 88, "总资产对比 / 数据更新状态 / 策略汇总 / 最近交易日买卖统计", size=18, color=MUTED)
    text(draw, 1885, 44, "交易日 2026-03-27", size=20, color=MUTED)
    text(draw, 1885, 76, "Provider: AKShare 降级运行", size=22, color=AMBER, bold=True)
    text(draw, 2260, 58, "沪", size=34, color=RED, bold=True)
    text(draw, 2306, 58, "深", size=34, color=GREEN, bold=True)

    metric_card(draw, 304, 132, 420, 126, "总资产", "998,462", "+1.82%", RED)
    metric_card(draw, 744, 132, 420, 126, "总现金", "407,013", "-0.35%", GREEN)
    metric_card(draw, 1184, 132, 420, 126, "今日成交", "18 笔", "+6 笔", AMBER)
    metric_card(draw, 1624, 132, 420, 126, "执行策略", "5 / 5", "全部完成", CYAN)
    metric_card(draw, 2064, 132, 472, 126, "数据告警", "3 项", "可降级运行", AMBER)

    rounded(draw, (304, 286, 1644, 876), fill=SURFACE, outline=BORDER, radius=24, width=2)
    text(draw, 334, 314, "策略总资产与收益对比", size=28, bold=True)
    text(draw, 334, 348, "图表补齐横纵坐标、网格线和关键刻度，保证比较时可读性", size=18, color=MUTED)
    draw_chart_grid(draw, 356, 396, 1600, 836, rows=6, cols=8)
    text(draw, 1450, 420, "量化动量", size=18, color=BLUE)
    text(draw, 1450, 454, "红利低波", size=18, color=RED)
    text(draw, 1450, 488, "全球配置", size=18, color=CYAN)
    text(draw, 1450, 522, "高成长", size=18, color=AMBER)
    text(draw, 1450, 556, "永久组合", size=18, color=PURPLE)

    line_sets = [
        ([(420, 760), (560, 722), (700, 692), (840, 668), (980, 624), (1120, 600), (1260, 566), (1400, 522)], BLUE),
        ([(420, 786), (560, 770), (700, 750), (840, 738), (980, 712), (1120, 700), (1260, 676), (1400, 658)], RED),
        ([(420, 806), (560, 804), (700, 798), (840, 790), (980, 782), (1120, 774), (1260, 768), (1400, 760)], CYAN),
        ([(420, 822), (560, 820), (700, 816), (840, 810), (980, 804), (1120, 798), (1260, 794), (1400, 790)], AMBER),
        ([(420, 838), (560, 840), (700, 836), (840, 830), (980, 826), (1120, 820), (1260, 816), (1400, 812)], PURPLE),
    ]
    for points, color in line_sets:
        draw.line(points, fill=color, width=5)
        for px, py in points:
            draw.ellipse((px - 4, py - 4, px + 4, py + 4), fill=color)

    y_axis = [("100.2万", 420), ("100.0万", 486), ("99.8万", 552), ("99.6万", 618), ("99.4万", 684), ("99.2万", 750), ("99.0万", 816)]
    for label_value, y in y_axis:
        text(draw, 290, y - 10, label_value, size=16, color=MUTED)
    x_labels = ["03-18", "03-19", "03-20", "03-21", "03-24", "03-25", "03-26", "03-27"]
    for i, label_value in enumerate(x_labels):
        text(draw, 412 + i * 140, 844, label_value, size=16, color=MUTED)

    rounded(draw, (1672, 286, 2536, 876), fill=SURFACE, outline=BORDER, radius=24, width=2)
    text(draw, 1702, 314, "数据更新信息栏", size=28, bold=True)
    info_cards = [
        ("最新数据更新情况", "2026-03-27 15:35:22 / 部分接口降级为缓存", AMBER),
        ("数据库路径", "D:/code/Stock/data/portfolio.db", TEXT),
        ("数据库标的总数量", "A股 5827 / ETF 214 / 指数 18", TEXT),
        ("数据库更新频率", "日更 1 次 + 盘后补录 1 次", TEXT),
    ]
    top = 372
    for title, value, color in info_cards:
        rounded(draw, (1700, top, 2508, top + 94), fill=SURFACE_ALT, outline=BORDER, radius=18, width=2)
        text(draw, 1724, top + 16, title, size=20, color=MUTED)
        text(draw, 1724, top + 48, value, size=20, color=color, bold=True)
        top += 118

    rounded(draw, (304, 902, 2536, 1512), fill=SURFACE, outline=BORDER, radius=24, width=2)
    text(draw, 334, 930, "策略资产汇总与最近交易日执行统计", size=28, bold=True)
    text(draw, 334, 964, "总览页不展示个股持仓，只看策略级聚合指标与最近一个交易日买卖笔数", size=18, color=MUTED)
    rounded(draw, (334, 1012, 1520, 1472), fill=SURFACE_ALT, outline=BORDER, radius=20, width=2)
    rounded(draw, (1544, 1012, 2508, 1472), fill=SURFACE_ALT, outline=BORDER, radius=20, width=2)
    text(draw, 362, 1038, "策略资产汇总", size=24, bold=True)
    text(draw, 1572, 1038, "最近一个交易日买卖统计", size=24, bold=True)

    summary_cols = ["策略", "总资产", "总市值", "浮动盈亏", "当日参考盈亏", "持仓比例"]
    summary_x = [362, 560, 760, 972, 1176, 1370]
    for x, col in zip(summary_x, summary_cols):
        text(draw, x, 1088, col, size=18, color=MUTED, bold=True)
    summary_rows = [
        ("量化动量", "200,000", "0", "0", "0", "0%"),
        ("红利低波", "200,000", "0", "0", "0", "0%"),
        ("全球配置", "199,973", "194,542", "+1,684", "+352", "97.3%"),
        ("高成长", "200,000", "0", "0", "0", "0%"),
        ("永久组合", "199,115", "196,533", "-884", "+418", "98.7%"),
    ]
    for row_index, row in enumerate(summary_rows):
        y = 1144 + row_index * 58
        if row_index % 2 == 0:
            rounded(draw, (350, y - 8, 1504, y + 38), fill="#132038", radius=8)
        for x, cell in zip(summary_x, row):
            color = RED if str(cell).startswith("+") else GREEN if str(cell).startswith("-") else TEXT
            text(draw, x, y, str(cell), size=18, color=color, bold=(x == 362))

    trade_cols = ["策略", "交易日", "买入笔数", "卖出笔数", "说明"]
    trade_x = [1572, 1754, 1940, 2104, 2250]
    for x, col in zip(trade_x, trade_cols):
        text(draw, x, 1088, col, size=18, color=MUTED, bold=True)
    trade_rows = [
        ("量化动量", "2026-03-27", "0", "0", "无触发"),
        ("红利低波", "2026-03-27", "0", "0", "无触发"),
        ("全球配置", "2026-03-27", "5", "0", "资产再平衡"),
        ("高成长", "2026-03-27", "0", "0", "无触发"),
        ("永久组合", "2026-03-27", "3", "0", "动态配置"),
    ]
    for row_index, row in enumerate(trade_rows):
        y = 1144 + row_index * 58
        if row_index % 2 == 0:
            rounded(draw, (1560, y - 8, 2492, y + 38), fill="#132038", radius=8)
        for x, cell in zip(trade_x, row):
            color = RED if x == 1940 and cell != "0" else GREEN if x == 2104 and cell != "0" else TEXT
            text(draw, x, y, cell, size=18, color=color, bold=(x == 1572))

    image.save(OUT_DIR / "dashboard_overview_preview.png")


def draw_detail():
    image = Image.new("RGB", (2560, 1536), BG)
    draw = ImageDraw.Draw(image)

    draw_sidebar(draw, "永久组合")

    rounded(draw, (304, 24, 2536, 110), fill=SURFACE, outline=BORDER, radius=24, width=2)
    text(draw, 340, 48, "单策略详情页 · 中国版永久组合", size=36, bold=True)
    text(draw, 340, 88, "总资产走势 / 持仓明细 / 操作记录 / 信号说明 / 调仓规则", size=18, color=MUTED)
    text(draw, 2010, 44, "基准 000001.SH", size=20, color=MUTED)
    text(draw, 2228, 44, "动态仓位 100%", size=24, color=CYAN, bold=True)

    metric_card(draw, 304, 132, 352, 120, "当前总资产", "199,115", "-0.44%", GREEN)
    metric_card(draw, 676, 132, 352, 120, "可用现金", "2,582", "1.3%", AMBER)
    metric_card(draw, 1048, 132, 352, 120, "持仓市值", "196,533", "+0.9%", RED)
    metric_card(draw, 1420, 132, 352, 120, "本月交易", "3 笔", "2 买 1 卖", CYAN)
    metric_card(draw, 1792, 132, 352, 120, "信号状态", "已执行", "无待处理", AMBER)
    metric_card(draw, 2164, 132, 372, 120, "数据质量", "降级", "3 只跳过", AMBER)

    rounded(draw, (304, 280, 1588, 930), fill=SURFACE, outline=BORDER, radius=24, width=2)
    text(draw, 334, 308, "总资产走势", size=28, bold=True)
    text(draw, 334, 344, "鼠标移动到曲线日期点时，右下角切换对应日期的操作记录与信号说明", size=18, color=MUTED)
    draw_chart_grid(draw, 336, 390, 1560, 896, rows=7, cols=8)
    asset_points = [(396, 796), (522, 760), (648, 732), (774, 704), (900, 720), (1026, 670), (1152, 646), (1278, 612), (1404, 564)]
    draw.line(asset_points, fill=CYAN, width=5)
    for px, py in asset_points:
        draw.ellipse((px - 5, py - 5, px + 5, py + 5), fill=CYAN)
    text(draw, 1360, 408, "总资产 199,115", size=22, color=RED, bold=True)
    detail_y_axis = [("200.2k", 416), ("200.0k", 482), ("199.8k", 548), ("199.6k", 614), ("199.4k", 680), ("199.2k", 746), ("199.0k", 812)]
    for label_value, y in detail_y_axis:
        text(draw, 300, y, label_value, size=16, color=MUTED)
    detail_x_labels = ["03-18", "03-19", "03-20", "03-21", "03-24", "03-25", "03-26", "03-27"]
    for i, label_value in enumerate(detail_x_labels):
        text(draw, 392 + i * 136, 902, label_value, size=16, color=MUTED)

    rounded(draw, (1614, 280, 2536, 930), fill=SURFACE, outline=BORDER, radius=24, width=2)
    text(draw, 1644, 308, "策略情报", size=28, bold=True)
    rounded(draw, (1640, 368, 2508, 570), fill=SURFACE_ALT, outline=BORDER, radius=18, width=2)
    text(draw, 1664, 394, "调仓规则", size=20, color=MUTED)
    text(draw, 1664, 432, "每日可调仓，遵循交易日规则与 A 股 T+1。", size=22, bold=True)
    text(draw, 1664, 474, "指数 < 3900 时满仓：银行 50% / 黄金 25% / 金属 25%", size=20)
    text(draw, 1664, 512, "指数抬升后按公式逐步降低总仓位。", size=20)

    rounded(draw, (304, 956, 1260, 1512), fill=SURFACE, outline=BORDER, radius=24, width=2)
    rounded(draw, (1286, 956, 2536, 1512), fill=SURFACE, outline=BORDER, radius=24, width=2)
    text(draw, 334, 984, "持仓明细", size=28, bold=True)
    text(draw, 1316, 984, "操作记录 / 信号说明（随曲线日期切换）", size=28, bold=True)

    hold_cols = ["代码", "名称", "持仓股数", "仓位", "成本", "持股天数", "浮盈亏"]
    hold_x = [336, 472, 636, 792, 944, 1084, 1180]
    for x, col in zip(hold_x, hold_cols):
        text(draw, x, 1038, col, size=18, color=MUTED, bold=True)
    hold_rows = [
        ("601009", "南京银行", "8,400", "51.2%", "11.80", "6 天", "+2.88%"),
        ("600547", "山东黄金", "3,200", "24.9%", "26.00", "6 天", "+3.38%"),
        ("601899", "紫金矿业", "4,100", "22.6%", "18.10", "6 天", "-2.65%"),
    ]
    for row_index, row in enumerate(hold_rows):
        y = 1098 + row_index * 72
        rounded(draw, (332, y - 10, 1232, y + 42), fill="#132038", radius=10)
        for x, cell in zip(hold_x, row):
            color = RED if str(cell).startswith("+") else GREEN if str(cell).startswith("-") else TEXT
            text(draw, x, y, cell, size=20, color=color, bold=(x == 336))

    rec_cols = ["时间", "动作", "代码", "数量", "价格", "说明"]
    rec_x = [1316, 1468, 1620, 1768, 1928, 2110]
    for x, col in zip(rec_x, rec_cols):
        text(draw, x, 1038, col, size=18, color=MUTED, bold=True)
    rec_rows = [
        ("03-27", "买入", "601009", "8,400", "11.80", "银行仓位补足"),
        ("03-27", "买入", "600547", "3,200", "26.00", "黄金仓位补足"),
        ("03-27", "买入", "601899", "4,100", "18.10", "金属仓位补足"),
        ("03-27", "信号", "000001.SH", "-", "3125", "指数位于满仓区间"),
    ]
    for row_index, row in enumerate(rec_rows):
        y = 1098 + row_index * 72
        rounded(draw, (1310, y - 10, 2508, y + 42), fill="#132038", radius=10)
        for x, cell in zip(rec_x, row):
            color = RED if cell == "买入" else CYAN if cell == "信号" else TEXT
            text(draw, x, y, cell, size=20, color=color, bold=(cell in {"买入", "卖出", "信号"}))

    image.save(OUT_DIR / "dashboard_strategy_detail_preview.png")


if __name__ == "__main__":
    draw_overview()
    draw_detail()
    print(OUT_DIR / "dashboard_overview_preview.png")
    print(OUT_DIR / "dashboard_strategy_detail_preview.png")
