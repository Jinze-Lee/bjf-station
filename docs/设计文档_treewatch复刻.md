# 设计文档：TreeWatch 风格 "Tree data" 交互数据展示区

- 日期：2026-07-27
- 目录：`E:\网页制作\`（独立项目，与 `E:\叶片分析项目\` 平行，无依赖关系）
- 参考站点：https://treewatch.net/thunen-institute-forest-ecoystems/

## 1. 目标

复刻 TreeWatch.net 站点 "Tree data" 区块的**风格、格式、交互与功能**，先用一组合成示例数据驱动。
本阶段**只做核心数据展示区**，不做导航栏、页脚、地图。

## 2. 逆向工程结论（来自参考站点 HTML 源码实测）

参考站点使用 **Highcharts Stock（highstock.js）**，配置要点：

| 项 | 值 |
|---|---|
| 容器 | `<div id="chartDIASF" style="height:450px;min-width:310px">` |
| chart | `backgroundColor:'#202020'`, `plotBorderColor:'#202020'`, `zoomType:'x'` |
| 序列 1 | `name:'Sap flow'`, `type:'area'`, `color:'#1584ec'`, `yAxis:1`, tooltip 3 位小数 `' L/h'` |
| 序列 1 填充 | 竖向 linearGradient：`#1584ec` → 同色 opacity 0 |
| 序列 1 线形 | `lineWidth:1`, `marker.radius:2`, `states.hover.lineWidth:1`, `threshold:null` |
| 序列 2 | `name:'Diameter'`, 默认 line, `color:'#f98422'`, `yAxis:0`, `marker.enabled:false`, tooltip 3 位小数 `' cm'` |
| rangeSelector | `selected:1`，按钮 `1d` / `1w` / `All` |
| 按钮主题 | fill `#505053`，stroke `#000000`，字 `#CCC`；hover fill `#707073` 字白；选中 fill `#000003` 字白 |
| 输入框 | `inputBoxBorderColor:'#505053'`，`inputStyle:{backgroundColor:'#333',color:'silver'}`，`labelStyle:{color:'silver'}` |
| xAxis | `lineColor/tickColor:'#404040'`，`lineWidth/tickWidth:1`，`ordinal:false` |
| yAxis[0] | Diameter，默认 `opposite:true`（**右轴**）；`floor:0`；标题 `#f98422` 22px；标签 `{value} cm` 色 `#aaa`，`align:'left'`, `x:15` |
| yAxis[1] | Sap flow，`opposite:false`（**左轴**）；`floor:0`, `min:0`；标题 `#1584ec` 22px；标签 `{value} L/h` 色 `#aaa` |
| 网格线 | `gridLineColor:'#404040'`, `gridLineWidth:1`, `gridLineDashStyle:'longdash'` |
| tooltip | `shared:true`，`backgroundColor:'rgba(0,0,0,0.85)'`，`borderColor:'#000'`，字 `#F0F0F0` |
| navigator | handles bg `#666` border `#AAA`；`outlineColor:'#505050'`；`maskFill:'rgba(255,255,255,0.1)'`；series color `#7798BF` lineColor `#1584ec`；xAxis gridLineColor `#505053` |
| scrollbar | bar `#808083`，button `#606063`，箭头 `#CCC`，rifle `#FFF`，track/border `#404043` |
| 其他 | `credits.enabled:false`，`exporting.enabled:false` |

页面级 CSS：`body{background:#202020}`、`h3{color:#6ca14a}` 26px、`p{color:#c9c9c9}`、`a{color:#6ca14a}`、hover `#527c25`。

数据点格式：`[Date.UTC(y, m, d, H, M), value]`（月份 0-based）。
观察到两个序列**时间戳不对齐**（sap flow 落在 :00/:15/:30/:45，diameter 落在 :07/:22/:37/:52），说明是两台独立数采。本项目复刻该细节。

## 3. 目录结构

```
网页制作/
├── index.html            # 单页
├── css/style.css         # 深色主题
├── js/
│   ├── sample-data.js    # 示例数据（生成产物，勿手改）
│   └── chart.js          # Highcharts Stock 配置
├── 工具/
│   └── 生成示例数据.py    # 数据生成器（固定随机种子，可复现）
└── README.md
```

Highcharts Stock v11.4.8 以**本地 `js/highstock.js` 优先**引入，CDN 作为回退
（`window.Highcharts` 未定义时用 `document.write` 兜底）。
本地优先的原因：实测 `code.highcharts.com` 在本机返回 **403**，CDN 不可依赖。
若两者都不可用，页面显示明确的错误横幅而非白屏。

注：参考站用的是旧版 Highcharts，v11 有若干默认值变更，已逐条还原：
`lang.rangeSelectorFrom/To`（须用 `Highcharts.setOptions`，写进 chart config 无效）、
`inputDateFormat: '%b %e, %Y'`、`xAxis.dateTimeLabelFormats.day: '%e. %b'`、
`scrollbar.buttonsEnabled: true`、`chart.zooming.type`（替代已废弃的 `zoomType`）。

## 4. 示例数据设计

合成 14 天 × 15 分钟间隔 ≈ 1344 点/序列，UTC 时间，随机种子固定 = 20260727。

**Sap flow（L/h）** — 昼夜钟形：
- 日间高斯峰，中心 13:00，σ ≈ 3.2 h
- 夜间基线 0.05–0.35
- 每日天气因子：晴 2.0–2.4 / 多云 1.2–1.5 / 雨 0.5–0.8（随机日序列，含 1 段连续 2 天降雨）
- 叠加 N(0, 0.03) 噪声，下限截 0

**Diameter（cm）** — 生长趋势 + 昼夜收缩膨胀：
- 趋势：24.100 → 24.185 cm（14 天），生长增量偏向夜间/雨后
- 昼夜项：`-k × 平滑后 sap flow`，滞后约 30 min，晴日振幅 ≈ 0.018 cm，雨日显著减小
- 叠加 N(0, 0.0006) 噪声（树干位移传感器精度高）
- **与 sap flow 反相** —— 白天蒸腾失水收缩、夜间复水膨胀，符合真实树干水分动态

## 5. 交互功能验收清单

1. rangeSelector 按钮 `1d` / `1w` / `All`，默认选中 `1w`
2. From / To 日期输入框可手动指定区间
3. 图上横向点击拖拽框选缩放
   - 修正（实测）：Highcharts **Stock** 不创建 Reset zoom 按钮（`chart.resetZoomButton` 恒为 false），
     复位入口是 rangeSelector 的 `All` 按钮。参考站点行为一致，本站保持一致，不额外造按钮。
4. 底部 navigator 缩略导航条：迷你曲线 + 半透明遮罩 + 可拖拽手柄
5. scrollbar 滚动条可平移视窗
6. shared tooltip：同时显示两序列，各带 3 位小数与单位
7. 图例点击开关序列显隐
8. `ordinal:false` — 时间轴按真实时间等距，不压缩空隙
9. 窗口缩放时图表自适应，`min-width:310px`

## 6. 验收方式

浏览器打开 `index.html`，逐条对照第 5 节 9 项确认；与参考站点截图并排比对配色与控件位置。

## 7. 后续（本阶段不做）

- 换真实数据：只需替换 `js/sample-data.js` 中的两个数组
- 站点外壳（导航栏 / 页脚）
- Tree Location 地图区块
- 多站点切换、后端 API
