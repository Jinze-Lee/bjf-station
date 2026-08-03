/* ==========================================================================
 * 中英文切换
 *
 * 用法
 * ----
 * 静态文本：给元素加 data-i18n="键名"，切换时替换 textContent
 *           含行内标签的段落用 data-i18n-html="键名"，替换 innerHTML
 * 动态内容：chart.js / map.js / tree-info.js 通过 Lang.onChange(fn) 注册回调，
 *           语言切换时重新渲染自己那部分
 *
 * 默认语言为**英文**，用户选择存 localStorage，下次访问沿用。
 *
 * 对外句柄：window.Lang = { current, t(key), set(lang), onChange(fn) }
 * ========================================================================== */

var I18N = {

/* ====================== 中文 ====================== */
zh: {
    'html.lang':            'zh-CN',
    'doc.title':            '中国科学院北京森林生态系统定位研究站',
    'lang.switch':          'EN',
    'lang.switchTitle':     'Switch to English',
    /* 主题按钮的文案说的是「点了会变成什么」，不是「现在是什么」 */
    'theme.toLight':        '切换到浅色主题',
    'theme.toDark':         '切换到深色主题',

    /* --- 表头 --- */
    'brand.line1':          '中国科学院',
    'brand.line2':          '北京森林生态系统定位研究站',
    'nav.locations':        '样点',
    'nav.about':            '台站概况',
    'nav.trees':            '监测树木',
    'nav.methods':          '观测方法',
    'nav.network':          '数据传输',
    'nav.treedata':         '树木数据',
    'nav.contact':          '联系我们',
    'nav.menu':             '菜单',

    'social.wechat':        '微信公众号 · 北京森林站',

    /* --- 页面标题 --- */
    'page.title':           '中国科学院北京森林生态系统定位研究站',

    /* --- 台站概况 --- */
    'about.h3':             '暖温带森林定位研究站 · 东灵山',
    'about.photoCaption':   '台站周边的暖温带落叶阔叶林，北京市门头沟区东灵山。',
    'about.p1':             '森林在山地流域的水量平衡中起决定性作用。在中国北方暖温带地区，森林调节径流、缓冲周边低地的供水，并储存了该区域相当大比例的陆地碳。气候预估显示华北将面临更热的夏季与更多变、季节性更强的降水，因此理解单株树木如何调节自身水分利用，已成为预测这些森林未来响应的关键。',
    'about.p2':             '中国科学院北京森林生态系统定位研究站成立于 1990 年 3 月 20 日，由中国科学院植物研究所主持运行。台站于 1992 年加入中国生态系统研究网络（CERN），1997 年加入西太平洋与亚洲生物多样性监测网络（DIWPA）及国际生物学野外站组织（IOBFS）。台站位于北京市门头沟区东灵山，地处太行山脉东灵山地区，正处在暖温带落叶阔叶林带与温带山地针叶林带的过渡位置。',
    'about.p3':             '台站周边森林以辽东栎（<span class="sp">Quercus wutaishanica</span>）、白桦（<span class="sp">Betula platyphylla</span>）、黑桦（<span class="sp">Betula dahurica</span>）和五角枫（<span class="sp">Acer pictum</span> subsp. <span class="sp">mono</span>）为优势种，并混有华北落叶松（<span class="sp">Larix gmelinii</span> var. <span class="sp">principis-rupprechtii</span>）与油松（<span class="sp">Pinus tabuliformis</span>）人工林。2000 年建成 5 公顷固定样地，2010 年建成 20 公顷森林动态监测样地，此外还建有标准气象站，并长期开展森林水文、土壤与生物要素的定位监测。',
    'about.p4':             '在这些林分尺度观测之外，分布于三个样点的二十棵单株树木还安装了液流传感器与树干径向变化仪，可在分钟尺度上分辨水分运输与树干生长——本页展示的正是这部分数据。目的是揭示木材解剖构造与根系深度不同的树种如何在整个生长季调节蒸腾，以及土壤水分受限时树干生长的响应速度。',

    'about.f.location':     '地理位置',
    'about.v.location':     '北京市门头沟区东灵山',
    'about.f.coords':       '坐标',
    'about.v.coordsNote':   '（WGS-84，监测样点中心）',
    'about.f.elevation':    '海拔',
    'about.v.elevation':    '约 1164 米',
    'about.f.mat':          '年均气温',
    'about.v.mat':          '4–6 ℃',
    'about.f.map':          '年降水量',
    'about.v.map':          '约 650 毫米',
    'about.f.forest':       '森林类型',
    'about.v.forest':       '暖温带落叶阔叶林',
    'about.f.founded':      '建站时间',
    'about.v.founded':      '1990 年 3 月 20 日',
    'about.f.operator':     '主管单位',
    'about.v.operator':     '中国科学院植物研究所',
    'about.f.networks':     '所属网络',
    'about.v.networks':     'CERN（1992 年加入）· DIWPA、IOBFS（1997 年加入）',
    'about.regional':       '（区域值）',
    'about.footnote':       '* 气温与降水为东灵山地区的区域值，非本站实测记录；海拔为监测样点的实测值。',

    /* --- 监测树木 --- */
    'trees.h3':             '监测树木',
    'trees.p1':             '目前共有二十棵树木安装了传感器，分布在三个样点。每个样点由一台 <span class="sp">dataTaker</span> 数采（DT1–DT3）负责采集，每棵树配有编号探头，经网关回传。三个样点合计覆盖约 280 × 290 米的坡面。',
    'trees.p2':             '这二十棵树涵盖八个树种，也覆盖了本站可见的全部木材解剖类型——环孔材、半环孔材、散孔材与针叶材。木材解剖构造是控制液流日变化曲线形态、以及导水边材深度的最主要因素。',
    'trees.th.species':     '拉丁名',
    'trees.th.common':      '中文名',
    'trees.th.wood':        '木材解剖类型',
    'trees.th.count':       '株数',
    'trees.th.dbh':         '胸径范围（厘米）',
    'trees.footnote':       '树干周长与胸径均为野外实测；二十棵树的胸径与「周长 / π」的偏差全部在 2.5% 以内。树高与边材厚度尚未测量——边材厚度为何重要，见「观测方法」一节。',
    'trees.nTrees':         '棵树',
    'trees.nSpecies':       '个树种',

    /* --- 观测方法 --- */
    'methods.h3':           '观测方法',
    'methods.sub.fd':          '液流通量密度',
    'methods.sub.dendro':      '树干径向变化',
    'methods.sub.sampling':    '采样与数据处理',
    'methods.photoCaption': '安装在树干上的热扩散探头，外包反光隔热材料以屏蔽直接辐射与环境温度波动。包裹层下部<strong>有意不封死</strong>：完全密封会把水汽闷在树皮上，导致树皮腐烂。',
    'gal.cap1':             '同一株树上的两套仪器：上方以不锈钢箍固定的银色圆筒是 LR100 径向变化仪，下方反光隔热层内是热扩散液流探头。两者各走各的数据通路，互不相干。',
    'gal.cap2':             '从下往上看隔热层的下缘。包裹层<strong>下部有意不封死</strong>，与树皮之间留出一道通风缝隙——完全密封会把水汽闷在树皮上，时间一长导致树皮腐烂。缝隙里可以看到探头的引线。',
    'gal.cap3':             '样点机箱内部。紫色的 <span class="sp">dataTaker DT80</span> 数采在上方，屏幕上显示着它当前的 IP；下方黑色带四根天线的是<strong>可直接插 SIM 卡的蒲公英路由器</strong>，数采由网线接到它上面，靠异地组网让实验室远程取数。左侧白色方盒是蓄电池，箱体下沿那排防水接头就是各棵树的探头引线进箱的地方。',
    'gal.cap4':             '另一个样点的机箱，联网方式不同。这里的数采（蓝色 <span class="sp">DT80 Series 4</span>）本身没有插卡功能，于是在箱门上<strong>加装了一台 4G 工业路由器</strong>（黑色盒子，两根外置天线），由它插卡上网、再把数采接进同一个虚拟局域网。右上角是太阳能充电控制器（MPPT），本样点靠太阳能供电。',
    'gal.openHint':         '点击查看大图',
    'gal.hint':             '点击右侧小图切换，点击大图放大查看',
    'methods.fd':           '液流采用热扩散探头（TDP）测定，方法依据 <em>Granier（1985, 1987）</em>。一根加热针与一根不加热的参比针沿径向插入边材，流动的汁液带走热量，使两针间温差下降。测定结果表示为一个无量纲指数',
    'methods.k.where':      '其中 ΔT 为两针当前温差，ΔT<sub>0</sub> 为零流量条件下（通常出现在黎明前）达到的最大温差。液流通量密度由 Granier 的经验标定式给出',
    'methods.caveat':       '在此需要注意，Granier 的系数是在有限的树种上标定的，此后不断有研究对其普适性提出质疑；若以整树耗水量为目标，建议做本站与本树种的重新标定。',
    'methods.why':          '<strong>本图展示的是通量密度，而不是整树的精确耗水量。</strong>探头量到的，是<em>单位导水面积</em>上的流量。想换算成整树耗水量（L h<sup>−1</sup>），还需要钻取树芯、得到这棵树的边材横截面积，<strong>这一步我们还没做</strong>。异速生长方程虽然也能估，但精确度不高。与其给一个看着精确、其实靠估的升数，不如老实报 F<sub>d</sub>。等边材数据补齐，再把整树液流加上来。',
    'methods.calib':        '本站采用 Granier 的<strong>原始系数</strong>，未做本站或本树种的重新标定；<strong>也未做边材矫正</strong>（Clearwater 校正）。后者的意义在于：当边材厚度小于探头长度时，探针有一段落在不导水的心材里，会稀释温差信号、系统性低估 F<sub>d</sub>；该校正需要每棵树的边材厚度，而本站尚未测量。因此本试验的 F<sub>d</sub> 宜作为<strong>相对量</strong>看待——适合做树种之间、时间之间的比较，不宜直接当作绝对耗水量。',
    'methods.dendro':       '树干半径由点式径向变化仪以微米级分辨率记录。径向变化仪为北京天航华创科技股份有限公司的 <span class="sp">LR100</span>「树木径向生长自动观测仪」，每台自带电池与无线模块，机身标签上的 DID 即本站各处使用的网关编号。径向变化仪的信号并非只有生长，它是四个过程的叠加：木质部与韧皮部不可逆的径向生长；活细胞因体内储水被抽取与补充而产生的可逆收缩与膨胀；死导管因木质部张力升降而产生的收缩与扩张；以及树干的热胀冷缩。下方图表展示的是<strong>未经拆分的原始信号</strong>：由于传感器读数的零点取决于安装位置、各树之间不可比，图上按每条记录的起点归零，显示为相对该起点的径向变化量（μm）。',
    'methods.sampling':     '两类传感器均以 30 分钟为间隔采样。液流探头为 30 mm 热扩散探头（原始数据列名 TDP30 / RRTDP30），接入 <span class="sp">dataTaker DT80 Series 4</span> 数采，每个样点一台。数采本身不直接联网：它接入现场的<strong>蒲公英路由器</strong>，由贝锐蒲公英做异地组网，把野外的数采并入一个虚拟局域网，实验室侧因此可以像访问本地设备一样连上数采取数。径向变化仪不经数采，自带电池与无线模块各自独立回传。原始记录经预处理转换为本页所用量纲：ΔT 按上式换算为 F<sub>d</sub>；径向读数由 mm 换算为 μm 并按记录起点归零；两类设备时钟不同步（实测相差几十秒到几分钟），统一吸附到最近的半点以便对齐；液流与径向两类记录的时间窗不同，取交集后裁剪。需要说明的是，三台数采各自独立导出，最后一次回传的时间不尽相同，因此个别样点的液流序列会比其它样点早结束一两天——图上如实留空，不做插补。当前这套传感器阵列的监测自 2026 年 7 月开始。<br /><br />ΔT<sub>0</sub> 最简单的取法是整段记录里的最大温差，但只要中间有一次断电或加热异常，这个最大值就被抬高，而它在 K 的分子里——结果是<strong>每一个点</strong>的 F<sub>d</sub> 都被系统性推高，夜间本该归零的基线也浮起来。本站实测确有此事：三棵不同的树，全期最大温差落在同一时刻，显然是设备事件而非生理现象。因此改用<strong>七天滑动窗口内的最大值</strong>，异常只影响它附近几天，也跟得上传感器漂移与季节变化。',

    /* --- 数据传输 --- */
    'net.h3':               '数据传输',
    'net.p':                '每棵监测树木上装有两个传感器，但它们<strong>走两条完全独立的数据通路</strong>。热扩散液流探头由屏蔽电缆接入本样点的 <span class="sp">dataTaker DT80</span> 数采，由数采统一轮询、打时标、暂存；数采再接到现场的蒲公英路由器上，靠异地组网让实验室能远程取数。点式径向变化仪则<strong>自带电池、自带无线模块，每一台各自独立发射</strong>，不经过数采，直接把数据送到实验室工作站。因此下图有上下两条链路：上方是径向变化仪的独立无线直达，下方是液流的「有线汇聚 + 经路由器远程取数」。可点击各节点查看说明。',
    'net.tree':             '监测树木',
    'net.sf':               '液流探头',
    'net.dr':               '径向变化仪',
    'net.sfShort':          '液流',
    'net.drShort':          '径向',
    'net.logger':           '数采',
    'net.loggerSub':        '每样点 1 台，共 3 台',
    'net.modem':            '蒲公英路由器',
    'net.modemSub':         '异地组网回传',
    'net.remote':           '异地链路',
    'net.lab':              '数据接收',
    'net.labSub':           '实验室工作站',
    'net.more':             '每台 DT80 接 6–7 棵树',
    'net.legend':           '图例',
    'net.legendSf':         '液流信号 · 有线接入数采',
    'net.legendDr':         '径向变化信号 · 独立无线直达',
    'net.legendMix':        '经路由器回传',
    'net.play':             '播放动画',
    'net.pause':            '暂停动画',
    'net.wired':            '有线',
    'net.wireless':         '无线',
    'net.corridor':         '径向变化仪 · 各自独立发射，不经数采',
    'net.laneA':            '通路 A',
    'net.laneB':            '通路 B',
    'net.battery':          '自带电池',
    'net.hint':             '← 图示较宽，可左右滑动查看 →',
    'net.clickHint':        '点击图中任一环节，看它做什么',

    'net.d.tree':           '每棵树上有两个传感器：液流探头测水分运输，径向变化仪测树干伸缩与生长。两者<strong>不共用供电、不共用数据通路</strong>，可以单独增减、单独更换，其中任何一台故障都不影响另一台。',
    'net.d.dendro':         '径向变化仪自带电池与无线模块，<strong>每一台都是独立的发射节点</strong>，不接入数采、不占用数采通道，数据直接送到实验室工作站——相当于跳过了中间环节。代价是每台都要单独维护电池。',
    'net.d.logger':         'dataTaker DT80 —— 多通道数据采集器，<strong>只负责液流一路</strong>。按 30 分钟间隔轮询本样点各液流探头、加时标、暂存，断网时本地缓存以免丢数。',
    'net.d.modem':          '数采本身不直接联网，它接到现场的<strong>蒲公英路由器</strong>上。由贝锐蒲公英做异地组网，把野外的数采并进一个虚拟局域网 —— 实验室这端于是可以像连本地设备一样连上数采、把缓存的液流记录取回来。样点没有固网，路由器走无线出口。径向变化仪不走这条路。',
    'net.d.lab':            '实验室工作站同时接收两条通路的数据并入库：来自数采的液流数据，以及各台径向变化仪独立送达的数据。本页图表即由此驱动。',

    /* --- 树木位置 --- */
    'location.h3':          '树木位置',
    'location.p':           '下图显示全部二十棵监测树木与三台数采。标记按样点着色——<span class="key dt1">DT1</span> <span class="key dt2">DT2</span> <span class="key dt3">DT3</span>。点击任意树木可查看其详细信息，并可通过弹窗内的按钮把该树的观测数据载入下方图表。右上角图层控件可切换底图，或隐藏某个样点。在地图上先点击一下，即可用鼠标滚轮缩放。',

    /* --- 树木数据 --- */
    'treedata.h3':          '树木数据',
    'treedata.p':           '下方动态图表展示所选树木的液流通量密度与径向变化量。通过「缩放」按钮可选择不同的时间范围，也可在「从…至…」中自行指定起止日期。此外，在图表上横向点击并拖动鼠标即可框选任意数据区间。',
    'treedata.pick':        '树木',
    'treedata.noteFd':      '液流通量密度 — g m⁻² s⁻¹，左轴',
    'treedata.noteDia':     '径向变化量 — μm，右轴（相对记录起点）',

    /* --- 环境条件（与树木图表共用时间轴） --- */
    'env.h4':               '环境条件',
    'env.p':                '同一时段台站气象站记录的环境要素，与上方图表<strong>共用时间轴</strong>——在任一张图上缩放或拖动，另一张会跟着走，不必手动对齐。点下面的标签可以增减曲线；默认显示<strong>光照</strong>与<strong>空气温度</strong>，它们是驱动蒸腾的直接因子，与上方液流曲线的对应关系最直观。',
    'env.all':              '全选',
    'env.none':             '清空',
    'env.empty':            '尚未选择任何变量——点上方标签添加曲线。',
    'env.scaleNote':        '<strong>注意：</strong>同时显示三个及以上变量时，各曲线<strong>各自独立缩放</strong>，纵轴已隐藏。此时只能比较形状与时相，不能直接比较数值大小——把鼠标停在曲线上可读取带单位的准确值。',
    'env.note':             '环境数据为<strong>站点级</strong>单点记录，不随所选树木变化。采样间隔 30 分钟，时间范围已裁剪到与树木数据一致。降雨以柱状呈现（事件量，画成折线会在两场雨之间连出并不存在的斜线）；风向以箭头呈现（0° 与 360° 是同一方向，折线会在越过正北时拉出贯穿全图的竖线），箭头指风吹去的方向，风速低于 0.2 m/s 的静风时段不画——那时的风向读数基本是噪声。风速与风向的传感器装在<strong>林下</strong>，读数普遍偏小（全期中位数 0.43 m/s），反映的是林内近地面的风况，不能代表林冠之上。',
    'env.light':            '光照',
    'env.airTemp':          '空气温度',
    'env.rh':               '相对湿度',
    'env.rain':             '降雨量',
    'env.soilMoisture':     '土壤水分',
    'env.soilTemp':         '土壤温度',
    'env.pressure':         '气压',
    'env.windSpeed':        '风速',
    'env.windDir':          '风向',
    'env.pm25':             'PM2.5',
    'env.pm10':             'PM10',
    'treedata.noData':      '本批无数据',
    'src.measuredTitle':    '实测数据',
    'src.range':            '时间范围',
    'src.scale':            '规模',
    'src.points':           '个观测点',
    'src.updated':          '最新更新',
    'src.missingTitle':     '数据文件缺失。',
    'src.missingBody':      '未找到 js/observations.js。请先运行「工具/生成示例数据.py」或「工具/导入观测数据.py」。',

    'treedata.demoTitle':   '演示数据。',
    'treedata.demoBody':    '此处展示的序列为合成数据，用于演示界面功能。曲线形态按真实树木生理规律构造——平台状的液流日变化、与蒸腾反相的树干收缩、以及全站共用的天气序列——但它们<strong>并非</strong>本站的实测观测值。',

    /* --- 联系我们 --- */
    'contact.h3':           '联系我们',
    'contact.f.station':    '台站',
    'contact.v.station':    '中国科学院北京森林生态系统定位研究站',
    'contact.f.operator':   '主管单位',
    'contact.v.operator':   '中国科学院植物研究所',
    'contact.f.person':     '网站维护',
    'contact.f.location':   '地址',
    'contact.v.location':   '北京市门头沟区东灵山',
    'site.version':         '网站版本 v1.8',
    'site.updatedLabel':    '数据更新至',

    /* 更新日志弹层。条目正文写在 js/changelog.js 里（中英各一份），
       这里只放外壳文案。 */
    /* 完整数据集解锁条。{days}/{points}/{from}/{to} 由 js/unlock.js 填。 */
    'unlock.title':         '当前显示最近 {days} 天。',
    'unlock.body':          '完整数据集覆盖 {days} 天、{points} 个观测点，需管理员密钥。如需用于研究，请通过下方联系方式申请。',
    'unlock.placeholder':   '管理员密钥',
    'unlock.go':            '解锁',
    'unlock.working':       '正在校验密钥并解密…（需要一两秒）',
    'unlock.empty':         '请先输入密钥。',
    'unlock.failPass':      '密钥不正确。',
    'unlock.failFetch':     '取不到数据文件，请检查网络后重试。',
    'unlock.insecure':      '当前页面不是安全连接（HTTPS），浏览器不允许解密。',
    'unlock.nogzip':        '浏览器版本过旧，不支持解压所需的接口。请换用较新的 Chrome、Edge、Firefox 或 Safari。',
    'unlock.doneTitle':     '已解锁完整数据集。',
    'unlock.doneBody':      '{from} 至 {to}，共 {points} 个观测点。',
    'unlock.relock':        '退出',

    'cl.open':              '更新日志',
    'cl.title':             '更新日志',
    'cl.sub':               '从第一版到现在的完整变更记录。日期取自版本存档与提交记录。',
    'cl.close':             '关闭',
    'cl.kind.release':      '发布',
    'cl.kind.feat':         '新功能',
    'cl.kind.data':         '数据',
    'cl.kind.perf':         '性能',
    'cl.kind.ui':           '界面',
    'cl.kind.copy':         '文案',
    'contact.qr':           '微信公众号',

    /* --- 页脚 --- */
    'footer.copyright':     '中国科学院北京森林生态系统定位研究站 版权所有 © 2026',
    'footer.operator':      '中国科学院植物研究所',
    'footer.locations':     '个样点',

    /* --- 图表（动态） --- */
    'chart.fd':             '液流通量密度',
    'chart.rad':            '径向变化量',
    'chart.fdUnit':         ' g m⁻² s⁻¹',
    'chart.radUnit':        ' μm',
    'chart.zoom':           '缩放',
    'chart.from':           '从',
    'chart.to':             '至',
    'chart.btn1d':          '1天',
    'chart.btn1w':          '1周',
    'chart.btnAll':         '全部',
    'chart.inputFormat':    '%Y年%m月%d日',
    'chart.axisDay':        '%m月%d日',
    'chart.navDay':         '%m/%d',
    'chart.tipDate':        '%Y年%m月%d日 %H:%M',
    'chart.months':         '一月,二月,三月,四月,五月,六月,七月,八月,九月,十月,十一月,十二月',
    'chart.shortMonths':    '1月,2月,3月,4月,5月,6月,7月,8月,9月,10月,11月,12月',
    'chart.weekdays':       '星期日,星期一,星期二,星期三,星期四,星期五,星期六',

    /* --- 地图与信息卡（动态） --- */
    'map.plot':             '样点',
    'map.wood':             '木材解剖',
    'map.circ':             '树干周长',
    'map.dbh':              '胸径',
    'map.coords':           '坐标',
    'map.showData':         '查看该树数据 ↓',
    'map.logger':           '数采',
    'map.loggers':          '数采位置',
    'map.commonName':       '中文名',
    'map.probe':            '探头 / 网关',
    'map.locate':           '在地图上定位 ↑',
    'map.satellite':        '高德影像',
    'map.street':           '高德地图',
    'map.osm':              'OpenStreetMap',

    /* --- 木材解剖类型 --- */
    'wood.ring-porous':      '环孔材',
    'wood.semi-ring-porous': '半环孔材',
    'wood.diffuse-porous':   '散孔材',
    'wood.coniferous':       '针叶材'
},

/* ====================== English ====================== */
en: {
    'html.lang':            'en',
    'doc.title':            'Beijing Forest Ecosystem Research Station, CAS',
    'lang.switch':          '中文',
    'lang.switchTitle':     '切换到中文',
    'theme.toLight':        'Switch to light theme',
    'theme.toDark':         'Switch to dark theme',

    'brand.line1':          'Beijing Forest Ecosystem',
    'brand.line2':          'Research Station, CAS',
    'nav.locations':        'Locations',
    'nav.about':            'About',
    'nav.trees':            'Trees',
    'nav.methods':          'Methods',
    'nav.network':          'Data flow',
    'nav.treedata':         'Tree data',
    'nav.contact':          'Contact',
    'nav.menu':             'Menu',

    'social.wechat':        'WeChat · 北京森林站',

    'page.title':           'Beijing Forest Ecosystem Research Station',

    'about.h3':             'Warm-Temperate Forest Research Station, Dongling Mountain',
    'about.photoCaption':   'The warm-temperate deciduous broadleaf forest surrounding the station, Dongling Mountain, western Beijing.',
    'about.p1':             'Forests play a decisive role in the water balance of mountain catchments. In the warm-temperate zone of northern China they regulate runoff, buffer the water supply of the surrounding lowlands, and store a substantial share of the region’s terrestrial carbon. With climate projections for North China pointing to warmer summers and more variable, more strongly seasonal precipitation, understanding how individual trees regulate their water use has become central to forecasting how these forests will respond.',
    'about.p2':             'The Beijing Forest Ecosystem Research Station was founded on 20 March 1990 and is operated by the Institute of Botany, Chinese Academy of Sciences. It joined the Chinese Ecosystem Research Network (CERN) in 1992, and in 1997 became part of the Diversitas in the Western Pacific and Asia network (DIWPA) and the International Organization of Biological Field Stations (IOBFS). The station lies in the Dongling Mountain area of the Mentougou District, western Beijing, within the Taihang range, at the transition between the warm-temperate deciduous broadleaf forest zone and the temperate montane conifer belt.',
    'about.p3':             'The forest surrounding the station is dominated by <span class="sp">Quercus wutaishanica</span>, <span class="sp">Betula platyphylla</span>, <span class="sp">Betula dahurica</span> and <span class="sp">Acer pictum</span> subsp. <span class="sp">mono</span>, mixed with plantations of <span class="sp">Larix gmelinii</span> var. <span class="sp">principis-rupprechtii</span> and <span class="sp">Pinus tabuliformis</span>. A 5 ha permanent plot was established in 2000 and a 20 ha forest dynamics plot in 2010, alongside a standard meteorological station and long-term monitoring of forest hydrology, soils and biota.',
    'about.p4':             'In addition to these stand-level measurements, twenty individual trees across three plots are equipped with sap flow sensors and dendrometers, which resolve water transport and stem growth at a temporal resolution of minutes. These are the measurements presented on this page. The aim is to reveal how species differing in wood anatomy and rooting depth regulate transpiration across the growing season, and how quickly stem growth responds once soil water becomes limiting.',

    'about.f.location':     'Location',
    'about.v.location':     'Dongling Mountain, Mentougou District, Beijing, China',
    'about.f.coords':       'Coordinates',
    'about.v.coordsNote':   '(WGS-84, centre of the instrumented plots)',
    'about.f.elevation':    'Elevation',
    'about.v.elevation':    'ca. 1164 m a.s.l.',
    'about.f.mat':          'Mean annual temperature',
    'about.v.mat':          '4–6 °C',
    'about.f.map':          'Mean annual precipitation',
    'about.v.map':          'ca. 650 mm',
    'about.f.forest':       'Forest type',
    'about.v.forest':       'Warm-temperate deciduous broadleaf forest',
    'about.f.founded':      'Station established',
    'about.v.founded':      '20 March 1990',
    'about.f.operator':     'Operated by',
    'about.v.operator':     'Institute of Botany, Chinese Academy of Sciences',
    'about.f.networks':     'Networks',
    'about.v.networks':     'CERN (since 1992) · DIWPA, IOBFS (since 1997)',
    'about.regional':       '(regional)',
    'about.footnote':       '* Climate values are regional figures for the Dongling Mountain area, not on-site station records. Elevation is a measured value for the instrumented plots.',

    'trees.h3':             'Monitored Trees',
    'trees.p1':             'Twenty trees are currently instrumented, distributed across three plots. Each plot is served by its own <span class="sp">dataTaker</span> logger (DT1–DT3), and every tree carries a numbered probe reporting through a gateway. The three plots together span roughly 280 × 290 m of hillside.',
    'trees.p2':             'The instrumented trees cover eight species and the full range of wood anatomies found at the site — ring-porous, semi-ring-porous, diffuse-porous and coniferous. Wood anatomy is the single strongest control on the shape of the daily sap flow curve and on how deep the conducting sapwood extends, so this spread is deliberate.',
    'trees.th.species':     'Species',
    'trees.th.common':      'Common name',
    'trees.th.wood':        'Wood anatomy',
    'trees.th.count':       'Trees',
    'trees.th.dbh':         'DBH range (cm)',
    'trees.footnote':       'Stem circumference and diameter at breast height were measured in the field; diameter is consistent with circumference / π to within 2.5 % for all twenty trees. Tree height and sapwood depth have not yet been measured — see Methods for why sapwood depth matters.',
    'trees.nTrees':         'trees',
    'trees.nSpecies':       'species',

    'methods.h3':           'Methods',
    'methods.sub.fd':          'Sap flux density',
    'methods.sub.dendro':      'Stem radial variation',
    'methods.sub.sampling':    'Sampling and data handling',
    'methods.photoCaption': 'A thermal dissipation probe installed on a stem, wrapped in reflective insulation to shield the sensor from direct radiation and from ambient temperature swings. The wrapping is <strong>deliberately left open at the bottom</strong>: fully sealing it would trap moisture against the bark and promote decay.',
    'gal.cap1':             'Both instruments on one stem: the silver cylinder held by a stainless band above is the LR100 dendrometer; inside the reflective insulation below are the thermal dissipation sap flow probes. Each takes its own data path; neither depends on the other.',
    'gal.cap2':             'Looking up at the lower edge of the insulation. The wrap is <strong>deliberately left open at the bottom</strong>, leaving a ventilation gap between it and the bark — sealing it completely would trap moisture against the bark and, in time, rot it. The probe leads are visible through the gap.',
    'gal.cap3':             'Inside a plot enclosure. The purple <span class="sp">dataTaker DT80</span> logger sits at the top, its screen showing the current IP address. Below it, the black unit with four antennas is a <strong>PgyVPN router that takes a SIM card directly</strong>; the logger connects to it by Ethernet, and the virtual LAN lets the laboratory pull data remotely. The white box on the left is the battery, and the row of waterproof glands along the bottom edge is where the probe leads from each tree enter the cabinet.',
    'gal.cap4':             'Another plot, connected a different way. This logger (the blue <span class="sp">DT80 Series 4</span>) has no SIM slot of its own, so a <strong>separate 4G industrial router</strong> — the black box with two external antennas — is mounted on the cabinet door; it carries the SIM and brings the logger onto the same virtual LAN. Top right is the MPPT solar charge controller: this plot runs on solar power.',
    'gal.openHint':         'Click to view full size',
    'gal.hint':             'Click a thumbnail to switch, click the large image to enlarge',
    'methods.fd':           'Sap flow is measured with thermal dissipation probes (TDP) following <em>Granier (1985, 1987)</em>. A heated needle and an unheated reference needle are inserted radially into the sapwood; the temperature difference between them falls as moving sap carries heat away. The measurement is expressed as a dimensionless index',
    'methods.k.where':      'where ΔT is the current temperature difference between the two needles and ΔT<sub>0</sub> is the maximum difference, reached under zero-flow conditions (typically before dawn). Sap flux density follows from Granier’s empirical calibration',
    'methods.caveat':       'Note that Granier’s coefficients were derived on a limited set of species and have been questioned since; site- and species-specific recalibration is recommended where whole-tree water use is the target.',
    'methods.why':          '<strong>Why the chart shows flux density rather than litres per hour.</strong> What the probe measures is flow per unit of <em>conducting area</em>. Turning that into whole-tree water use (L h<sup>−1</sup>) means multiplying by the sapwood cross-section of each tree — and knowing how deep the sapwood goes takes a core sample, <strong>which we have not done yet</strong>. We could estimate it from an allometric equation, but that borrows a relationship fitted on other stands and may be no more accurate than the measurement it replaces. Rather than publish a litre figure that looks precise but rests on a guess, we report F<sub>d</sub> as measured. Whole-tree flow will follow once the sapwood data are in.',
    'methods.calib':        'The <strong>original Granier coefficients</strong> are used; no site- or species-specific recalibration has been carried out, and <strong>no sapwood correction</strong> (the Clearwater correction) has been applied. The latter matters because where sapwood is shallower than the probe, part of the needle sits in non-conducting heartwood, diluting the temperature signal and systematically underestimating F<sub>d</sub>; that correction requires the sapwood depth of each tree, which has not yet been measured here. The F<sub>d</sub> values on this page should therefore be read as <strong>relative</strong> — suitable for comparison between species and over time, but not as absolute water use.',
    'methods.dendro':       'Stem radius is recorded with a point dendrometer at micrometre resolution. The instrument is an <span class="sp">LR100</span> automatic stem radial growth sensor (Beijing Tianhang Huachuang Technology); each unit carries its own battery and radio module, and the DID printed on its housing is the gateway number used throughout this site. The dendrometer signal is not growth alone. It integrates four processes: irreversible radial growth of xylem and phloem; reversible shrinking and swelling of living cells as internally stored water is withdrawn and replenished; contraction and expansion of dead conducting elements as xylem tension rises and relaxes; and thermal expansion of the stem. The chart below shows the <strong>raw, unpartitioned signal</strong>: because the zero of a dendrometer reading is set by how the sensor was mounted and is not comparable between trees, the chart re-zeroes each record at its first point and plots radial change (μm) relative to that start.',
    'methods.sampling':     'Both sensor types are sampled at 30-minute intervals. The sap flow probes are 30 mm thermal dissipation probes (logged under the column names TDP30 / RRTDP30) wired to a <span class="sp">dataTaker DT80 Series 4</span> logger, one per plot. The logger has no direct internet connection of its own: it is wired to an on-site <strong>Oray PgyVPN (蒲公英) router</strong>, which places the field logger on a virtual LAN, so the laboratory can reach it as if it were a local device and pull the records down. The dendrometers bypass the logger entirely, each transmitting on its own battery and radio. Raw records are pre-processed into the quantities shown here: ΔT is converted to F<sub>d</sub> with the equation above; dendrometer readings are converted from mm to μm and re-zeroed at the start of each record; the two instrument clocks are not synchronised (tens of seconds to a few minutes apart in practice), so all timestamps are snapped to the nearest half hour; and because sap flow and dendrometer records cover different windows, the data are clipped to their common interval. Note that the three loggers are downloaded independently and their last upload times differ, so the sap flow series at one plot may end a day or two before the others — the chart leaves those gaps as they are rather than interpolating. Monitoring of the current sensor array began in July 2026.<br /><br />The choice of ΔT<sub>0</sub> deserves a note of its own. The obvious approach is to take the largest temperature difference in the whole record, but a single power interruption or heater fault inflates that maximum — and it sits in the numerator of K, so <strong>every</strong> F<sub>d</sub> value is pushed up and the night-time baseline, which should fall to zero, floats above it. That happened here: three different trees reached their whole-period maximum at the same instant, plainly an instrument event rather than physiology. We therefore take the maximum within a <strong>seven-day moving window</strong>, so an anomaly affects only the days around it, and the reference also tracks sensor drift and seasonal change.',

    'net.h3':               'Data transmission',
    'net.p':                'Every monitored tree carries two sensors, but they travel <strong>two entirely separate data paths</strong>. The thermal dissipation sap flow probe is cabled to the plot’s <span class="sp">dataTaker DT80</span> logger, which polls it on a fixed schedule, time-stamps the readings, buffers them; the logger is then wired to an on-site PgyVPN router, whose virtual LAN lets the laboratory reach it remotely. The point dendrometer, by contrast, <strong>carries its own battery and its own radio and transmits independently</strong>: it never passes through the logger, and its data goes straight to the laboratory workstation. Hence the two lanes below — dendrometers transmitting direct along the top, sap flow cabled to the logger and pulled back over the router along the bottom. Click any node for detail.',
    'net.tree':             'Monitored tree',
    'net.sf':               'Sap flow probe',
    'net.dr':               'Dendrometer',
    'net.sfShort':          'Sap flow',
    'net.drShort':          'Dendro.',
    'net.logger':           'Data logger',
    'net.loggerSub':        'one per plot, 3 in total',
    'net.modem':            'PgyVPN router',
    'net.modemSub':         'virtual LAN',
    'net.remote':           'Remote link',
    'net.lab':              'Receive data',
    'net.labSub':           'Laboratory workstation',
    'net.more':             '6–7 trees per DT80',
    'net.legend':           'Legend',
    'net.legendSf':         'Sap flow · cabled to the logger',
    'net.legendDr':         'Dendrometer · independent radio, direct',
    'net.legendMix':        'Relayed via the router',
    'net.play':             'Play animation',
    'net.pause':            'Pause animation',
    'net.wired':            'Wired',
    'net.wireless':         'Wireless',
    'net.corridor':         'Dendrometers · each transmits on its own, bypassing the logger',
    'net.laneA':            'Lane A',
    'net.laneB':            'Lane B',
    'net.battery':          'own battery',
    'net.hint':             '← The diagram is wide — scroll sideways to see it all →',
    'net.clickHint':        'Click any part of the diagram to see what it does',

    'net.d.tree':           'Each tree carries two sensors: the sap flow probe measures water transport, the dendrometer measures stem shrinkage and growth. They <strong>share neither power nor data path</strong>, can be added, removed or replaced separately, and a failure in one does not affect the other.',
    'net.d.dendro':         'The dendrometer carries its own battery and radio module. <strong>Each unit is an independent transmitter</strong> — it does not connect to the logger or occupy a logger channel, and its readings go straight to the laboratory workstation, skipping the intermediate step. The trade-off is that every unit needs its battery maintained individually.',
    'net.d.logger':         'dataTaker DT80 — a multi-channel data logger that <strong>handles the sap flow path only</strong>. It polls the plot’s sap flow probes at 30-minute intervals, time-stamps the readings, and buffers them locally so nothing is lost if the link drops.',
    'net.d.modem':          'The logger has no internet connection of its own; it is wired to an on-site <strong>Oray PgyVPN (蒲公英) router</strong>. The router joins the field logger to a virtual LAN, so the laboratory can connect to it as though it sat on the same network and pull the buffered sap flow records back. There is no fixed line at the plots, so the router itself uplinks wirelessly. Dendrometers do not use this route.',
    'net.d.lab':            'The laboratory workstation receives and archives both streams: sap flow arriving via the logger, and dendrometer readings delivered independently by each unit. The charts on this page are driven by this feed.',

    'location.h3':          'Tree Location',
    'location.p':           'The map below shows all twenty monitored trees and the three data loggers. Markers are coloured by plot — <span class="key dt1">DT1</span> <span class="key dt2">DT2</span> <span class="key dt3">DT3</span>. Click any tree to see its details, and use the button in the popup to load that tree’s measurements into the chart below. Use the layer control in the upper right to switch base maps or to hide a plot. Click the map before scrolling to enable zooming with the mouse wheel.',

    'treedata.h3':          'Tree data',
    'treedata.p':           'The dynamic chart below displays sap flux density and radial change for the selected tree. Using the ‘zoom’ buttons it is possible to select a different time range. A specific time range can also be defined. Furthermore data ranges can be selected by simple clicking and dragging your cursor along the chart horizontally.',
    'treedata.pick':        'Tree',
    'treedata.noteFd':      'Sap flux density — g m⁻² s⁻¹, left axis',
    'treedata.noteDia':     'Radial change — μm, right axis (relative to record start)',

    /* --- Environmental conditions (shares its time axis with the tree chart) --- */
    'env.h4':               'Environmental conditions',
    'env.p':                'Conditions recorded by the station weather logger over the same period. This chart <strong>shares its time axis</strong> with the one above — zoom or pan either and the other follows, so the two never need to be lined up by hand. Use the tags below to add or remove series. <strong>Light</strong> and <strong>air temperature</strong> are shown by default: they drive transpiration directly, and their correspondence with the sap flow trace above is the easiest to read.',
    'env.all':              'Select all',
    'env.none':             'Clear',
    'env.empty':            'No variables selected — pick a tag above to add a series.',
    'env.scaleNote':        '<strong>Note:</strong> with three or more variables shown, each curve is <strong>scaled independently</strong> and the value axes are hidden. Shapes and timing can be compared, but magnitudes cannot — hover a curve to read its exact value with units.',
    'env.note':             'These are <strong>station-level</strong> measurements from a single weather logger; they do not change with the selected tree. Sampling interval is 30 minutes, and the record has been clipped to match the tree data. Rainfall is drawn as bars (it is an event quantity; a line would connect two separate showers with a slope that never happened), and wind direction as arrows (0° and 360° are the same bearing, so a line would jump the full height of the plot each time the wind crossed north). The arrows point the way the wind is blowing, and are omitted below 0.2 m/s — in calm air the direction reading is mostly noise. The wind sensors sit <strong>below the canopy</strong>, so the readings are low throughout (median 0.43 m/s) and describe conditions near the forest floor rather than above the canopy.',
    'env.light':            'Light',
    'env.airTemp':          'Air temperature',
    'env.rh':               'Relative humidity',
    'env.rain':             'Rainfall',
    'env.soilMoisture':     'Soil moisture',
    'env.soilTemp':         'Soil temperature',
    'env.pressure':         'Air pressure',
    'env.windSpeed':        'Wind speed',
    'env.windDir':          'Wind direction',
    'env.pm25':             'PM2.5',
    'env.pm10':             'PM10',
    'treedata.noData':      'no data in this batch',
    'src.measuredTitle':    'Field measurements',
    'src.range':            'Time span',
    'src.scale':            'Scale',
    'src.points':           'observations',
    'src.updated':          'Last updated',
    'src.missingTitle':     'Data file missing.',
    'src.missingBody':      'js/observations.js was not found. Run 工具/生成示例数据.py or 工具/导入观测数据.py first.',

    'treedata.demoTitle':   'Demonstration data.',
    'treedata.demoBody':    'The series shown here are synthetically generated to demonstrate the interface. They are shaped to follow realistic tree physiology — a plateau-shaped daily sap flow curve, stem shrinkage in phase opposition to transpiration, and a shared weather sequence across all trees — but they are <strong>not</strong> field measurements from this station.',

    'contact.h3':           'Contact',
    'contact.f.station':    'Station',
    'contact.v.station':    'Beijing Forest Ecosystem Research Station, Chinese Academy of Sciences',
    'contact.f.operator':   'Operated by',
    'contact.v.operator':   'Institute of Botany, Chinese Academy of Sciences',
    'contact.f.person':     'Site maintainer',
    'contact.f.location':   'Location',
    'contact.v.location':   'Dongling Mountain, Mentougou District, Beijing, China',
    'site.version':         'Site version v1.8',
    'site.updatedLabel':    'data updated to',

    'unlock.title':         'Showing the last {days} days.',
    'unlock.body':          'The full dataset covers {days} days and {points} observations, and needs an administrator key. For research use, please request access via the contact details below.',
    'unlock.placeholder':   'Administrator key',
    'unlock.go':            'Unlock',
    'unlock.working':       'Checking the key and decrypting — this takes a second or two.',
    'unlock.empty':         'Please enter the key first.',
    'unlock.failPass':      'That key is not correct.',
    'unlock.failFetch':     'Could not fetch the data file. Check your connection and try again.',
    'unlock.insecure':      'This page is not on a secure connection (HTTPS), so the browser will not decrypt.',
    'unlock.nogzip':        'This browser is too old for the decompression API required. Please use a recent Chrome, Edge, Firefox or Safari.',
    'unlock.doneTitle':     'Full dataset unlocked.',
    'unlock.doneBody':      '{from} to {to}, {points} observations.',
    'unlock.relock':        'Exit',

    'cl.open':              'Changelog',
    'cl.title':             'Changelog',
    'cl.sub':               'Every change from the first version to now. Dates come from the version archive and the commit record.',
    'cl.close':             'Close',
    'cl.kind.release':      'release',
    'cl.kind.feat':         'feature',
    'cl.kind.data':         'data',
    'cl.kind.perf':         'performance',
    'cl.kind.ui':           'interface',
    'cl.kind.copy':         'copy',
    'contact.qr':           'WeChat official account',

    'footer.copyright':     'BEIJING FOREST ECOSYSTEM RESEARCH STATION, COPYRIGHT © 2026.',
    'footer.operator':      'INSTITUTE OF BOTANY, CHINESE ACADEMY OF SCIENCES',
    'footer.locations':     'plots',

    'chart.fd':             'Sap flux density',
    'chart.rad':            'Radial change',
    'chart.fdUnit':         ' g m⁻² s⁻¹',
    'chart.radUnit':        ' μm',
    'chart.zoom':           'Zoom',
    'chart.from':           'From',
    'chart.to':             'To',
    'chart.btn1d':          '1d',
    'chart.btn1w':          '1w',
    'chart.btnAll':         'All',
    'chart.inputFormat':    '%b %e, %Y',
    'chart.axisDay':        '%e. %b',
    'chart.navDay':         '%e. %b',
    'chart.tipDate':        '%A, %e %b, %H:%M',
    'chart.months':         'January,February,March,April,May,June,July,August,September,October,November,December',
    'chart.shortMonths':    'Jan,Feb,Mar,Apr,May,Jun,Jul,Aug,Sep,Oct,Nov,Dec',
    'chart.weekdays':       'Sunday,Monday,Tuesday,Wednesday,Thursday,Friday,Saturday',

    'map.plot':             'Plot',
    'map.wood':             'Wood anatomy',
    'map.circ':             'Circumference',
    'map.dbh':              'DBH',
    'map.coords':           'Coordinates',
    'map.showData':         'Show this tree’s data ↓',
    'map.logger':           'data logger',
    'map.loggers':          'Data loggers',
    'map.commonName':       'Common name',
    'map.probe':            'Probe / gateway',
    'map.locate':           'Locate on map ↑',
    'map.satellite':        'AMap Satellite',
    'map.street':           'AMap Street',
    'map.osm':              'OpenStreetMap',

    'wood.ring-porous':      'ring-porous',
    'wood.semi-ring-porous': 'semi-ring-porous',
    'wood.diffuse-porous':   'diffuse-porous',
    'wood.coniferous':       'coniferous'
}
};

