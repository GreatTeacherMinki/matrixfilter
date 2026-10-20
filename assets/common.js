/* 행렬 필터 연구소 - 공통 스크립트
 * 사진 불러오기, 샘플 사진, 필터 엔진, 필터 코드(저장/복원), 행렬 표 그리기
 * 모든 계산은 학생 브라우저 안에서만 이루어지며 서버로 아무것도 보내지 않는다.
 */
(function () {
  const MF = {};
  const MAX_SIDE = 800; // 처리 속도를 위해 긴 변을 800px 이하로 줄인다

  MF.clamp = v => (v < 0 ? 0 : v > 255 ? 255 : v);
  MF.round = (v, d = 2) => Math.round(v * 10 ** d) / 10 ** d;

  /* ---------- 캔버스 도우미 ---------- */
  MF.makeCanvas = (w, h) => {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    return c;
  };
  MF.copyCanvas = src => {
    const c = MF.makeCanvas(src.width, src.height);
    c.getContext('2d').drawImage(src, 0, 0);
    return c;
  };
  MF.ctx = c => c.getContext('2d', { willReadFrequently: true });
  MF.draw = (target, src) => {
    target.width = src.width; target.height = src.height;
    target.getContext('2d').drawImage(src, 0, 0);
  };
  MF.fit = (img, max = MAX_SIDE) => {
    const w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
    const s = Math.min(1, max / Math.max(w, h));
    const c = MF.makeCanvas(Math.max(1, Math.round(w * s)), Math.max(1, Math.round(h * s)));
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    return c;
  };
  MF.loadFile = file => new Promise((resolve, reject) => {
    if (!file || !file.type.startsWith('image/')) { reject(new Error('이미지 파일을 골라주세요.')); return; }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { resolve(MF.fit(img)); URL.revokeObjectURL(url); };
    img.onerror = () => { reject(new Error('이 사진은 열 수 없어요. JPG나 PNG 파일로 다시 시도해 보세요.')); URL.revokeObjectURL(url); };
    img.src = url;
  });

  /* ---------- 샘플 사진: 노을 + 빨강·초록·파랑 풍선 ---------- */
  MF.sampleCanvas = function (w = 640, h = 420) {
    const c = MF.makeCanvas(w, h), x = c.getContext('2d');
    let g = x.createLinearGradient(0, 0, 0, h * 0.62);
    g.addColorStop(0, '#2b3a8c'); g.addColorStop(0.5, '#c8579b'); g.addColorStop(1, '#ffb36b');
    x.fillStyle = g; x.fillRect(0, 0, w, h);

    const sx = w * 0.68, sy = h * 0.5;
    const rg = x.createRadialGradient(sx, sy, 0, sx, sy, h * 0.32);
    rg.addColorStop(0, 'rgba(255,246,214,1)');
    rg.addColorStop(0.2, 'rgba(255,214,120,1)');
    rg.addColorStop(0.22, 'rgba(255,190,110,.55)');
    rg.addColorStop(1, 'rgba(255,160,100,0)');
    x.fillStyle = rg; x.fillRect(0, 0, w, h);

    const ridge = (base, amp, color, seed) => {
      x.beginPath(); x.moveTo(0, h);
      for (let i = 0; i <= w; i += 4) {
        const y = base - amp * (0.5 + 0.5 * Math.sin(i * 0.012 + seed)) * (0.6 + 0.4 * Math.sin(i * 0.031 + seed * 2));
        x.lineTo(i, y);
      }
      x.lineTo(w, h); x.closePath(); x.fillStyle = color; x.fill();
    };
    ridge(h * 0.6, h * 0.22, '#6a3f7d', 1);
    ridge(h * 0.63, h * 0.14, '#3e2a5c', 3);

    g = x.createLinearGradient(0, h * 0.62, 0, h);
    g.addColorStop(0, '#e98a7a'); g.addColorStop(1, '#1f2a5a');
    x.fillStyle = g; x.fillRect(0, h * 0.62, w, h * 0.38);
    x.fillStyle = 'rgba(255,220,150,.55)';
    for (let i = 0; i < 10; i++) {
      const yy = h * 0.64 + i * h * 0.03, ww = (70 - i * 5) * w / 640;
      x.fillRect(sx - ww / 2 + Math.sin(i * 1.7) * 6, yy, ww, 3);
    }

    [[w * 0.15, h * 0.25, '#e53935'], [w * 0.27, h * 0.36, '#43a047'], [w * 0.39, h * 0.21, '#1e88e5']]
      .forEach(([bx, by, col]) => {
        const r = h * 0.07;
        x.strokeStyle = 'rgba(255,255,255,.75)'; x.lineWidth = 1.5;
        x.beginPath(); x.moveTo(bx, by + r); x.quadraticCurveTo(bx + 10, by + r * 2, bx - 2, by + r * 3); x.stroke();
        const bg = x.createRadialGradient(bx - r * 0.35, by - r * 0.4, r * 0.05, bx, by, r * 1.1);
        bg.addColorStop(0, '#ffffff'); bg.addColorStop(0.3, col); bg.addColorStop(1, col);
        x.fillStyle = bg; x.beginPath(); x.ellipse(bx, by, r * 0.85, r, 0, 0, Math.PI * 2); x.fill();
      });
    c.isSample = true;
    return c;
  };

  /* ---------- 사진 선택기 ---------- */
  MF.photoPicker = function (el, onChange) {
    el.classList.add('picker');
    el.innerHTML = `
      <label class="btn primary">📁 내 사진 불러오기<input type="file" accept="image/*" hidden></label>
      <button class="btn" type="button" data-sample>🌅 샘플 사진</button>
      <span class="picker-note">사진을 여기로 끌어와도 돼요. 사진은 내 컴퓨터 안에서만 처리되고 어디에도 업로드되지 않아요.</span>`;
    const input = el.querySelector('input');
    const use = async file => {
      try { onChange(await MF.loadFile(file)); MF.toast('사진을 불러왔어요!'); }
      catch (e) { MF.toast(e.message); }
    };
    input.addEventListener('change', () => input.files[0] && use(input.files[0]));
    el.querySelector('[data-sample]').addEventListener('click', () => onChange(MF.sampleCanvas()));
    el.addEventListener('dragover', e => { e.preventDefault(); el.classList.add('drag'); });
    el.addEventListener('dragleave', () => el.classList.remove('drag'));
    el.addEventListener('drop', e => {
      e.preventDefault(); el.classList.remove('drag');
      const f = e.dataTransfer.files[0]; if (f) use(f);
    });
  };

  /* ---------- 필터 엔진 ----------
   * 필터 = 단계(step)들의 목록. 각 단계는 {t: 종류, ...매개변수}
   * 이후 차시에서 종류를 계속 추가한다.
   */
  MF.filters = {
    invert: {
      name: '반전',
      formula: () => "R' = 255 − R,  G' = 255 − G,  B' = 255 − B",
      apply(d) {
        for (let i = 0; i < d.length; i += 4) {
          d[i] = 255 - d[i]; d[i + 1] = 255 - d[i + 1]; d[i + 2] = 255 - d[i + 2];
        }
      }
    },
    gray: {
      name: '흑백',
      formula: s => `Y = ${s.w[0]}×R + ${s.w[1]}×G + ${s.w[2]}×B`,
      apply(d, s) {
        const [a, b, c] = s.w;
        for (let i = 0; i < d.length; i += 4) {
          const y = MF.clamp(Math.round(a * d[i] + b * d[i + 1] + c * d[i + 2]));
          d[i] = d[i + 1] = d[i + 2] = y;
        }
      }
    }
  };

  /* ---------- 학생이 직접 만드는 식: R' = (식), G' = (식), B' = (식) ----------
   * R, G, B, 숫자, + − × ÷ ( ) 만 허용해서 다른 코드가 실행될 수 없게 한다.
   */
  MF.compileExpr = function (src) {
    const s = String(src || '').trim()
      .replace(/×/g, '*').replace(/÷/g, '/').replace(/−/g, '-')
      .replace(/[rgb]/g, c => c.toUpperCase());
    if (!s) throw new Error('식을 입력해 주세요.');
    if (!/^[RGB0-9+\-*/().\s]*$/.test(s)) throw new Error('R, G, B, 숫자, + − × ÷ ( ) 만 쓸 수 있어요.');
    if (/[RGB0-9.)]\s*[RGB(]|[RGB)]\s*[0-9.]/.test(s)) throw new Error('곱하기는 × (또는 *)를 꼭 써 주세요. 예: 2×R');
    let fn;
    try { fn = new Function('R', 'G', 'B', '"use strict";return (' + s + ');'); }
    catch (e) { throw new Error('식이 완성되지 않았어요. 괄호나 기호를 확인해 주세요.'); }
    const test = fn(100, 150, 200);
    if (typeof test !== 'number' || !isFinite(test)) throw new Error('계산할 수 없는 식이에요. (0으로 나누지 않았는지 확인)');
    return fn;
  };
  MF.filters.formula = {
    name: '나만의 식',
    apply(d, s) {
      const [fr, fg, fb] = s.f.map(MF.compileExpr);
      for (let i = 0; i < d.length; i += 4) {
        const R = d[i], G = d[i + 1], B = d[i + 2];
        d[i] = MF.clamp(Math.round(fr(R, G, B)) || 0);
        d[i + 1] = MF.clamp(Math.round(fg(R, G, B)) || 0);
        d[i + 2] = MF.clamp(Math.round(fb(R, G, B)) || 0);
      }
    }
  };

  /* ---------- 2차시: 보정 슬라이더 (밝기, 노출, 대비, 따뜻함, 페이드, 비네트) ----------
   * 비네트를 뺀 나머지는 모두 '숫자 하나 → 숫자 하나' 규칙이라 0~255 표(LUT)를 미리 만들어 빠르게 계산한다.
   */
  MF.ADJ = { bright: 0, expo: 1, contrast: 1, warm: 0, fade: 0, vignette: 0 };
  MF.adjFns = p => [0, 1, 2].map(c => v => {
    v = v * p.expo + p.bright;
    v = (v - 128) * p.contrast + 128;
    if (c === 0) v += p.warm;
    if (c === 2) v -= p.warm;
    return v + p.fade * (255 - v) / 2;
  });
  MF.lut = fns => fns.map(f => {
    const t = new Uint8ClampedArray(256);
    for (let v = 0; v < 256; v++) t[v] = Math.round(f(v));
    return t;
  });
  // 비네트 마스크: 가운데 1, 네 모서리 1 − v
  MF.maskAt = (x, y, w, h, v) => {
    const dx = (x - (w - 1) / 2) / ((w - 1) / 2 || 1), dy = (y - (h - 1) / 2) / ((h - 1) / 2 || 1);
    return 1 - v * (dx * dx + dy * dy) / 2;
  };
  MF.filters.adjust = {
    name: '보정',
    apply(d, s, img) {
      const p = Object.assign({}, MF.ADJ, s.p);
      const [L0, L1, L2] = MF.lut(MF.adjFns(p));
      const w = img.width, h = img.height;
      for (let y = 0, i = 0; y < h; y++) for (let x = 0; x < w; x++, i += 4) {
        const m = p.vignette ? MF.maskAt(x, y, w, h, p.vignette) : 1;
        d[i] = MF.clamp(Math.round(L0[d[i]] * m));
        d[i + 1] = MF.clamp(Math.round(L1[d[i + 1]] * m));
        d[i + 2] = MF.clamp(Math.round(L2[d[i + 2]] * m));
      }
    }
  };
  // 채널별 규칙(함수 3개)을 사진에 적용
  MF.applyFns = (src, fns) => {
    const L = MF.lut(fns);
    const c = MF.copyCanvas(src), x = MF.ctx(c), img = x.getImageData(0, 0, c.width, c.height), d = img.data;
    for (let i = 0; i < d.length; i += 4) { d[i] = L[0][d[i]]; d[i + 1] = L[1][d[i + 1]]; d[i + 2] = L[2][d[i + 2]]; }
    x.putImageData(img, 0, 0); return c;
  };

  /* ---------- 3차시: 3×3 색변환 행렬 ----------
   * m = [a, b, c, d, e, f, g, h, i] (행 순서)  →  (R', G', B') = M × (R, G, B)
   */
  MF.I3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];
  MF.GRAY3 = [0.3, 0.59, 0.11, 0.3, 0.59, 0.11, 0.3, 0.59, 0.11];
  MF.SEPIA3 = [0.39, 0.77, 0.19, 0.35, 0.69, 0.17, 0.27, 0.53, 0.13];
  MF.mixMat = (A, B, t) => A.map((a, k) => a * (1 - t) + B[k] * t);
  MF.mulMV = (m, v) => [0, 1, 2].map(r => m[r * 3] * v[0] + m[r * 3 + 1] * v[1] + m[r * 3 + 2] * v[2]);
  MF.filters.matrix = {
    name: '색변환 행렬',
    apply(d, s) {
      const m = s.m.map(Number);
      for (let i = 0; i < d.length; i += 4) {
        const r = d[i], g = d[i + 1], b = d[i + 2];
        d[i] = MF.clamp(Math.round(m[0] * r + m[1] * g + m[2] * b));
        d[i + 1] = MF.clamp(Math.round(m[3] * r + m[4] * g + m[5] * b));
        d[i + 2] = MF.clamp(Math.round(m[6] * r + m[7] * g + m[8] * b));
      }
    }
  };
  MF.num = x => { const r = Math.round(x * 100) / 100; return Object.is(r, -0) ? '0' : String(r); };
  // 3×3 행렬 HTML. hl: 강조할 성분 번호 목록, rowColors: 행마다 글자색
  MF.mat3HTML = (m, { hl = [], rowColors } = {}) =>
    `<div class="matrix m3"><table>${[0, 1, 2].map(r => '<tr>' + [0, 1, 2].map(c => {
      const k = r * 3 + c;
      return `<td class="${hl.includes(k) ? 'hl' : ''}" style="${rowColors ? 'color:' + rowColors[r] : ''}">${MF.num(m[k])}</td>`;
    }).join('') + '</tr>').join('')}</table></div>`;
  MF.vecHTML = (v, cls = '') =>
    `<div class="matrix m3 vec ${cls}"><table>${v.map((x, r) => `<tr><td style="color:${['#d32f2f', '#2e7d32', '#1565c0'][r]}">${typeof x === 'number' ? MF.num(x) : x}</td></tr>`).join('')}</table></div>`;
  // M × v = v' 와 행별 계산 과정
  MF.mvHTML = (m, v) => {
    const raw = MF.mulMV(m, v), out = raw.map(x => MF.clamp(Math.round(x)));
    const names = ["R'", "G'", "B'"], cols = ['#d32f2f', '#2e7d32', '#1565c0'];
    const lines = [0, 1, 2].map(r => {
      const terms = [0, 1, 2].map(c => `${MF.num(m[r * 3 + c])}×${v[c]}`).join(' + ');
      const clip = Math.round(raw[r]) !== out[r] ? ` → ${out[r]}` : '';
      return `<div><b style="color:${cols[r]}">${names[r]}</b> = ${terms} = ${MF.num(raw[r])}${clip}</div>`;
    }).join('');
    return `<div class="mv">${MF.mat3HTML(m, { rowColors: cols })}<span class="op">×</span>${MF.vecHTML(v)}<span class="op">=</span>${MF.vecHTML(out)}</div><div class="mv-lines">${lines}</div>`;
  };

  /* ---------- 4차시: 커널(합성곱)과 모자이크 ----------
   * kernel: {k: 숫자 9개, d: 나누는 수, n: 반복 횟수, name}
   * 가장자리 픽셀은 바깥 대신 가장 가까운 픽셀을 쓴다.
   */
  MF.KERNELS = {
    blur: { name: '흐리게', k: [1, 1, 1, 1, 1, 1, 1, 1, 1], d: 9 },
    soft: { name: '부드럽게', k: [1, 2, 1, 2, 4, 2, 1, 2, 1], d: 16 },
    sharpen: { name: '선명하게', k: [0, -1, 0, -1, 5, -1, 0, -1, 0], d: 1 },
    edge: { name: '윤곽선', k: [-1, -1, -1, -1, 8, -1, -1, -1, -1], d: 1 },
    emboss: { name: '엠보싱', k: [-2, -1, 0, -1, 1, 1, 0, 1, 2], d: 1 }
  };
  MF.convolve = (src, w, h, k, div = 1) => {
    const out = new Uint8ClampedArray(src.length);
    for (let y = 0; y < h; y++) {
      const ys = [Math.max(0, y - 1), y, Math.min(h - 1, y + 1)];
      for (let x = 0; x < w; x++) {
        const xs = [Math.max(0, x - 1), x, Math.min(w - 1, x + 1)], i = (y * w + x) * 4;
        let r = 0, g = 0, b = 0;
        for (let a = 0; a < 3; a++) for (let c = 0; c < 3; c++) {
          const kv = k[a * 3 + c]; if (!kv) continue;
          const j = (ys[a] * w + xs[c]) * 4;
          r += src[j] * kv; g += src[j + 1] * kv; b += src[j + 2] * kv;
        }
        out[i] = r / div; out[i + 1] = g / div; out[i + 2] = b / div; out[i + 3] = src[i + 3];
      }
    }
    return out;
  };
  MF.filters.kernel = {
    name: '커널',
    apply(d, s, img) {
      let cur = d;
      for (let t = 0; t < (s.n || 1); t++) cur = MF.convolve(cur, img.width, img.height, s.k.map(Number), s.d || 1);
      if (cur !== d) d.set(cur);
    }
  };
  MF.filters.mosaic = {
    name: '모자이크',
    apply(d, s, img) {
      const w = img.width, h = img.height, b = Math.max(1, s.size | 0);
      for (let by = 0; by < h; by += b) for (let bx = 0; bx < w; bx += b) {
        let r = 0, g = 0, bl = 0, n = 0;
        const ye = Math.min(h, by + b), xe = Math.min(w, bx + b);
        for (let y = by; y < ye; y++) for (let x = bx; x < xe; x++) { const i = (y * w + x) * 4; r += d[i]; g += d[i + 1]; bl += d[i + 2]; n++; }
        r /= n; g /= n; bl /= n;
        for (let y = by; y < ye; y++) for (let x = bx; x < xe; x++) { const i = (y * w + x) * 4; d[i] = r; d[i + 1] = g; d[i + 2] = bl; }
      }
    }
  };

  // 단계 하나를 사람이 읽을 수 있는 '수학 레시피'로
  MF.describeStep = s => {
    if (s.t === 'invert') return "반전: R' = 255 − R (G, B도)";
    if (s.t === 'gray') return `흑백: ${s.w[0]}R + ${s.w[1]}G + ${s.w[2]}B`;
    if (s.t === 'formula') return `나만의 식: R'=${s.f[0]}, G'=${s.f[1]}, B'=${s.f[2]}`;
    if (s.t === 'adjust') {
      const p = Object.assign({}, MF.ADJ, s.p), out = [];
      if (p.expo !== 1) out.push(`노출 ×${MF.num(p.expo)}`);
      if (p.bright) out.push(`밝기 ${p.bright > 0 ? '+' : ''}${p.bright}`);
      if (p.contrast !== 1) out.push(`대비 ×${MF.num(p.contrast)}`);
      if (p.warm) out.push(`따뜻함 ${p.warm > 0 ? '+' : ''}${p.warm}`);
      if (p.fade) out.push(`페이드 ${MF.num(p.fade)}`);
      if (p.vignette) out.push(`비네트 ${MF.num(p.vignette)}`);
      return '보정: ' + (out.join(', ') || '변화 없음');
    }
    if (s.t === 'matrix') return `색감 행렬: [${[0, 1, 2].map(r => s.m.slice(r * 3, r * 3 + 3).map(MF.num).join(' ')).join(' / ')}]`;
    if (s.t === 'kernel') return `${s.name || '커널'} 커널: [${[0, 1, 2].map(r => s.k.slice(r * 3, r * 3 + 3).join(' ')).join(' / ')}]${(s.d || 1) !== 1 ? ' ÷ ' + s.d : ''}${(s.n || 1) > 1 ? ` (${s.n}번)` : ''}`;
    if (s.t === 'mosaic') return `모자이크: ${s.size}×${s.size} 블록 평균`;
    return s.t;
  };

  /* ---------- 입력 → 출력 그래프 ----------
   * lines: [{f, color}], mark: 표시할 입력값(선택)
   */
  MF.toneGraph = (cv, lines, mark) => {
    const S = 220, dpr = 2, pad = 30, top = 8, span = S - pad - top;
    cv.width = S * dpr; cv.height = S * dpr; cv.style.width = S + 'px'; cv.style.height = S + 'px';
    const x = cv.getContext('2d'); x.scale(dpr, dpr);
    const px = v => pad + v / 255 * span, py = v => S - pad - v / 255 * span;
    x.fillStyle = '#fff'; x.fillRect(0, 0, S, S);
    x.strokeStyle = '#ece9f5'; x.lineWidth = 1;
    [0, 64, 128, 192, 255].forEach(v => {
      x.beginPath(); x.moveTo(px(v), py(0)); x.lineTo(px(v), py(255)); x.stroke();
      x.beginPath(); x.moveTo(px(0), py(v)); x.lineTo(px(255), py(v)); x.stroke();
    });
    x.fillStyle = '#6b6880'; x.font = '11px Pretendard, sans-serif'; x.textAlign = 'center';
    [0, 128, 255].forEach(v => { x.fillText(v, px(v), S - pad + 14); });
    x.textAlign = 'right';
    [0, 255].forEach(v => { x.fillText(v, pad - 5, py(v) + 4); }); // 128 자리는 축 이름이 차지
    x.textAlign = 'center'; x.fillText('원래 값 A →', px(128), S - 3);
    x.save(); x.translate(10, py(128)); x.rotate(-Math.PI / 2); x.fillText('바뀐 값 A\' →', 0, 0); x.restore();
    x.setLineDash([4, 4]); x.strokeStyle = '#b9b4cc';
    x.beginPath(); x.moveTo(px(0), py(0)); x.lineTo(px(255), py(255)); x.stroke(); x.setLineDash([]);
    lines.forEach(({ f, color }) => {
      x.strokeStyle = color; x.lineWidth = 2.5; x.beginPath();
      for (let v = 0; v <= 255; v++) { const y = MF.clamp(f(v)); v ? x.lineTo(px(v), py(y)) : x.moveTo(px(v), py(y)); }
      x.stroke();
    });
    if (mark != null && lines[0]) {
      const y = MF.clamp(lines[0].f(mark));
      x.fillStyle = '#e1306c'; x.beginPath(); x.arc(px(mark), py(y), 5, 0, Math.PI * 2); x.fill();
    }
  };

  /* ---------- 인스타그램 스타일 필터 (공개된 CSS 재현값을 참고한 근사치) ---------- */
  const lum = (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b;
  const contrast = (v, k) => (v - 128) * k + 128;
  const overlay = (a, b) => (a < 128 ? 2 * a * b / 255 : 255 - 2 * (255 - a) * (255 - b) / 255);
  const sat = (r, g, b, k) => { const y = lum(r, g, b); return [y + (r - y) * k, y + (g - y) * k, y + (b - y) * k]; };
  MF.insta = {
    Clarendon: (r, g, b) => {
      [r, g, b] = sat(contrast(r, 1.2), contrast(g, 1.2), contrast(b, 1.2), 1.35);
      return [r * .8 + overlay(r, 127) * .2, g * .8 + overlay(g, 187) * .2, b * .8 + overlay(b, 227) * .2];
    },
    Juno: (r, g, b) => {
      [r, g, b] = sat(r * 1.06 + 10, g * 1.02 + 4, b * 0.86, 1.4);
      return [contrast(r, 1.12), contrast(g, 1.12), contrast(b, 1.12)];
    },
    Gingham: (r, g, b) => {
      [r, g, b] = sat(r, g, b, 0.8);
      return [r * .82 + 42, g * .82 + 38, b * .82 + 48];
    },
    Moon: (r, g, b) => {
      const y = Math.max(56, contrast(lum(r, g, b) * 1.1, 1.1));
      return [y, y, y];
    }
  };
  MF.applyInsta = (src, name) => {
    const c = MF.copyCanvas(src), x = MF.ctx(c), img = x.getImageData(0, 0, c.width, c.height), d = img.data, f = MF.insta[name];
    for (let i = 0; i < d.length; i += 4) {
      const o = f(d[i], d[i + 1], d[i + 2]);
      d[i] = MF.clamp(Math.round(o[0])); d[i + 1] = MF.clamp(Math.round(o[1])); d[i + 2] = MF.clamp(Math.round(o[2]));
    }
    x.putImageData(img, 0, 0); return c;
  };

  // 샘플 사진은 빨간 풍선 가장자리, 내 사진은 가운데를 기본 위치로
  MF.defaultPoint = photo => photo.isSample
    ? { x: Math.round(photo.width * 0.15 + photo.height * 0.058), y: Math.round(photo.height * 0.25) }
    : { x: Math.floor(photo.width / 2), y: Math.floor(photo.height / 2) };
  // 버튼을 누르고 있는 동안 원본 보기
  MF.holdToCompare = (btn, canvas, badge, getOrig, getResult) => {
    const show = on => { const c = on ? getOrig() : getResult(); if (c) MF.draw(canvas, c); badge.textContent = on ? '원본' : '결과'; };
    btn.addEventListener('pointerdown', () => show(true));
    ['pointerup', 'pointerleave'].forEach(ev => btn.addEventListener(ev, () => show(false)));
  };

  /* ---------- 단계별 화면 넘기기 ----------
   * <section class="screen" data-title="..." [data-photo]> 들을 한 장씩 보여준다.
   * 주소 끝 #3 처럼 화면 번호가 남아서 새로고침해도 그 화면에서 다시 시작한다.
   */
  MF.wizard = function ({ onShow } = {}) {
    const screens = [...document.querySelectorAll('.screen')];
    const stepper = document.getElementById('stepper');
    const prev = document.getElementById('prevBtn'), next = document.getElementById('nextBtn');
    const count = document.getElementById('pageCount');
    const photoBar = document.getElementById('photoBar');
    stepper.innerHTML = screens.map((s, i) =>
      `<li><button type="button" data-go="${i}" title="${s.dataset.title}"><span class="bar"></span><span class="lbl">${i + 1}. ${s.dataset.title}</span></button></li>`).join('');
    let cur = -1;
    const show = i => {
      i = Math.max(0, Math.min(screens.length - 1, i));
      if (i === cur) return;
      cur = i;
      screens.forEach((s, k) => s.classList.toggle('on', k === i));
      [...stepper.children].forEach((li, k) => { li.classList.toggle('on', k === i); li.classList.toggle('done', k < i); });
      prev.disabled = i === 0;
      next.textContent = i === screens.length - 1 ? '처음으로 ↺' : '다음 →';
      count.textContent = `${i + 1} / ${screens.length}`;
      if (photoBar) photoBar.classList.toggle('hidden', !screens[i].hasAttribute('data-photo'));
      history.replaceState(null, '', '#' + (i + 1));
      window.scrollTo({ top: 0, behavior: 'smooth' });
      onShow && onShow(i, screens[i]);
    };
    stepper.addEventListener('click', e => { const b = e.target.closest('[data-go]'); if (b) show(+b.dataset.go); });
    prev.addEventListener('click', () => show(cur - 1));
    next.addEventListener('click', () => show(cur === screens.length - 1 ? 0 : cur + 1));
    document.addEventListener('keydown', e => {
      if (/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) return;
      if (e.key === 'ArrowRight') show(cur + 1);
      if (e.key === 'ArrowLeft') show(cur - 1);
    });
    show((parseInt(location.hash.slice(1), 10) || 1) - 1);
    return { show, get current() { return cur; } };
  };

  /* ---------- 활동지: 화면별 메모 + 필수 기록 3문항 + PDF 저장 ----------
   * 답은 브라우저(localStorage)에 자동 저장돼서 새로고침해도 남는다. (PC 초기화 시에는 지워짐)
   * getResult(): {canvas, name, code} 를 돌려주는 함수 (활동지에 담을 결과 이미지와 필터 코드)
   * 반환값의 refresh를 마지막 화면이 보일 때 호출한다.
   */
  /* extras: 선택 기록 칸 [{key, title, hint, labelKey, label}] (예: 4차시 진로 연결)
   *   labelKey에 저장된 값(예: 고른 관심 분야)이 label과 함께 표시된다.
   * 반환값의 bind(el, key)로 다른 화면의 입력칸을 같은 기록에 연결할 수 있다.
   */
  MF.worksheet = function ({ lesson, title, q1hint, q2, getResult, extras = [] }) {
    const KEY = 'mf-ws-' + lesson, ID_KEY = 'mf-ws-id';
    const read = k => { try { return JSON.parse(localStorage.getItem(k)) || {}; } catch (e) { return {}; } };
    const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
    const data = read(KEY), ident = read(ID_KEY);
    const save = () => write(KEY, data);
    const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const box = (key, rows, placeholder, cls) => {
      const ta = document.createElement('textarea');
      ta.className = cls; ta.rows = rows; ta.placeholder = placeholder; ta.value = data[key] || '';
      ta.addEventListener('input', () => { data[key] = ta.value; save(); });
      return ta;
    };
    const screens = [...document.querySelectorAll('.screen')], last = screens[screens.length - 1];

    // 질문의 data-hint="힌트1|힌트2" 를 단계별로 하나씩 열어 보는 힌트 버튼
    const hintFor = hint => {
      const steps = hint.split('|').map(s => s.trim()).filter(Boolean);
      const wrap = document.createElement('div');
      wrap.className = 'ws-hint';
      wrap.innerHTML = `<button type="button" class="btn sm ws-hint-btn">💡 힌트 보기</button><div class="ws-hint-list"></div>`;
      const btn = wrap.querySelector('button'), list = wrap.querySelector('.ws-hint-list');
      let shown = 0;
      btn.addEventListener('click', () => {
        const p = document.createElement('p');
        p.innerHTML = `<b>힌트 ${shown + 1}</b> ${esc(steps[shown])}`;
        list.append(p); shown++;
        if (shown < steps.length) btn.textContent = `💡 힌트 ${shown + 1} 더 보기`;
        else { btn.textContent = '힌트를 모두 봤어요'; btn.disabled = true; }
      });
      return wrap;
    };

    // 화면별 질문 아래 메모 칸 (선택)과 힌트
    screens.forEach((sc, i) => {
      const q = sc.querySelector('.screen-q');
      if (!q) return;
      const memo = box('m' + i, 2, '✏️ 내 생각 메모 (선택) · 활동지에 함께 저장돼요', 'ws-memo');
      q.after(memo);
      if (q.dataset.hint) memo.after(hintFor(q.dataset.hint));
    });
    // 생각해보기 답 칸 (선택)과 힌트
    last.querySelectorAll('.think li').forEach((li, j) => {
      li.append(box('t' + j, 2, '답 (선택)', 'ws-memo ws-think'));
      if (li.dataset.hint) li.append(hintFor(li.dataset.hint));
    });

    // 필수 기록 3문항 + 제출
    const REQ = [
      ['오늘 가장 인상 깊었던 수학 원리', q1hint],
      ['내가 만든 필터 설명', q2],
      ['새로 궁금해진 점', '오늘 활동을 하며 새로 궁금해진 점이나, 앞으로 더 만들어 보고 싶은 필터를 써 주세요.']
    ];
    const MIN = 20;
    last.dataset.title = last.dataset.title + '·제출';
    const block = document.createElement('div');
    block.className = 'ws-block';
    block.innerHTML = `
      <h3>📄 ${lesson}차시 활동지 제출</h3>
      <p class="small muted" style="margin:4px 0 12px">필수 기록 3개를 쓰고 PDF로 저장해서 클래스룸 과제에 올려요. 화면별 메모, 생각해보기 답, 결과 이미지, 필터 코드도 자동으로 함께 담겨요.</p>
      <div class="ws-id">
        <label>학번 <input type="text" data-id="no" maxlength="10" placeholder="예: 10101"></label>
        <label>이름 <input type="text" data-id="name" maxlength="20"></label>
      </div>
      ${REQ.map(([t, h], k) => `
        <div class="ws-req">
          <div class="ws-req-t">필수 ${k + 1}. ${t}</div>
          <div class="small muted">${h}</div>
          <div data-slot="${k}"></div>
          <div class="ws-count" data-count="${k}"></div>
        </div>`).join('')}
      ${extras.map(x => `
        <div class="ws-req">
          <div class="ws-req-t">선택. ${x.title}</div>
          <div class="small muted">${x.hint}</div>
          ${x.labelKey ? `<div class="small" data-xlabel="${x.key}" style="margin-top:4px"></div>` : ''}
          <div data-xslot="${x.key}"></div>
        </div>`).join('')}
      <div class="matrix-label" style="margin-top:14px">함께 담기는 결과물</div>
      <div class="ws-attach" data-attach></div>
      <div class="btn-row" style="margin-top:14px"><button class="btn grad" data-pdf>📄 활동지 PDF로 저장</button></div>
      <div class="box tip small" style="margin-top:12px">
        인쇄 창이 열리면 대상(프린터)을 <b>'PDF로 저장'</b>으로 바꾸고 [저장]을 눌러요. 저장한 PDF를 클래스룸 과제에 올리면 제출 끝!<br>
        ⚠️ 작성한 내용은 이 컴퓨터에 임시로 남지만, 컴퓨터실 PC는 껐다 켜면 지워질 수 있어요. 수업이 끝나기 전에 꼭 저장해서 제출해요.
      </div>`;
    last.querySelector('.step').append(block);

    block.querySelectorAll('[data-id]').forEach(inp => {
      inp.value = ident[inp.dataset.id] || '';
      inp.addEventListener('input', () => { ident[inp.dataset.id] = inp.value; write(ID_KEY, ident); });
    });
    const counter = k => {
      const n = (data['r' + k] || '').trim().length, el = block.querySelector(`[data-count="${k}"]`);
      el.textContent = n < MIN ? `${n}자 · ${MIN}자 이상 써 주세요` : `${n}자 ✓`;
      el.classList.toggle('ok', n >= MIN);
    };
    REQ.forEach((_, k) => {
      const ta = box('r' + k, 3, '', 'ws-req-in');
      ta.addEventListener('input', () => counter(k));
      block.querySelector(`[data-slot="${k}"]`).append(ta);
      counter(k);
    });

    // 선택 기록: 같은 기록에 연결된 입력칸끼리는 내용을 맞춰 준다
    const bound = {};
    const bindEl = (el, key) => {
      (bound[key] ||= []).push(el);
      el.value = data[key] || '';
      el.addEventListener('input', () => {
        data[key] = el.value; save();
        bound[key].forEach(o => { if (o !== el) o.value = el.value; });
      });
    };
    const xget = k => data['x_' + k] || '';
    const xlabels = () => extras.forEach(x => {
      const el = block.querySelector(`[data-xlabel="${x.key}"]`);
      if (el) { const v = xget(x.labelKey); el.innerHTML = `${x.label}: ${v ? '<b>' + esc(v) + '</b>' : '<span class="muted">아직 고르지 않았어요</span>'}`; }
    });
    extras.forEach(x => {
      const ta = document.createElement('textarea');
      ta.className = 'ws-req-in'; ta.rows = 3;
      bindEl(ta, 'x_' + x.key);
      block.querySelector(`[data-xslot="${x.key}"]`).append(ta);
    });
    xlabels();

    const snapshot = () => {
      const r = getResult() || {};
      let img = '';
      if (r.canvas && r.canvas.width) {
        const s = Math.min(1, 1000 / Math.max(r.canvas.width, r.canvas.height));
        const c = MF.makeCanvas(Math.round(r.canvas.width * s), Math.round(r.canvas.height * s));
        const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height);
        x.drawImage(r.canvas, 0, 0, c.width, c.height);
        img = c.toDataURL('image/jpeg', 0.88);
      }
      return { img, name: r.name || '', code: r.code || '' };
    };
    const refresh = () => {
      xlabels();
      const s = snapshot();
      block.querySelector('[data-attach]').innerHTML = `
        ${s.img ? `<img src="${s.img}" alt="결과 이미지">` : '<div class="ws-missing">결과 이미지가 없어요</div>'}
        <div>
          <div><b>필터 이름:</b> ${s.name ? esc(s.name) : '<span class="ws-warn">아직 없어요 (만들기 화면에서 이름을 지어 주세요)</span>'}</div>
          <div class="ws-code">${esc(s.code) || '<span class="ws-warn">필터 코드가 없어요</span>'}</div>
        </div>`;
    };

    block.querySelector('[data-pdf]').addEventListener('click', () => {
      const no = (ident.no || '').trim(), name = (ident.name || '').trim();
      if (!no || !name) { MF.toast('학번과 이름을 먼저 써 주세요.'); block.querySelector(no ? '[data-id="name"]' : '[data-id="no"]').focus(); return; }
      const short = REQ.findIndex((_, k) => (data['r' + k] || '').trim().length < MIN);
      if (short >= 0) { MF.toast(`필수 ${short + 1}번을 ${MIN}자 이상 써 주세요.`); block.querySelector(`[data-slot="${short}"] textarea`).focus(); return; }
      const s = snapshot(), today = new Date();
      const date = `${today.getFullYear()}.${today.getMonth() + 1}.${today.getDate()}`;
      const memos = screens.map((sc, i) => [sc, data['m' + i]]).filter(([, v]) => v && v.trim());
      const thinks = [...last.querySelectorAll('.think li')].map((li, j) => [li.firstChild.textContent.trim(), data['t' + j]]).filter(([, v]) => v && v.trim());
      let pr = document.getElementById('wsPrint');
      if (!pr) { pr = document.createElement('div'); pr.id = 'wsPrint'; document.body.append(pr); }
      pr.innerHTML = `
        <div class="wp-head">
          <div><div class="wp-k">행렬 필터 연구소 · ${lesson}차시 활동지</div><h1>${esc(title)}</h1></div>
          <div class="wp-id">학번 <b>${esc(no)}</b> · 이름 <b>${esc(name)}</b><br>${date}</div>
        </div>
        <h2>필수 기록</h2>
        ${REQ.map(([t], k) => `<div class="wp-q"><div class="wp-qt">${k + 1}. ${t}</div><div class="wp-a">${esc(data['r' + k].trim())}</div></div>`).join('')}
        ${extras.some(x => xget(x.key).trim()) ? `<h2>${extras.map(x => x.title).join(' · ')}</h2>` +
          extras.filter(x => xget(x.key).trim()).map(x => `<div class="wp-q">${x.labelKey && xget(x.labelKey) ? `<div class="wp-qt">${x.label}: ${esc(xget(x.labelKey))}</div>` : ''}<div class="wp-a">${esc(xget(x.key).trim())}</div></div>`).join('') : ''}
        <h2>내가 만든 필터</h2>
        <div class="wp-filter">
          ${s.img ? `<img src="${s.img}">` : ''}
          <div><div class="wp-qt">${esc(s.name || '(이름 없음)')}</div><div class="wp-code">${esc(s.code)}</div></div>
        </div>
        <h2>생각해보기</h2>
        ${thinks.length ? thinks.map(([q, a]) => `<div class="wp-q"><div class="wp-qt">${esc(q)}</div><div class="wp-a">${esc(a.trim())}</div></div>`).join('') : '<p class="wp-none">작성한 답이 없어요.</p>'}
        <h2>화면별 메모</h2>
        ${memos.length ? memos.map(([sc, v]) => `<div class="wp-q"><div class="wp-qt">[${esc(sc.dataset.title)}] ${esc(sc.querySelector('.screen-q').textContent.trim())}</div><div class="wp-a">${esc(v.trim())}</div></div>`).join('') : '<p class="wp-none">작성한 메모가 없어요.</p>'}`;
      const oldTitle = document.title;
      document.title = `${lesson}차시_활동지_${no}_${name}`; // PDF 파일 이름으로 쓰인다
      const restore = () => { document.title = oldTitle; window.removeEventListener('afterprint', restore); };
      window.addEventListener('afterprint', restore);
      // 이미지가 다 그려진 다음 인쇄 창을 연다
      const imgs = [...pr.querySelectorAll('img')];
      Promise.all(imgs.map(im => im.complete ? 0 : new Promise(r => { im.onload = im.onerror = r; }))).then(() => window.print());
    });

    return {
      refresh, // 사진이 준비된 뒤 마지막 화면에서 호출된다
      bind: (el, key) => bindEl(el, 'x_' + key),
      get: xget,
      set: (key, v) => { data['x_' + key] = v; save(); (bound['x_' + key] || []).forEach(o => o.value = v); xlabels(); }
    };
  };

  MF.applySteps = function (src, steps) {
    const out = MF.copyCanvas(src);
    const ctx = MF.ctx(out);
    const img = ctx.getImageData(0, 0, out.width, out.height);
    steps.forEach(s => { const f = MF.filters[s.t]; if (f) f.apply(img.data, s, img); });
    ctx.putImageData(img, 0, 0);
    return out;
  };

  /* ---------- 필터 코드 (저장/복원용) ---------- */
  const toB64 = str => btoa(unescape(encodeURIComponent(str))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const fromB64 = b64 => {
    b64 = b64.replace(/-/g, '+').replace(/_/g, '/');
    while (b64.length % 4) b64 += '=';
    return decodeURIComponent(escape(atob(b64)));
  };
  MF.encode = obj => 'MF-' + toB64(JSON.stringify(obj));
  MF.decode = code => {
    const s = String(code || '').trim().replace(/\s+/g, '');
    if (!s.startsWith('MF-')) throw new Error('필터 코드는 MF- 로 시작해야 해요.');
    try { return JSON.parse(fromB64(s.slice(3))); }
    catch (e) { throw new Error('코드가 올바르지 않아요. 빠진 글자가 없는지 확인해 주세요.'); }
  };

  /* ---------- 저장, 복사, 알림 ---------- */
  MF.download = (canvas, name = '내필터.png') => {
    canvas.toBlob(blob => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = name;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    }, 'image/png');
  };
  MF.copy = async text => {
    try { await navigator.clipboard.writeText(text); MF.toast('복사했어요! 메모장이나 클래스룸에 붙여넣어 두세요.'); }
    catch (e) {
      const t = document.createElement('textarea'); t.value = text; document.body.appendChild(t);
      t.select(); document.execCommand('copy'); t.remove(); MF.toast('복사했어요!');
    }
  };
  let toastTimer;
  MF.toast = msg => {
    let t = document.querySelector('.toast');
    if (!t) { t = document.createElement('div'); t.className = 'toast'; document.body.appendChild(t); }
    t.textContent = msg; t.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
  };

  /* ---------- 행렬 표 ----------
   * rows: 2차원 배열, tint: 'gray' | 'r' | 'g' | 'b', center: [행, 열]
   */
  MF.tint = (v, tint) => {
    if (tint === 'r') return `rgb(${v},0,0)`;
    if (tint === 'g') return `rgb(0,${v},0)`;
    if (tint === 'b') return `rgb(0,0,${v})`;
    return `rgb(${v},${v},${v})`;
  };
  MF.matrixHTML = (rows, tint = 'gray', center) => {
    const body = rows.map((r, i) => '<tr>' + r.map((v, j) => {
      const isC = center && center[0] === i && center[1] === j;
      const bright = tint === 'gray' ? v : v * (tint === 'g' ? 0.75 : 0.45);
      const fg = bright > 130 ? '#111' : '#fff';
      return `<td class="${isC ? 'center' : ''}" style="background:${MF.tint(v, tint)};color:${fg}">${v}</td>`;
    }).join('') + '</tr>').join('');
    return `<div class="matrix"><table>${body}</table></div>`;
  };

  /* ---------- 차시 공개 설정 ----------
   * 수업을 진행한 차시만 열어 둔다. 다음 차시를 열 때 이 목록에 번호를 추가한다.
   * 선생님 미리보기: 주소 끝에 ?preview 를 붙이면 모든 차시가 열린다.
   */
  MF.OPEN_LESSONS = [1];
  const lessonNo = href => { const m = /lesson(\d)\.html/.exec(href || ''); return m ? +m[1] : 0; };
  const isOpen = n => /[?&]preview/.test(location.search) || MF.OPEN_LESSONS.includes(n);
  const lockLessons = () => {
    // 메뉴의 닫힌 차시 링크 → 누를 수 없는 '준비 중' 표시
    document.querySelectorAll('.lesson-nav a').forEach(a => {
      const n = lessonNo(a.getAttribute('href'));
      if (n && !isOpen(n)) { const sp = document.createElement('span'); sp.className = 'soon'; sp.title = '아직 열리지 않은 차시예요'; sp.textContent = a.textContent; a.replaceWith(sp); }
    });
    // 홈의 차시 카드
    document.querySelectorAll('a.lesson-card').forEach(a => {
      const n = lessonNo(a.getAttribute('href'));
      if (n && !isOpen(n)) { const d = document.createElement('div'); d.className = 'lesson-card soon'; d.append(...a.childNodes); a.replaceWith(d); } // 그려 둔 썸네일이 지워지지 않게 그대로 옮긴다
    });
    // 닫힌 차시 페이지에 직접 들어온 경우
    const here = lessonNo(location.pathname);
    if (here && !isOpen(here)) {
      const main = document.querySelector('main');
      if (main) main.innerHTML = `<div class="step" style="margin:40px 0;text-align:center"><h2 style="font-size:24px">🔒 ${here}차시는 아직 열리지 않았어요</h2><p class="muted" style="margin-top:10px">수업 시간에 선생님이 열어 줄 거예요.</p><p style="margin-top:18px"><a class="btn primary" href="index.html">홈으로</a></p></div>`;
    }
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', lockLessons); else lockLessons();

  window.MF = MF;
})();
