/*
 * Point-cloud digital twins for the station's field equipment.
 * Geometry is built from simple 3-D parts; submitted photos are separate image decals.
 */
(function () {
  'use strict';

  var W = 2200, H = 1100;
  var scene = document.getElementById('scene');
  var cloudCanvas = document.getElementById('clouds');
  var flowCanvas = document.getElementById('signals');
  var cloudCtx = cloudCanvas.getContext('2d');
  var flowCtx = flowCanvas.getContext('2d');
  var dpr = Math.min(2, window.devicePixelRatio || 1);
  var scale = 1;
  var seed = 41973;

  function rand() {
    seed |= 0;
    seed = seed + 0x6D2B79F5 | 0;
    var t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  }

  var SILVER = [147, 165, 157];
  var STEEL = [91, 116, 104];
  var DARK = [43, 66, 55];
  var GREEN = [48, 120, 78];
  var LEAF = [71, 145, 85];
  var AMBER = [188, 139, 70];
  var CYAN = [45, 137, 179];

  function point(out, x, y, z, color, r) {
    out.push({ x: x, y: y, z: z, c: color, r: r || 1.45 });
  }

  function rod(out, a, b, radius, color, density) {
    var dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
    var len = Math.hypot(dx, dy, dz) || 1;
    var ux = dx / len, uy = dy / len, uz = dz / len;
    var ax = Math.abs(uy) < .86 ? [0, 1, 0] : [1, 0, 0];
    var vx = uy * ax[2] - uz * ax[1], vy = uz * ax[0] - ux * ax[2], vz = ux * ax[1] - uy * ax[0];
    var vl = Math.hypot(vx, vy, vz) || 1; vx /= vl; vy /= vl; vz /= vl;
    var wx = uy * vz - uz * vy, wy = uz * vx - ux * vz, wz = ux * vy - uy * vx;
    var steps = Math.max(3, Math.ceil(len * (density || 31)));
    var around = Math.max(7, Math.ceil(radius * 800));
    var samples = steps * around;
    for (var i = 0; i < samples; i++) {
      var t = rand(), a0 = rand() * Math.PI * 2;
      var rr = radius * (.78 + rand() * .28);
      point(out,
        a[0] + dx * t + (vx * Math.cos(a0) + wx * Math.sin(a0)) * rr,
        a[1] + dy * t + (vy * Math.cos(a0) + wy * Math.sin(a0)) * rr,
        a[2] + dz * t + (vz * Math.cos(a0) + wz * Math.sin(a0)) * rr,
        rand() > .96 ? CYAN : color, 1.05 + rand() * .75);
    }
  }

  function box(out, cx, cy, cz, w, h, d, color, step) {
    step = step || .055;
    var nx = Math.max(2, Math.ceil(w / step)), ny = Math.max(2, Math.ceil(h / step));
    var nz = Math.max(2, Math.ceil(d / step));
    for (var i = 0; i <= nx; i++) for (var j = 0; j <= ny; j++) {
      var x = cx - w / 2 + w * i / nx + (rand()-.5)*step*.32, y = cy - h / 2 + h * j / ny + (rand()-.5)*step*.32;
      point(out, x, y, cz - d / 2, rand() > .92 ? SILVER : color);
      point(out, x, y, cz + d / 2, rand() > .92 ? SILVER : color);
    }
    for (var k = 0; k <= nz; k++) for (var j2 = 0; j2 <= ny; j2++) {
      var z = cz - d / 2 + d * k / nz + (rand()-.5)*step*.32, y2 = cy - h / 2 + h * j2 / ny + (rand()-.5)*step*.32;
      point(out, cx - w / 2, y2, z, color);
      point(out, cx + w / 2, y2, z, color);
    }
    for (var k2 = 0; k2 <= nz; k2++) for (var i2 = 0; i2 <= nx; i2++) {
      var z2 = cz - d / 2 + d * k2 / nz + (rand()-.5)*step*.32, x2 = cx - w / 2 + w * i2 / nx + (rand()-.5)*step*.32;
      point(out, x2, cy - h / 2, z2, color);
      point(out, x2, cy + h / 2, z2, color);
    }
  }

  function disk(out, x, y, z, rx, rz, color, rings) {
    rings = rings || 5;
    for (var k = 0; k < rings; k++) {
      var rr = rx * (k + 1) / rings;
      var n = Math.max(10, Math.ceil(rr * 500));
      for (var i = 0; i < n; i++) {
        var a = i / n * Math.PI * 2;
        point(out, x + Math.cos(a) * rr, y, z + Math.sin(a) * rz * (rr / rx), color, 1.25);
      }
    }
  }

  function tripod(out, y0, y1, spread, z, color) {
    rod(out, [0, y1, z], [-spread, y0, z - spread * .55], .009, color);
    rod(out, [0, y1, z], [ spread, y0, z - spread * .55], .009, color);
    rod(out, [0, y1, z], [0, y0, z + spread], .009, color);
    rod(out, [-spread, y0, z - spread * .55], [spread, y0, z - spread * .55], .006, SILVER);
  }

  function makeModel(kind) {
    var p = [];
    if (kind === 'climate') {
      rod(p, [0, 0, 0], [0, 1, 0], .014, SILVER);
      box(p, 0, .42, 0, .22, .24, .16, STEEL, .035);
      rod(p, [-.46, .77, 0], [.43, .77, 0], .012, SILVER);
      rod(p, [.16, .77, 0], [.16, 1.08, 0], .009, STEEL);
      for (var c = 0; c < 4; c++) disk(p, -.20, .84 + c * .025, .01, .075 - c * .007, .055 - c * .005, SILVER, 2);
      rod(p, [-.43, .77, 0], [-.43, .88, 0], .012, STEEL);
      disk(p, -.43, .91, 0, .035, .035, AMBER, 2);
      rod(p, [-.28, .77, 0], [-.28, .69, 0], .008, STEEL);
      box(p, .10, .32, .04, .14, .10, .08, DARK, .025);
    } else if (kind === 'phenology') {
      rod(p, [-.18, 0, 0], [.04, .88, -.02], .018, SILVER);
      rod(p, [-.18, .22, -.02], [.34, .58, -.02], .024, STEEL);
      rod(p, [.10, .62, 0], [.43, .80, 0], .014, SILVER);
      box(p, .36, .78, .03, .18, .13, .12, DARK, .025);
      rod(p, [.44, .78, .08], [.56, .78, .08], .055, DARK);
      disk(p, .56, .78, .08, .06, .06, CYAN, 3);
      rod(p, [-.28, .31, 0], [.0, .55, 0], .009, AMBER);
    } else if (kind === 'flux') {
      tripod(p, 0, .77, .35, 0, SILVER);
      rod(p, [0, .25, 0], [0, 1.12, 0], .016, STEEL);
      rod(p, [-.45, .95, 0], [.42, .95, 0], .012, SILVER);
      box(p, .24, .61, .02, .15, .11, .08, DARK, .025);
      box(p, -.20, .40, .02, .25, .17, .025, [64, 92, 92], .018);
      for (var f = 0; f < 3; f++) rod(p, [-.37 + f * .10, .98, .02], [-.37 + f * .10, 1.10, .02], .009, CYAN);
      disk(p, .02, 1.10, 0, .05, .05, SILVER, 3);
    } else if (kind === 'deposition') {
      box(p, 0, .30, 0, .62, .40, .42, STEEL, .035);
      box(p, 0, .55, 0, .67, .12, .45, SILVER, .035);
      box(p, -.08, .72, 0, .34, .20, .30, SILVER, .035);
      rod(p, [-.25, .81, 0], [.25, .81, 0], .015, STEEL);
      for (var b = 0; b < 2; b++) {
        rod(p, [-.10 + b * .22, .64, .02], [-.10 + b * .22, .48, .02], .035, [196, 203, 178]);
        disk(p, -.10 + b * .22, .47, .02, .04, .04, SILVER, 2);
      }
      for (var leg = 0; leg < 4; leg++) {
        var lx = leg % 2 ? .25 : -.25, lz = leg > 1 ? .16 : -.16;
        rod(p, [lx * .72, .14, lz * .7], [lx, .02, lz], .012, DARK);
      }
      rod(p, [-.25, .92, 0], [.25, .92, 0], .012, AMBER);
    } else if (kind === 'soil') {
      rod(p, [0, .06, 0], [0, 1.04, 0], .012, SILVER);
      box(p, .03, .68, .02, .21, .18, .14, STEEL, .03);
      rod(p, [-.04, .98, 0], [.04, .98, 0], .02, DARK);
      for (var d = 0; d < 4; d++) rod(p, [0, .10 + d * .10, 0], [.12, .10 + d * .10, 0], .009, CYAN);
      disk(p, 0, .03, 0, .055, .055, DARK, 3);
      rod(p, [.08, .71, .02], [.26, .71, .02], .006, AMBER);
    } else if (kind === 'ghg') {
      disk(p, 0, .18, 0, .30, .24, SILVER, 8);
      rod(p, [-.26, .18, 0], [-.26, .60, 0], .012, STEEL);
      rod(p, [.26, .18, 0], [.26, .60, 0], .012, STEEL);
      rod(p, [-.26, .60, 0], [.26, .60, 0], .012, SILVER);
      disk(p, 0, .62, 0, .24, .19, [167, 183, 172], 7);
      box(p, .32, .47, .04, .20, .19, .15, DARK, .025);
      rod(p, [.22, .54, 0], [.32, .56, .02], .010, AMBER);
      tripod(p, 0, .18, .34, 0, STEEL);
    } else if (kind === 'root') {
      rod(p, [-.12, .02, 0], [-.04, .91, 0], .026, SILVER);
      rod(p, [-.14, .05, 0], [-.06, .88, 0], .010, CYAN);
      box(p, -.04, .85, .02, .16, .10, .11, DARK, .025);
      box(p, .30, .48, .05, .36, .24, .08, DARK, .035);
      box(p, .30, .49, .095, .30, .16, .012, [84, 151, 168], .02);
      rod(p, [.10, .37, .04], [-.04, .36, .02], .008, AMBER);
      for (var r = 0; r < 5; r++) rod(p, [-.03, .28 - r * .045, 0], [.04 + rand() * .12, .24 - r * .05, .01], .004, LEAF);
    } else if (kind === 'dbh') {
      /* A true trunk band model, attached to the central point-cloud tree. */
      rod(p, [0, 0, 0], [0, 1, 0], .035, [105, 83, 61], 55);
      for (var ring = 0; ring < 2; ring++) {
        var yy = .42 + ring * .18;
        for (var s = 0; s < 72; s++) {
          var a = s / 72 * Math.PI * 2;
          point(p, Math.cos(a) * .043, yy, Math.sin(a) * .043, ring ? SILVER : AMBER, 1.8);
          point(p, Math.cos(a) * .052, yy + .015, Math.sin(a) * .052, ring ? SILVER : STEEL, 1.4);
        }
      }
      box(p, .23, .52, 0, .12, .09, .10, DARK, .02);
    } else if (kind === 'lai') {
      tripod(p, 0, .59, .39, 0, STEEL);
      rod(p, [0, .30, 0], [0, .92, 0], .012, SILVER);
      disk(p, 0, .94, 0, .13, .11, DARK, 5);
      disk(p, 0, .98, 0, .085, .075, SILVER, 4);
      box(p, .06, .54, .02, .13, .11, .09, STEEL, .025);
      rod(p, [-.16, .94, 0], [.16, .94, 0], .007, CYAN);
    } else if (kind === 'sapflow') {
      /* Heating wrap, two bands, logger and lead on a full trunk segment. */
      rod(p, [0, 0, 0], [0, 1, 0], .035, [111, 88, 64], 55);
      for (var w = 0; w < 3; w++) {
        var yy2 = .22 + w * .085;
        for (var j = 0; j < 60; j++) {
          var aa = j / 60 * Math.PI * 2;
          point(p, Math.cos(aa) * .047, yy2, Math.sin(aa) * .047, [189, 177, 135], 2.1);
        }
      }
      box(p, -.25, .72, .02, .16, .28, .13, SILVER, .025);
      rod(p, [-.22, .55, .02], [-.05, .46, .20], .009, DARK);
      rod(p, [.21, .25, 0], [.30, .14, .02], .006, AMBER);
    } else if (kind === 'gateway') {
      box(p, 0, .38, 0, .76, .62, .38, [76, 97, 83], .035);
      box(p, 0, .72, .01, .78, .08, .40, SILVER, .03);
      box(p, -.20, .39, .205, .24, .37, .018, [156, 57, 106], .025);
      box(p, .07, .54, .205, .22, .18, .018, [145, 76, 70], .025);
      box(p, .31, .54, .205, .20, .18, .018, [139, 140, 65], .025);
      box(p, .08, .27, .205, .23, .20, .018, [126, 53, 96], .025);
      box(p, .32, .27, .205, .20, .20, .018, [50, 113, 98], .025);
      for (var foot = 0; foot < 4; foot++) {
        var fx = foot % 2 ? .30 : -.30, fz = foot > 1 ? .13 : -.13;
        rod(p, [fx, .08, fz], [fx, .01, fz], .016, DARK);
      }
      rod(p, [.40,.70,0], [.40,.98,0], .018, AMBER);
    }
    return p;
  }

  var defs = [
    { id:'climate', name:'大气气候与环境集成', short:'气象环境', kind:'climate', photo:'img/dev1.webp', x:165, base:770, h:390, p:.60, py:.60, group:'air' },
    { id:'phenology', name:'植物生长节律', short:'物候相机', kind:'phenology', photo:'img/dev2.webp', crop:[250,100,390,500], x:430, base:675, h:260, p:.43, py:.64, group:'canopy' },
    { id:'flux', name:'生态系统能量平衡观测', short:'能量平衡', kind:'flux', photo:'img/dev3.webp', crop:[20,0,275,430], x:650, base:755, h:350, p:.48, py:.78, group:'air' },
    { id:'deposition', name:'干湿沉降采样系统', short:'干湿沉降', kind:'deposition', photo:'img/dev4.webp', x:885, base:775, h:260, p:.58, py:.48, group:'air' },
    { id:'soil', name:'土壤温湿盐自动观测', short:'土壤温湿盐', kind:'soil', photo:'img/dev5.webp', x:1100, base:810, h:225, p:.55, py:.66, group:'soil' },
    { id:'ghg', name:'土壤温室气体自动观测', short:'土壤温室气体', kind:'ghg', photo:'img/dev6.webp', crop:[70,70,500,520], x:1280, base:810, h:225, p:.48, py:.55, group:'soil' },
    { id:'root', name:'根系原位监测', short:'根系原位', kind:'root', photo:'img/dev7.webp', x:1480, base:840, h:260, p:.48, py:.56, group:'soil' },
    { id:'dbh', name:'乔木胸径生长环', short:'胸径生长环', kind:'dbh', photo:'img/dev8.webp', crop:[110,190,390,370], x:980, base:805, h:610, p:.23, py:.54, dx:16, group:'tree', onTree:true },
    { id:'lai', name:'分布式叶面积指数仪', short:'叶面积指数', kind:'lai', photo:'img/dev9.webp', crop:[70,0,260,320], x:1655, base:770, h:285, p:.44, py:.78, group:'canopy' },
    { id:'sapflow', name:'液流与径向生长', short:'液流 · 径向生长', kind:'sapflow', photo:'img/sapflow-radial.png', crop:[82,16,270,590], x:980, base:805, h:610, p:.31, py:.34, dx:37, group:'tree', onTree:true },
    { id:'gateway', name:'数据采集箱', short:'组网 · 数采 · 太阳能 · 4G', kind:'gateway', photo:'img/cabinet.webp', x:1765, base:800, h:295, p:.58, py:.53, group:'network' }
  ];

  function imagesForDefinitions() {
    return defs.map(function (d) {
      return new Promise(function (resolve) {
        var img = new Image();
        img.onload = function () { d.img = img; resolve(true); };
        img.onerror = function () { d.img = null; resolve(false); };
        img.src = d.photo;
      });
    });
  }

  function project(x, y, z, cx, base, unit) {
    var yaw = -.24;
    var px = x * Math.cos(yaw) - z * Math.sin(yaw);
    var depth = x * Math.sin(yaw) + z * Math.cos(yaw);
    return [cx + px * unit, base - y * unit - depth * unit * .16];
  }

  function drawPoints(ctx, points, cx, base, unit, alpha, radiusBoost) {
    ctx.globalAlpha = alpha;
    for (var i = 0; i < points.length; i++) {
      var p = points[i], q = project(p.x, p.y, p.z, cx, base, unit);
      ctx.fillStyle = 'rgb(' + p.c[0] + ',' + p.c[1] + ',' + p.c[2] + ')';
      ctx.beginPath();
      ctx.arc(q[0], q[1], (p.r + (radiusBoost || 0)) * Math.min(1.25, unit / 240), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function makeForestTree(height, seedOffset, leafCount) {
    seed += seedOffset;
    var pts = [];
    rod(pts, [0,0,0], [0,1,0], .035, [111,91,70], 60);
    var tips = [];
    function branch(x,y,z,angle,len,r,depth) {
      var ex = x + Math.cos(angle) * len;
      var ey = y + Math.sin(angle) * len;
      var ez = z + (rand() - .5) * len * .12;
      rod(pts,[x,y,z],[ex,ey,ez],r,[117,97,73],45);
      if (depth <= 0 || len < .065) { tips.push([ex,ey,ez]); return; }
      branch(ex,ey,ez,angle-.56-rand()*.12,len*.72,r*.66,depth-1);
      branch(ex,ey,ez,angle+.58+rand()*.12,len*.72,r*.66,depth-1);
    }
    for (var i = 0; i < 4; i++) branch(0,.46+i*.075,0,Math.PI/2+(i-1.5)*.22,.34,.016,2);
    tips.forEach(function (t) {
      for (var i = 0; i < (leafCount || 65); i++) {
        var a = rand() * Math.PI * 2, rr = Math.pow(rand(), .55) * .17;
        point(pts, t[0] + Math.cos(a)*rr, t[1] + (rand()-.5)*.19, t[2] + Math.sin(a)*rr,
              rand() > .78 ? [91,145,82] : [55,125,72], .8 + rand()*.7);
      }
    });
    return { points:pts, height:height };
  }

  var forest = [
    {x:40, base:770, h:330, seed:101, a:.25, leaves:42},
    {x:480, base:770, h:390, seed:202, a:.34, leaves:54},
    {x:995, base:805, h:610, seed:404, a:.72, leaves:78},
    {x:1510, base:770, h:370, seed:505, a:.30, leaves:48}
  ];

  var modelPoints = {};
  defs.forEach(function (d) { modelPoints[d.id] = makeModel(d.kind); });

  function drawPhoto(ctx, d) {
    if (!d.img) return false;
    var source = d.crop || [0,0,d.img.naturalWidth,d.img.naturalHeight];
    var sw = Math.min(source[2], d.img.naturalWidth - source[0]);
    var sh = Math.min(source[3], d.img.naturalHeight - source[1]);
    var ph = d.h * d.p;
    var pw = ph * sw / sh;
    var cx = d.x + (d.dx || 0);
    var cy = d.base - d.h * d.py;
    ctx.save();
    ctx.globalAlpha = 1;
    ctx.shadowColor = 'rgba(250,253,248,.92)';
    ctx.shadowBlur = 9;
    ctx.drawImage(d.img, source[0], source[1], sw, sh, cx - pw/2, cy - ph/2, pw, ph);
    ctx.restore();
    return true;
  }

  function addLabels() {
    var host = document.getElementById('labels');
    var adjusted = {
      climate:[7.8,48], phenology:[20,52], flux:[30.1,44], deposition:[40.5,50],
      soil:[50.4,65], ghg:[58.7,65], root:[68,71], dbh:[45.5,72], lai:[77,57],
      sapflow:[47.2,59], gateway:[84.1,50]
    };
    defs.forEach(function (d) {
      var pos = adjusted[d.id];
      var el = document.createElement('div');
      el.className = 'label' + (d.onTree ? ' sensor' : '');
      el.style.left = pos[0] + '%'; el.style.top = pos[1] + '%';
      el.innerHTML = '<strong>' + d.short + '</strong>' + (d.onTree ? '<small>树干传感器</small>' : '');
      host.appendChild(el);
    });
  }

  function resize() {
    var w = scene.clientWidth || 1;
    var h = w * H / W;
    scale = w / W;
    [cloudCanvas, flowCanvas].forEach(function (c) {
      c.width = Math.round(w * dpr);
      c.height = Math.round(h * dpr);
    });
    drawStatic();
  }

  function drawStatic() {
    cloudCtx.setTransform(dpr * scale,0,0,dpr * scale,0,0);
    cloudCtx.clearRect(0,0,W,H);

    /* Ground and a quiet soil cutaway. */
    var g = cloudCtx.createLinearGradient(0,730,0,930);
    g.addColorStop(0,'rgba(186,211,190,0)');
    g.addColorStop(.34,'rgba(182,207,186,.34)');
    g.addColorStop(1,'rgba(217,230,214,.03)');
    cloudCtx.fillStyle = g; cloudCtx.fillRect(0,730,W,200);
    cloudCtx.strokeStyle = 'rgba(126,165,140,.38)'; cloudCtx.lineWidth = 1.2;
    cloudCtx.beginPath(); cloudCtx.moveTo(0,770); cloudCtx.lineTo(W,770); cloudCtx.stroke();

    /* Background forest points. */
    forest.forEach(function (t) {
      var tree = makeForestTree(t.h,t.seed,t.leaves);
      drawPoints(cloudCtx,tree.points,t.x,t.base,t.h,t.a,.25);
    });

    /* Equipment point-cloud models, then their real photograph patches. */
    defs.forEach(function (d) {
      drawPoints(cloudCtx,modelPoints[d.id],d.x,d.base,d.h,.94,.55);
    });
    defs.forEach(function (d) { d.photoAnchored = drawPhoto(cloudCtx,d); });

    /* Small ground footprints keep the devices seated in the field. */
    defs.filter(function (d) { return !d.onTree; }).forEach(function (d) {
      var rad = Math.max(12,d.h*.13);
      var shadow = cloudCtx.createRadialGradient(d.x,d.base+5,1,d.x,d.base+5,rad);
      shadow.addColorStop(0,'rgba(30,65,43,.15)'); shadow.addColorStop(1,'rgba(30,65,43,0)');
      cloudCtx.fillStyle=shadow; cloudCtx.beginPath(); cloudCtx.ellipse(d.x,d.base+5,rad,8,0,0,Math.PI*2); cloudCtx.fill();
    });

    /* Real cabinet image sits on its separately modelled point-cloud enclosure. */
    cloudCtx.strokeStyle='rgba(42,127,184,.25)'; cloudCtx.lineWidth=1.5;
    cloudCtx.beginPath(); cloudCtx.moveTo(1825,770); cloudCtx.lineTo(1825,635); cloudCtx.lineTo(1970,635); cloudCtx.stroke();
  }

  var paths = [
    [[185,760],[430,675],[760,700],[1030,700]],
    [[430,675],[900,565],[1210,640],[1510,790]],
    [[1100,810],[1390,850],[1710,790]],
    [[1030,700],[1370,735],[1710,790]],
    [[1880,770],[1960,730],[2050,700]]
  ];

  function drawSignals(now) {
    var ctx=flowCtx, t=now/1000;
    ctx.setTransform(dpr*scale,0,0,dpr*scale,0,0);
    ctx.clearRect(0,0,W,H);
    ctx.lineWidth=1.35;
    ctx.strokeStyle='rgba(36,124,172,.18)';
    paths.forEach(function (path) {
      ctx.beginPath(); ctx.moveTo(path[0][0],path[0][1]);
      for (var i=1;i<path.length;i++) ctx.lineTo(path[i][0],path[i][1]);
      ctx.stroke();
    });
    paths.forEach(function (path,pi) {
      var lengths=[],total=0;
      for (var i=1;i<path.length;i++) { var len=Math.hypot(path[i][0]-path[i-1][0],path[i][1]-path[i-1][1]); lengths.push(len); total+=len; }
      var count=Math.max(2,Math.round(total/105));
      for (var k=0;k<count;k++) {
        var dist=((t*.13+k/count+pi*.19)%1)*total,acc=0,s=0;
        while(s<lengths.length-1 && acc+lengths[s]<dist){acc+=lengths[s++];}
        var u=(dist-acc)/(lengths[s]||1);
        var x=path[s][0]+(path[s+1][0]-path[s][0])*u;
        var y=path[s][1]+(path[s+1][1]-path[s][1])*u;
        ctx.globalAlpha=.38+.62*Math.sin(u*Math.PI);
        ctx.fillStyle='#247cac'; ctx.beginPath(); ctx.arc(x,y,2.4,0,Math.PI*2); ctx.fill();
      }
    });
    ctx.globalAlpha=1;
    requestAnimationFrame(drawSignals);
  }

  Promise.all(imagesForDefinitions()).then(function () {
    addLabels();
    resize();
    window.addEventListener('resize',resize);
    window.DeviceTwin={inventory:defs.map(function (d) {
      return {id:d.id,points:modelPoints[d.id].length,photoLoaded:!!d.img,photoAnchored:!!d.photoAnchored,canvasHasInk:modelPoints[d.id].length>0};
    })};
    requestAnimationFrame(drawSignals);
  });
})();
