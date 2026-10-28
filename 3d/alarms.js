/* 真实批次报警；场景投影/相机沿用现有 Potree，不依赖全局 THREE。 */
(function () {
    'use strict';
    var VERSION = '20261028-wrap117';
    var data = null, failure = false, opened = false, tab = 'active', selected = null;
    var groupIds = null, pins = [], positions = {}, byId = {}, flight = null, pendingLocate = null, lastFrame = 0;
    var btn = document.getElementById('alarmBtn'), count = document.getElementById('alarmCount');
    var panel = document.getElementById('alarmPanel'), content = document.getElementById('alarmContent');
    var title = document.getElementById('alarmTitle'), batch = document.getElementById('alarmBatch');
    var closeBtn = document.getElementById('alarmClose');
    var motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    function zh() { return typeof LANG === 'undefined' || LANG === 'zh'; }
    function tr(cn, en) { return zh() ? cn : en; }
    function icon(name) {
        var paths = {
            sensor: '<rect x="6" y="5" width="12" height="14" rx="3"/><path d="M9 2v3m6-3v3M9 19v3m6-3v3M2 9h4m-4 6h4m12-6h4m-4 6h4"/><circle cx="12" cy="12" r="2.5"/>',
            locate: '<circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2"/><path d="M12 1v4m0 14v4M1 12h4m14 0h4"/>',
            chart: '<path d="M3 3v18h18M6 15l4-5 4 3 6-8"/>',
            sapflow: '<path d="M12 3C9 7 5 11 5 15a7 7 0 0 0 14 0c0-4-4-8-7-12Z"/><path d="M9 16a3 3 0 0 0 3 3"/>',
            radial: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/><path d="m16 8 4-4"/>'
        };
        return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
            (paths[name] || paths.sensor) + '</svg>';
    }
    function esc(s) { return String(s).replace(/[&<>"']/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    }); }
    function date(ms) {
        if (ms == null) return tr('本批无有效记录', 'No valid record in this batch');
        return new Date(ms + data.timezoneOffsetMin * 60000).toISOString().slice(0, 16).replace('T', ' ');
    }
    function tree(id) { return (typeof TREES !== 'undefined' ? TREES : []).filter(function (t) { return t.id === id; })[0]; }
    function locationText(id) {
        var t = tree(id), plot = t && PLOTS[t.plot];
        return plot ? (zh() ? plot.nameZh : plot.name) : id.slice(0, 3);
    }
    function speciesText(id) { var t = tree(id); return t ? (zh() ? t.speciesZh : t.commonName) : ''; }
    function channelName(key) { return key === 'sapflow' ? tr('液流', 'Sap flow') : tr('径向生长', 'Dendrometer'); }
    function events(p, history) {
        var out = [];
        Object.keys(p.channels).forEach(function (key) {
            p.channels[key].events.forEach(function (e) {
                var isHistory = e.state === 'recovered' || e.state === 'corrected';
                if (isHistory === history) out.push({ key: key, event: e });
            });
        });
        return out.sort(function (a, b) { return b.event.start - a.event.start; });
    }
    function eventTitle(e) {
        if (e.kind === 'confirmedFault') return tr('已确认故障 · 回绕订正待核查', 'Confirmed fault · inferred wrap correction under review');
        if (e.kind === 'correctedStep') return tr('读数阶跃 · 已订正', 'Reading step · corrected');
        if (e.kind === 'noData') return tr('本批无有效数据 · 待核查', 'No valid batch data · review required');
        if (e.kind === 'invalid') return tr('无效读数 · 待核查', 'Invalid readings · review required');
        return e.state === 'recovered' ? tr('连续缺测 · 后续记录已恢复', 'Data gap · records resumed') :
            tr('批次末连续缺测 · 待核查', 'Missing records at batch end · review required');
    }
    function statusText(status) {
        return status === 'critical' ? tr('已确认故障', 'Confirmed fault') : status === 'warning' ?
            tr('待核查', 'Review required') : tr('本批未触发报警', 'No batch alarm');
    }
    function paintHeader() {
        document.getElementById('alarmLabel').textContent = tr('设备报警', 'Device alerts');
        title.textContent = tr('设备报警', 'Device alerts');
        var eyebrow = document.getElementById('alarmEyebrow');
        if (eyebrow) eyebrow.textContent = tr('森林观测 · 设备状态', 'FOREST OBSERVATORY / DEVICE STATUS');
        closeBtn.setAttribute('aria-label', tr('关闭设备报警', 'Close device alerts'));
        count.textContent = data ? data.summary.activePoints : failure ? '!' : '…';
        count.setAttribute('aria-label', data ? tr(data.summary.activePoints + ' 个异常点位',
            data.summary.activePoints + ' affected locations') : tr('报警数据状态', 'Alert data status'));
        btn.setAttribute('aria-label', data ?
            tr('设备报警，' + data.summary.activePoints + ' 个异常点位', 'Device alerts, ' + data.summary.activePoints + ' affected locations') :
            tr('设备报警', 'Device alerts'));
        batch.innerHTML = data ? tr('数据快照 · 截至 ', 'Data snapshot · as of ') +
            '<strong>' + date(data.asOf) + '</strong> UTC+8' : '';
    }
    function rulesHtml() {
        return '<details class="alarm-rules"><summary>' + tr('报警依据与时间范围', 'Rules and data period') + '</summary><p>' +
            tr('仅评估 20 个监测点的液流与径向两路观测。', 'Only sap flow and dendrometer records at the 20 monitored locations are assessed.') +
            '</p><p>' + esc(date(data.span[0])) + ' — ' + esc(date(data.asOf)) + ' UTC+8</p><p>' +
            tr('采样间隔 30 分钟；连续缺少至少 2 次记录才记为缺测。以各通道数据截止时间判断是否仍异常，已恢复和已订正事件只列入历史。',
               'Samples are 30 minutes apart. At least 2 consecutive missing samples form a gap. Status is evaluated at each channel’s data cutoff; resumed and corrected events are history.') +
            '</p><p>' + tr('已确认故障来源：项目预处理脚本的人工核实记录。数据缺测本身不判定为设备损坏。',
                'Confirmed faults come from verified preprocessing records. A data gap alone does not establish hardware failure.') +
            '</p></details>';
    }
    function card(p) {
        var list = events(p, tab === 'history'), first = list[0];
        return '<button type="button" class="alarm-point ' + (tab === 'active' ? p.status : '') +
            '" data-point="' + esc(p.id) + '"><span class="alarm-card-top"><span class="alarm-device-icon">' +
            icon('sensor') + '</span><span class="alarm-identity"><strong>' + esc(p.id) + '</strong><small>' +
            esc(locationText(p.id)) + ' · ' + esc(speciesText(p.id)) + '</small></span><span class="alarm-severity">' +
            (tab === 'history' ? tr('历史', 'HISTORY') : p.status === 'critical' ? tr('故障', 'FAULT') : tr('预警', 'REVIEW')) +
            '</span></span><span class="alarm-row"><span class="alarm-status ' +
            (tab === 'history' ? 'history' : p.status) + '">' + (first ? esc(channelName(first.key)) + ' · ' +
                esc(eventTitle(first.event)) : '') + '</span></span>' +
            '<span class="alarm-card-foot"><small>' + list.length + tr(' 条记录', ' records') + '</small><span>' +
            tr('定位并查看详情', 'Locate & inspect') + '<span aria-hidden="true"> ↗</span></span></span></button>';
    }
    function coverageHtml() {
        var channels = [];
        data.points.forEach(function (p) {
            Object.keys(p.channels).forEach(function (key) { channels.push(p.channels[key].status); });
        });
        channels.sort(function (a, b) { return (a === 'ok' ? -1 : 1) - (b === 'ok' ? -1 : 1); });
        var ok = channels.filter(function (s) { return s === 'ok'; }).length;
        return '<div class="alarm-coverage"><div><span>' + tr('批次通道状态', 'BATCH CHANNEL STATUS') +
            '</span><span>' + ok + ' / ' + channels.length + ' ' + tr('未触发报警', 'without alarms') +
            '</span></div><div class="alarm-segments" aria-hidden="true">' +
            channels.map(function (s) { return '<i class="' + s + '"></i>'; }).join('') + '</div></div>';
    }
    function renderList() {
        var list = data.points.filter(function (p) {
            return (tab === 'active' ? p.status !== 'ok' : events(p, true).length > 0) &&
                (!groupIds || groupIds.indexOf(p.id) >= 0);
        });
        list.sort(function (a, b) { return (a.status === 'critical' ? -1 : 0) - (b.status === 'critical' ? -1 : 0); });
        content.innerHTML = '<div class="alarm-summary"><div><b>' + data.summary.activePoints + '</b><small>' +
            tr('异常点位', 'Affected locations') + '</small></div><div><b>20</b><small>' +
            tr('监测点位', 'Locations') + '</small></div><div><b>40</b><small>' +
            tr('监测通道', 'Channels') + '</small></div></div>' + coverageHtml() + '<div class="alarm-tabs" role="group" aria-label="' +
            tr('报警记录筛选', 'Filter records') + '"><button type="button" data-tab="active" aria-pressed="' +
            (tab === 'active') + '">' + tr('批次末异常', 'Batch-end alerts') + ' ' + data.summary.activePoints +
            '</button><button type="button" data-tab="history" aria-pressed="' + (tab === 'history') + '">' +
            tr('历史记录', 'History') + ' ' + data.summary.historyPoints + '</button></div>' +
            (groupIds ? '<button class="alarm-back" type="button" data-action="all">' + tr('← 显示全部异常点位', '← All affected locations') + '</button>' : '') +
            (list.length ? list.map(card).join('') : '<p class="alarm-empty">' +
                tr('此筛选下没有报警记录。', 'No records match this filter.') + '</p>') + rulesHtml();
    }
    function eventHtml(e) {
        var text = '';
        if (e.kind === 'confirmedFault') text = tr(
            '项目记录：读数在 0 与 175.926 mm 间异常跳变。曲线按 175.926 mm 回绕推定订正并标注待核查；原始读数保留，报警不自动解除。',
            'Project record: readings jumped between 0 and 175.926 mm. The chart applies an inferred 175.926 mm wrap correction, marked for review; raw readings are retained and the alert stays active.');
        if (e.kind === 'correctedStep') text = tr('已按人工核实记录订正阶跃：', 'Verified step correction: ') +
            (e.offsetUm / 1000).toFixed(4) + ' mm';
        if (e.kind === 'gap') text = tr('连续缺少 ', 'Consecutive missing samples: ') + e.missing +
            tr(' 次预期记录。', '.');
        if (e.kind === 'noData') text = tr('本批未包含该路有效观测，具体原因待核查。', 'No valid observations for this channel in the batch; cause requires review.');
        if (e.kind === 'invalid') text = e.count + tr(' 条无效读数。', ' invalid readings.');
        return '<div class="alarm-event"><b>' + esc(eventTitle(e)) + '</b><p><time>' + date(e.start) +
            (e.end && e.end !== e.start ? ' → ' + date(e.end) : e.state === 'active' ? ' → ' + tr('批次末', 'batch end') : '') +
            '</time></p><p>' + esc(text) + '</p>' +
            (e.state === 'recovered' ? '<p class="alarm-note">' +
                tr('上述终点为恢复记录的时刻，缺测原因未据此推定。', 'The end time marks the next valid record; the cause is not inferred.') + '</p>' : '') +
            (e.start < data.span[0] ? '<p class="alarm-note">' + tr('事件开始于当前公开窗口之前。', 'This event began before the current public window.') + '</p>' : '') + '</div>';
    }
    function renderDetail() {
        var p = byId[selected];
        if (!p) { selected = null; renderList(); return; }
        content.innerHTML = '<button class="alarm-back" type="button" data-action="back">' +
            tr('← 返回设备列表', '← Back to locations') + '</button><h3 class="alarm-detail-title">' + esc(p.id) +
            '</h3><p class="alarm-sub">' + esc(locationText(p.id)) + ' · ' + esc(speciesText(p.id)) +
            '</p><div class="alarm-actions"><button class="alarm-action" type="button" data-action="locate">' +
            icon('locate') + tr('定位设备', 'Locate') + '</button><button class="alarm-action" type="button" data-action="chart">' +
            icon('chart') + tr('查看监测数据', 'View data') + '</button></div>' +
            Object.keys(p.channels).map(function (key) {
                var c = p.channels[key], active = c.events.filter(function (e) { return e.state !== 'recovered' && e.state !== 'corrected'; });
                return '<section class="alarm-channel ' + c.status + '"><h3><span class="alarm-channel-title">' + icon(key) + channelName(key) + '</span>' +
                    '<span class="alarm-status ' + (c.status === 'ok' ? 'history' : c.status) + '">' + statusText(c.status) +
                    '</span></h3><p class="alarm-note">' + tr('本批有效记录：', 'Valid batch records: ') + c.samples +
                    '</p><p class="alarm-note">' + tr('本通道数据截至：', 'Channel data through: ') + date(c.asOf || data.asOf) + '</p>' +
                    '<p class="alarm-note">' + tr('最近有效数据：', 'Last valid record: ') + date(c.lastValid) + '</p>' +
                    (c.suspectSamples ? '<p class="alarm-note">' + tr('待核查的订正记录：', 'Corrected records under review: ') + c.suspectSamples + '</p>' : '') +
                    active.map(eventHtml).join('') + '</section>';
            }).join('') +
            (events(p, true).length ? '<h3 class="alarm-detail-title">' + tr('历史记录', 'History') +
                '</h3>' + events(p, true).map(function (row) { return '<section class="alarm-channel"><b>' +
                    channelName(row.key) + '</b>' + eventHtml(row.event) + '</section>'; }).join('') : '') +
            (p.status !== 'ok' ? '<p class="alarm-note">' +
                tr('建议核查对应传感器、接线及采集记录；此处状态对应上述数据批次。', 'Inspect the relevant sensor, wiring and acquisition records. Status refers to the batch shown above.') + '</p>' : '') +
            rulesHtml();
    }
    function render() {
        paintHeader();
        if (!opened) return;
        placePanel();
        if (!data) {
            content.innerHTML = '<p class="alarm-empty">' + (failure ?
                tr('报警数据加载失败，请重试。', 'Could not load the alert snapshot. Please retry.') :
                tr('正在读取报警快照…', 'Loading alert snapshot…')) + '</p>' +
                (failure ? '<button class="alarm-action" type="button" data-action="retry">' + tr('重试', 'Retry') + '</button>' : '');
        } else if (selected) renderDetail(); else renderList();
    }
    function setOpen(value) {
        opened = value;
        panel.hidden = !value;
        btn.setAttribute('aria-expanded', String(value));
        document.body.classList.toggle('alarms-open', value);
        if (value) {
            document.getElementById('treePop').classList.remove('open');
            hideTreeCard(); hideTip();
            placePanel(); render();
        } else {
            flight = null; pendingLocate = null; groupIds = null;
            pins.forEach(function (p) { p.hidden = true; });
        }
    }
    function placePanel() {
        panel.style.setProperty('--alarm-top', Math.max(62, document.getElementById('topbar').getBoundingClientRect().bottom + 6) + 'px');
    }
    function preparePositions() {
        data.points.forEach(function (p) {
            byId[p.id] = p;
            var d = DEVICES.sapflow.filter(function (v) { return v.name === p.id; })[0], t = tree(p.id);
            if (!d || !t) throw new Error('Missing device position: ' + p.id);
            var en = proj4('EPSG:4326', 'EPSG:32650', [d.lon, d.lat]);
            positions[p.id] = { E: en[0], N: en[1], Z: d.z || 0 };
        });
    }
    function ground(p) {
        var z = typeof window.groundZ === 'function' ? window.groundZ(p.E, p.N) : NaN;
        return isFinite(z) ? z : p.Z;
    }
    function locate(id) {
        var p = positions[id];
        if (!p || !viewer || !viewer.scene) return;
        if (!window.__allLoaded) { pendingLocate = id; return; }
        pendingLocate = null;
        camStopNow();
        if (STA_ACTIVE) { flyStation(null); renderStaBar(); }
        var v = viewer.scene.view, from = camPoseNow(v), z = ground(p);
        var mobile = innerWidth <= 700, offset = mobile ? 0 : panel.getBoundingClientRect().width / innerWidth * 155;
        var to = { p: [p.E, p.N - 145, z + 150],
                   t: [p.E + offset, p.N - (mobile ? 30 : 0), z - (mobile ? 32 : -8)] };
        if (motion.matches) { camApply(v, to.p, to.t); flight = null; }
        else flight = { from: from, to: to, start: performance.now() };
    }
    function choose(id, focus) {
        if (!byId[id]) return;
        selected = id; setOpen(true);
        content.scrollTop = 0;
        content.querySelector('.alarm-back').focus({ preventScroll: true });
        if (focus) locate(id);
    }
    function makePin() {
        var el = document.createElement('button');
        el.type = 'button'; el.className = 'alarm-pin'; el.hidden = true;
        el.innerHTML = '<i class="alarm-orbit" aria-hidden="true"></i><i class="alarm-plinth" aria-hidden="true"></i>' +
            '<span aria-hidden="true">!</span><em class="alarm-pin-id" aria-hidden="true"></em><small aria-hidden="true" hidden></small>';
        el.addEventListener('click', function (e) {
            e.stopPropagation();
            if (el.alarmIds.length === 1) choose(el.alarmIds[0], false);
            else { selected = null; groupIds = el.alarmIds.slice(); tab = 'active'; render(); }
        });
        document.getElementById('labels').appendChild(el);
        pins.push(el); return el;
    }
    function update(now) {
        if (!opened || !data) return;
        if (STA_ACTIVE) { flight = null; pins.forEach(function (el) { el.hidden = true; }); return; }
        if (pendingLocate && window.__allLoaded) locate(pendingLocate);
        if (CAM.on) flight = null;
        if (flight) {
            var u = Math.min(1, (now - flight.start) / 1000), k = u * u * (3 - 2 * u);
            camApply(viewer.scene.view,
                flight.from.p.map(function (v, i) { return v + (flight.to.p[i] - v) * k; }),
                flight.from.t.map(function (v, i) { return v + (flight.to.t[i] - v) * k; }));
            if (u === 1) flight = null;
        }
        if (now - lastFrame < 32) return;
        lastFrame = now;
        var cam = viewer.scene.getActiveCamera(), groups = [];
        if (!cam) { pins.forEach(function (el) { el.hidden = true; }); return; }
        var V = cam.matrixWorldInverse.elements, P = cam.projectionMatrix.elements;
        data.points.forEach(function (p) {
            if (p.status === 'ok' && p.id !== selected) return;
            var pos = positions[p.id], z = ground(pos);
            var xy = projXYZ(V, P, pos.E, pos.N, z + 12);
            if (!xy || xy[0] < 15 || xy[0] > innerWidth - 15 || xy[1] < 70 || xy[1] > innerHeight - 10) return;
            var group = groups.filter(function (g) { return Math.hypot(g.x - xy[0], g.y - xy[1]) < 42; })[0];
            if (group) { group.ids.push(p.id); if (p.status === 'critical') group.status = 'critical'; }
            else groups.push({ x: xy[0], y: xy[1], ids: [p.id], status: p.status });
        });
        groups.forEach(function (g, i) {
            var el = pins[i] || makePin();
            el.alarmIds = g.ids;
            el.className = 'alarm-pin ' + (g.status === 'ok' ? 'history' : g.status) +
                (g.ids.indexOf(selected) >= 0 ? ' selected' : '');
            el.style.left = Math.round(g.x) + 'px'; el.style.top = Math.round(g.y) + 'px';
            var label = g.ids.join(', ') + ' · ' + (g.status === 'ok' ? tr('历史记录', 'History') : statusText(g.status));
            el.setAttribute('aria-label', label); el.title = label;
            el.querySelector('small').hidden = g.ids.length === 1;
            el.querySelector('small').textContent = g.ids.length;
            el.querySelector('.alarm-pin-id').textContent = g.ids.length === 1 ? g.ids[0].split('-').pop() : '';
            el.hidden = false;
        });
        pins.slice(groups.length).forEach(function (el) { el.hidden = true; });
    }
    function load() {
        failure = false; render();
        fetch('alarms.json?v=' + VERSION, { cache: 'no-cache' }).then(function (r) {
            if (!r.ok) throw new Error('HTTP ' + r.status);
            return r.json();
        }).then(function (d) {
            if (d.schemaVersion !== 1 || d.source !== 'measured' || !Array.isArray(d.points) ||
                d.points.length !== 20 || !d.summary || !Number.isFinite(d.asOf)) throw new Error('Invalid alert snapshot');
            data = d; preparePositions(); render();
        }).catch(function () { data = null; failure = true; render(); });
    }
    btn.addEventListener('click', function () {
        if (!opened) { selected = null; tab = 'active'; groupIds = null; }
        setOpen(!opened);
    });
    closeBtn.addEventListener('click', function () { setOpen(false); btn.focus(); });
    content.addEventListener('click', function (e) {
        var b = e.target.closest('button'); if (!b) return;
        if (b.dataset.point) { choose(b.dataset.point, true); return; }
        if (b.dataset.tab) {
            tab = b.dataset.tab; selected = null; groupIds = null; render();
            content.querySelector('[data-tab="' + tab + '"]').focus({ preventScroll: true }); return;
        }
        var action = b.dataset.action;
        if (action === 'back' || action === 'all') {
            var previous = selected;
            selected = null; groupIds = null; render();
            var target = previous && content.querySelector('[data-point="' + previous + '"]');
            if (target) target.focus({ preventScroll: true });
        }
        if (action === 'locate') locate(selected);
        if (action === 'chart') showTreePopup(selected);
        if (action === 'retry') load();
    });
    document.getElementById('layersBtn').addEventListener('click', function () { if (opened) setOpen(false); }, true);
    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && opened) {
            if (document.getElementById('treePop').classList.contains('open')) {
                document.getElementById('treePop').classList.remove('open');
            } else { setOpen(false); btn.focus(); }
        }
    });
    ['pointerdown', 'wheel', 'touchstart'].forEach(function (type) {
        document.getElementById('potree_render_area').addEventListener(type, function () {
            flight = null; pendingLocate = null;
        }, { passive: true });
    });
    window.addEventListener('resize', placePanel);
    window.DeviceAlarms = {
        update: update,
        refreshLanguage: render,
        visualState: function () {
            var id = selected;
            if (!id && data) {
                var active = data.points.filter(function (p) { return p.status !== 'ok'; });
                if (active.length) id = active[0].id;
            }
            return {
                visible: opened && !!data && !STA_ACTIVE && !document.getElementById('treePop').classList.contains('open'),
                selected: !!selected, id: id,
                point: id ? byId[id] : null, position: id ? positions[id] : null
            };
        },
        handleDeviceClick: function (hit) {
            var id = hit && hit.tree;
            if (!opened || !data || !id || !byId[id] || (byId[id].status === 'ok' && id !== selected)) return false;
            choose(id, false); return true;
        }
    };
    load();
}());