/* ========================================================================== */

var Lang = (function () {
    'use strict';

    /* 存储键带版本号。默认语言从中文改成英文那次，老访客的 localStorage 里
     * 还存着 'zh'，会一直盖过新默认值 —— 键升一版即可让旧值作废一次，
     * 之后用户自己的选择照常保存。 */
    var KEY = 'bfers-lang-v2';
    var DEFAULT = 'en';                 // 默认英文（可用右上角按钮切中文，选择存 localStorage）
    var listeners = [];

    var stored = null;
    try { stored = window.localStorage.getItem(KEY); } catch (e) { /* 隐私模式 */ }
    var current = (stored === 'en' || stored === 'zh') ? stored : DEFAULT;

    function t(key) {
        var d = I18N[current];
        if (d && Object.prototype.hasOwnProperty.call(d, key)) { return d[key]; }
        var f = I18N.en;
        return (f && f[key] !== undefined) ? f[key] : key;
    }

    /* 把 data-i18n / data-i18n-html 的元素刷一遍 */
    function applyDom() {
        document.documentElement.setAttribute('lang', t('html.lang'));
        document.title = t('doc.title');

        var nodes = document.querySelectorAll('[data-i18n]');
        for (var i = 0; i < nodes.length; i++) {
            nodes[i].textContent = t(nodes[i].getAttribute('data-i18n'));
        }
        nodes = document.querySelectorAll('[data-i18n-html]');
        for (i = 0; i < nodes.length; i++) {
            nodes[i].innerHTML = t(nodes[i].getAttribute('data-i18n-html'));
        }
        nodes = document.querySelectorAll('[data-i18n-title]');
        for (i = 0; i < nodes.length; i++) {
            nodes[i].setAttribute('title', t(nodes[i].getAttribute('data-i18n-title')));
        }
        nodes = document.querySelectorAll('[data-i18n-aria]');
        for (i = 0; i < nodes.length; i++) {
            nodes[i].setAttribute('aria-label', t(nodes[i].getAttribute('data-i18n-aria')));
        }

        document.body.setAttribute('data-lang', current);
    }

    function set(lang) {
        if (lang !== 'zh' && lang !== 'en') { return; }
        current = lang;
        try { window.localStorage.setItem(KEY, lang); } catch (e) { /* 忽略 */ }
        applyDom();
        for (var i = 0; i < listeners.length; i++) {
            try { listeners[i](current); } catch (e) { /* 单个模块出错不影响其它 */ }
        }
    }

    function toggle() { set(current === 'zh' ? 'en' : 'zh'); }

    function onChange(fn) { listeners.push(fn); }

    function init() {
        applyDom();
        var btn = document.getElementById('langToggle');
        if (btn) { btn.addEventListener('click', toggle); }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    return {
        get current() { return current; },
        t: t,
        set: set,
        toggle: toggle,
        onChange: onChange
    };
}());

window.Lang = Lang;
