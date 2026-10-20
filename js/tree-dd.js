/* 树木选择器：把原生 <select> 换成自绘下拉
 * ---------------------------------------------------------------------------
 * 为什么不用原生 select：<option> 里不能放标签，也无法只给一部分文字设样式，
 * 所以"只有拉丁名斜体"是做不到的。这里用一个外观相同的自绘下拉，
 * 把每项文字拆成「编号 · 中文名」+「斜体拉丁名」两段。
 *
 * 兼容：原来的 <select id="treeSelect"> 保留（隐藏），选中后写回它的 value
 * 并派发 change —— chart.js / 树信息卡的所有既有逻辑照旧工作。
 */
(function () {
    'use strict';

    /* 把 "... 五角枫 Acer pictum subsp. mono" 拆成 ["... 五角枫 ", "Acer pictum subsp. mono"] */
    function splitLatin(txt) {
        var m = /^(.*?)((?:[A-Z][a-z]+)(?:\s+[a-z][a-z.\-]*)*)\s*$/.exec(txt);
        if (!m) { return [txt, '']; }
        return [m[1], m[2]];
    }

    function build() {
        var sel = document.getElementById('treeSelect');
        if (!sel || sel.dataset.dd === '1' || !sel.options.length) { return; }
        sel.dataset.dd = '1';

        var wrap = document.createElement('div');
        wrap.className = 'tree-dd';
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'tree-dd-btn';
        var list = document.createElement('div');
        list.className = 'tree-dd-list';
        wrap.appendChild(btn);
        wrap.appendChild(list);
        sel.parentNode.insertBefore(wrap, sel);
        sel.style.display = 'none';

        function paintBtn() {
            var o = sel.options[sel.selectedIndex];
            btn.textContent = o ? o.textContent : '';
            btn.title = o ? o.textContent : '';
        }

        function addItem(o) {
            var it = document.createElement('div');
            it.className = 'tree-dd-item' + (o.selected ? ' on' : '');
            var sp = splitLatin((o.textContent || '').trim());
            it.appendChild(document.createTextNode(sp[0]));
            if (sp[1]) {
                var em = document.createElement('i');
                em.textContent = sp[1];
                it.appendChild(em);
            }
            it.addEventListener('click', function () {
                sel.value = o.value;
                sel.dispatchEvent(new Event('change', { bubbles: true }));
                paintBtn();
                list.classList.remove('open');
            });
            list.appendChild(it);
        }

        function renderList() {
            list.innerHTML = '';
            Array.prototype.forEach.call(sel.children, function (node) {
                if (node.tagName === 'OPTGROUP') {
                    var h = document.createElement('div');
                    h.className = 'tree-dd-group';
                    h.textContent = node.label;
                    list.appendChild(h);
                    Array.prototype.forEach.call(node.children, function (o) { addItem(o); });
                } else if (node.tagName === 'OPTION') {
                    addItem(node);
                }
            });
        }

        btn.addEventListener('click', function (e) {
            e.stopPropagation();
            if (list.classList.contains('open')) {
                list.classList.remove('open');
            } else {
                renderList();
                list.classList.add('open');
            }
        });
        document.addEventListener('click', function (e) {
            if (!wrap.contains(e.target)) { list.classList.remove('open'); }
        });
        sel.addEventListener('change', paintBtn);

        renderList();
        paintBtn();
    }

    /* chart.js 建图时才会填充选项，这里等它填好 */
    var tries = 0;
    var t = setInterval(function () {
        var sel = document.getElementById('treeSelect');
        if (sel && sel.options.length) {
            clearInterval(t);
            build();
        } else if (++tries > 150) {
            clearInterval(t);
        }
    }, 200);
}());
