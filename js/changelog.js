/* ==========================================================================
 * 更新日志
 *
 * 点联系方式末尾版本行右边的按钮，弹出从最早一版到现在的完整变更记录。
 *
 * 版本号怎么定的
 * --------------
 *   v0.x  上线之前的搭建阶段（对应 _版本备份/ 里的 v1~v9 存档）
 *   v1.0  2026-07-28 首次发布到 GitHub Pages
 *   v1.x  发布后的功能增补，第三位是同一批功能里的小修订
 *
 * 日期与内容取自 git 提交记录和 _版本备份/ 的存档时间，不是事后追记的。
 *
 * 中英文各写一份。这个站是双语的，只写中文等于对英文访客关掉了这个功能。
 *
 * 加新版本：在 LOG 数组**开头**插一条（数组按时间倒序），
 * 同时记得改 i18n.js 里的 site.version。
 *
 * 对外句柄：window.Changelog = { open, close, entries }
 * ========================================================================== */

(function () {
    'use strict';

    /* 倒序：最新的在最前面 */
    var LOG = [
        {
            v: '1.7', date: '2026-08-03', kind: 'data',
            zh: {
                title: '公开最近 7 天，完整数据集需密钥',
                items: [
                    '站点公开展示最近 7 天的完整分辨率数据，可自由查看与缩放。',
                    '完整数据集经 AES-256-GCM 加密后发布，需要管理员密钥才能解开。密钥不写在任何代码或文件里，只在输入时存在于访客自己的浏览器内。用于研究请通过联系方式申请。',
                    '此前处理后的原始 CSV 一直被站点公开提供，已移出仓库。'
                ]
            },
            en: {
                title: 'Last 7 days open, full dataset behind a key',
                items: [
                    'The site shows the most recent 7 days at full resolution, free to browse and zoom.',
                    'The complete dataset is published encrypted with AES-256-GCM and needs an administrator key. The key lives in no file and no code — it exists only in the visitor’s own browser while they type it. Please request access for research use via the contact details.',
                    'The processed raw CSVs, which had been publicly served, were removed from the repository.'
                ]
            }
        },
        {
            v: '1.6', date: '2026-08-02', kind: 'perf',
            zh: {
                title: '性能优化与页脚改版',
                items: [
                    '图片全部按实际显示尺寸重新压缩并转成 WebP，体积减少 66%。最大的一处浪费是台站照片：文件存了 1400×1050，页面上只显示 300×225。',
                    '地图与图表改成滚到跟前才加载。原先 leaflet、Highcharts、观测数据、环境数据共 560 KB 都在首屏抢带宽，而多数访客还没滚到那儿。',
                    '首屏传输量从 2176 KB 降到 641 KB，首次内容绘制从 2.5 秒降到 1 秒出头。',
                    '页脚的监测规模改成一行「20 棵树 · 8 个树种 · 3 个样点」，数字从树木数据现算，不再写死。'
                ]
            },
            en: {
                title: 'Performance work and a new footer',
                items: [
                    'All images were resampled to the size they are actually displayed at and converted to WebP, cutting their weight by 66%. The worst offender was the station photo: stored at 1400×1050, displayed at 300×225.',
                    'The map and the charts now load only when you scroll near them. Previously Leaflet, Highcharts, the observation data and the environment data — 560 KB in total — competed for bandwidth on first paint, before most visitors had scrolled that far.',
                    'First-paint transfer dropped from 2176 KB to 641 KB; first contentful paint from about 2.5 s to just over 1 s.',
                    'The footer counter became a single line — trees, species and plots — computed from the tree data rather than hard-coded.'
                ]
            }
        },
        {
            v: '1.5.2', date: '2026-08-02', kind: 'ui',
            zh: {
                title: '版本行与信息条',
                items: [
                    '联系方式末尾加上站点版本与数据更新日期，日期从观测数据自动读取。',
                    '去掉「实测数据」信息条 —— 时间范围图表自己就写着，更新时间已挪进版本行，属于重复。'
                ]
            },
            en: {
                title: 'Version line, and one panel removed',
                items: [
                    'A site version and data-cutoff line was added at the end of the contact section; the date is read from the observation data automatically.',
                    'The "measured data" info panel was removed — the chart already shows the time span, and the update date now lives in the version line.'
                ]
            }
        },
        {
            v: '1.5.1', date: '2026-08-02', kind: 'copy',
            zh: {
                title: '中文文案修订',
                items: [
                    '按逐条意见修改正文措辞；观测方法一节改用小节标题，段落从完整的句子起头。',
                    '注明风速与风向传感器安装在林下。'
                ]
            },
            en: {
                title: 'Copy revisions',
                items: [
                    'Wording revised throughout; the methods section now uses proper subheadings so each paragraph starts as a complete sentence.',
                    'Noted that the wind speed and direction sensors sit below the canopy.'
                ]
            }
        },
        {
            v: '1.5', date: '2026-08-02', kind: 'feat',
            zh: {
                title: '环境条件面板',
                items: [
                    '新增环境条件面板，11 个变量（光照、气温、相对湿度、降雨、土壤含水量、土壤温度、气压、风速、风向、PM2.5、PM10），彩色标签自由开关，默认只开光照与气温。',
                    '与树木图表上下紧贴、共用一条时间轴，缩放拖动双向联动。',
                    '跨图表联动指针：鼠标停在任一面板，两张图同时出竖线，提示框一次列出该时刻的树木与环境全部变量。',
                    '风向画成箭头而非曲线，疏密随缩放自适应；降雨用柱状而非折线，避免连出不存在的斜坡。'
                ]
            },
            en: {
                title: 'Environment panel',
                items: [
                    'A new environment panel with 11 variables — light, air temperature, relative humidity, rainfall, soil moisture, soil temperature, pressure, wind speed, wind direction, PM2.5 and PM10 — each toggled by a coloured tag. Light and air temperature are on by default.',
                    'It sits directly under the tree chart and shares a single time axis; zooming or panning either one moves both.',
                    'A linked crosshair: hovering over either panel draws a line on both, and one tooltip lists every tree and environment variable at that instant.',
                    'Wind direction is drawn as arrows rather than a curve, thinning out as you zoom; rainfall uses bars rather than a line, so it never draws a slope that did not happen.'
                ]
            }
        },
        {
            v: '1.4', date: '2026-08-01', kind: 'data',
            zh: {
                title: '数据更新至 7 月 31 日',
                items: [
                    '接入 7/28–7/31 新增数据。区间 21.98 天，41,044 个观测点，20 棵树。'
                ]
            },
            en: {
                title: 'Data extended to 31 July',
                items: [
                    'Added the 28–31 July batch: 21.98 days, 41,044 observations across 20 trees.'
                ]
            }
        },
        {
            v: '1.3', date: '2026-07-31', kind: 'ui',
            zh: {
                title: '版式与图集',
                items: [
                    '数据信息条精简，站点基本信息改成两列。',
                    '更正液流数据的回传方式：现场设备经蒲公英路由器组网回传，此前写成云平台是错的。',
                    '仪器安装图集换掉两张重复的机箱照片。'
                ]
            },
            en: {
                title: 'Layout and gallery',
                items: [
                    'The data info bar was trimmed and the station facts moved to two columns.',
                    'Corrected how sap flow data gets back: the field devices are networked through a Pubu (Oray) router — the earlier text saying "cloud platform" was wrong.',
                    'Two near-duplicate enclosure photos in the installation gallery were replaced.'
                ]
            }
        },
        {
            v: '1.2', date: '2026-07-29', kind: 'data',
            zh: {
                title: '首批完整实测数据 + 方法学修正',
                items: [
                    '接入 7/10–7/28 实测数据：18.6 天，34,412 个观测点。',
                    '修正 Granier 公式里 ΔT₀ 的取法。原先取全期最大值，一次设备异常就会把每一个 Fd 都抬高 —— 数据从 5 天涨到 33 天后，昼夜峰谷比中位数从 9.3 塌到 2.9 暴露了这个问题。改成 7 天滑动窗口后恢复到 5.2。'
                ]
            },
            en: {
                title: 'First full measured dataset, and a methodological fix',
                items: [
                    'Loaded the 10–28 July measurements: 18.6 days, 34,412 observations.',
                    'Fixed how ΔT₀ is taken in the Granier equation. Using the whole-period maximum meant a single instrument anomaly inflated every Fd value — as the record grew from 5 to 33 days the median day/night peak ratio collapsed from 9.3 to 2.9, which is what exposed it. A 7-day moving window brought it back to 5.2.'
                ]
            }
        },
        {
            v: '1.1', date: '2026-07-28', kind: 'ui',
            zh: {
                title: '深色主题与日夜切换',
                items: [
                    '先试过暖白纸感配色，最终改回深色为默认，并保留浅色作为可切换的第二主题。',
                    '主题选择存进浏览器，刷新不丢；首屏绘制前就定下主题，不会闪一下深色再变浅。'
                ]
            },
            en: {
                title: 'Dark theme with a day/night switch',
                items: [
                    'A warm paper-white palette was tried, then reverted: dark is the default again, with light kept as a switchable second theme.',
                    'The choice is stored in the browser, and the theme is settled before first paint so there is no flash of the wrong one.'
                ]
            }
        },
        {
            v: '1.0', date: '2026-07-28', kind: 'release',
            zh: {
                title: '首次上线',
                items: [
                    '发布到 GitHub Pages，公开可访问。',
                    '含一键更新脚本与验收测试脚本 —— 每次改动都要跑过全部断言才发布。'
                ]
            },
            en: {
                title: 'First release',
                items: [
                    'Published to GitHub Pages and publicly reachable.',
                    'Shipped with a one-command update script and an acceptance test suite — every change has to pass the full set of assertions before it goes out.'
                ]
            }
        },
        {
            v: '0.9', date: '2026-07-28', kind: 'data',
            zh: {
                title: '接入实测数据（上线前）',
                items: [
                    '把示例数据换成台站的真实观测：液流通量密度与树干径向变化。',
                    '数据传输示意图改成正确的架构 —— 两条互相独立的回传路径，而非此前画的单路。'
                ]
            },
            en: {
                title: 'Real measurements wired in (pre-release)',
                items: [
                    'Sample data was replaced with the station’s actual observations: sap flux density and stem radial change.',
                    'The data-flow diagram was corrected to two independent transmission paths, rather than the single path drawn earlier.'
                ]
            }
        },
        {
            v: '0.5', date: '2026-07-28', kind: 'feat',
            zh: {
                title: '中英双语 + 数据传输示意图',
                items: [
                    '全站文案接入双语切换。',
                    '新增可交互的数据传输示意图，并加上鼠标提示，让访客知道可以点。'
                ]
            },
            en: {
                title: 'Bilingual, plus the data-flow diagram',
                items: [
                    'Every piece of copy went through a language switch.',
                    'An interactive data-flow diagram was added, with a cursor hint so visitors know it responds to clicks.'
                ]
            }
        },
        {
            v: '0.3', date: '2026-07-28', kind: 'feat',
            zh: {
                title: '换成台站真实内容',
                items: [
                    '把通用模板内容替换为北京森林生态系统定位研究站的实际信息：台站沿革、地理位置、20 棵监测树木的种类与胸径、观测方法。'
                ]
            },
            en: {
                title: 'Real station content',
                items: [
                    'Generic template content was replaced with the station’s own: its history, location, the species and diameters of all 20 monitored trees, and the observation methods.'
                ]
            }
        },
        {
            v: '0.1', date: '2026-07-27', kind: 'feat',
            zh: {
                title: '起步',
                items: [
                    '最初只有核心图表区：20 棵树的液流与径向变化双轴图，用合成的示例数据跑通。',
                    '随后扩成完整站点结构 —— 台站概况、监测树木、观测方法、数据传输、树木数据、联系方式。'
                ]
            },
            en: {
                title: 'Starting point',
                items: [
                    'At first there was only the chart: a dual-axis view of sap flow and radial change for 20 trees, running on synthetic sample data.',
                    'It then grew into the full site — station overview, monitored trees, methods, data transmission, tree data and contact.'
                ]
            }
        }
    ];

    var box = null;

    function t(k) { return window.Lang ? Lang.t(k) : k; }
    function isZh() { return window.Lang && Lang.current === 'zh'; }

    function esc(s) {
        return String(s).replace(/[&<>"]/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
        });
    }

    function paint() {
        if (!box) { return; }
        var lang = isZh() ? 'zh' : 'en';

        var body = LOG.map(function (e) {
            var d = e[lang];
            return '<li class="cl-entry">' +
                   '<div class="cl-head">' +
                       '<span class="cl-v">v' + esc(e.v) + '</span>' +
                       '<span class="cl-kind cl-' + e.kind + '">' +
                           esc(t('cl.kind.' + e.kind)) + '</span>' +
                       '<time class="cl-date">' + esc(e.date) + '</time>' +
                   '</div>' +
                   '<h4 class="cl-title">' + esc(d.title) + '</h4>' +
                   '<ul class="cl-items">' +
                       d.items.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') +
                   '</ul>' +
                   '</li>';
        }).join('');

        box.querySelector('.cl-h').textContent = t('cl.title');
        box.querySelector('.cl-sub').textContent = t('cl.sub');
        box.querySelector('.cl-close').setAttribute('aria-label', t('cl.close'));
        box.querySelector('.cl-close').setAttribute('title', t('cl.close'));
        box.querySelector('.cl-list').innerHTML = body;
    }

    function build() {
        box = document.createElement('div');
        box.className = 'changelog';
        box.setAttribute('role', 'dialog');
        box.setAttribute('aria-modal', 'true');
        box.innerHTML =
            '<div class="cl-panel">' +
                '<button type="button" class="cl-close">&times;</button>' +
                '<h3 class="cl-h"></h3>' +
                '<p class="cl-sub"></p>' +
                '<ol class="cl-list"></ol>' +
            '</div>';
        document.body.appendChild(box);

        /* 点遮罩关闭，但点面板内部不关 */
        box.addEventListener('click', function (e) {
            if (e.target === box) { close(); }
        });
        box.querySelector('.cl-close').addEventListener('click', close);
        paint();
    }

    function open() {
        if (!box) { build(); }
        box.classList.add('is-open');
        /* 弹层打开时锁住背景滚动，否则滚轮会穿透到正文 */
        document.body.style.overflow = 'hidden';
        box.querySelector('.cl-close').focus();
    }

    function close() {
        if (!box) { return; }
        box.classList.remove('is-open');
        document.body.style.overflow = '';
    }

    function init() {
        var btn = document.getElementById('changelogBtn');
        if (btn) { btn.addEventListener('click', open); }

        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape' && box && box.classList.contains('is-open')) {
                close();
            }
        });

        /* 语言切换时重画。只有已经建过面板才需要 —— 没建过的下次 open 会现画。 */
        if (window.Lang) { Lang.onChange(function () { if (box) { paint(); } }); }

        window.Changelog = { open: open, close: close, entries: LOG };
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
}());
