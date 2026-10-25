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

  /* ---------- 샘플 사진: 맑은 날 공원 + 빨강·초록·파랑 풍선 ----------
   * 필터 차이가 잘 보이도록 아주 밝은 곳(해, 구름, 흰 벽), 아주 어두운 곳(창문, 나무 그늘),
   * 진한 색(풍선, 지붕, 꽃), 중간 밝기(하늘, 잔디)를 고루 넣었다.
   * 풍선 위치는 예전과 같아서 '빨간 풍선 가장자리' 같은 안내가 그대로 맞는다.
   */
  MF.sampleCanvas = function (w = 640, h = 420) {
    const c = MF.makeCanvas(w, h), x = c.getContext('2d');
    const H = h * 0.56; // 지평선
    // 하늘
    let g = x.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#3d8fd6'); g.addColorStop(1, '#bfe3fb');
    x.fillStyle = g; x.fillRect(0, 0, w, H);
    // 해
    const sx = w * 0.86, sy = h * 0.13;
    const rg = x.createRadialGradient(sx, sy, 0, sx, sy, h * 0.2);
    rg.addColorStop(0, '#ffffff'); rg.addColorStop(0.22, '#fff8d6'); rg.addColorStop(0.3, 'rgba(255,244,190,.6)'); rg.addColorStop(1, 'rgba(255,244,190,0)');
    x.fillStyle = rg; x.fillRect(0, 0, w, H);
    // 구름
    const cloud = (cx, cy, s) => {
      x.fillStyle = '#ffffff';
      [[0, 0, 1], [-0.9, 0.25, 0.75], [0.9, 0.25, 0.8], [0.35, -0.35, 0.8], [-0.4, -0.25, 0.7]].forEach(([dx, dy, r]) => {
        x.beginPath(); x.arc(cx + dx * s, cy + dy * s, r * s, 0, Math.PI * 2); x.fill();
      });
      x.fillStyle = 'rgba(160,185,210,.35)'; x.beginPath(); x.ellipse(cx, cy + s * 0.75, s * 1.6, s * 0.28, 0, 0, Math.PI * 2); x.fill();
    };
    cloud(w * 0.6, h * 0.13, h * 0.055);
    cloud(w * 0.76, h * 0.33, h * 0.04);
    // 먼 산
    x.fillStyle = '#7fae9b';
    x.beginPath(); x.moveTo(0, H);
    for (let i = 0; i <= w; i += 4) x.lineTo(i, H - h * 0.07 * (0.6 + 0.4 * Math.sin(i * 0.013 + 1)) - h * 0.03 * Math.sin(i * 0.041));
    x.lineTo(w, H); x.closePath(); x.fill();
    // 잔디
    g = x.createLinearGradient(0, H, 0, h);
    g.addColorStop(0, '#7cc95a'); g.addColorStop(1, '#2f7d2c');
    x.fillStyle = g; x.fillRect(0, H, w, h - H);
    // 길
    x.fillStyle = '#e3d5c0';
    x.beginPath(); x.moveTo(w * 0.56, H + h * 0.06); x.lineTo(w * 0.66, H + h * 0.06); x.lineTo(w * 0.78, h); x.lineTo(w * 0.36, h); x.closePath(); x.fill();
    // 집 (흰 벽, 빨간 지붕, 어두운 창문, 갈색 문)
    const hx = w * 0.5, hy = h * 0.4, hw = w * 0.22, hh = h * 0.22;
    x.fillStyle = '#f7f5ef'; x.fillRect(hx, hy, hw, hh);
    x.fillStyle = 'rgba(0,0,0,.12)'; x.fillRect(hx + hw * 0.8, hy, hw * 0.2, hh);
    x.fillStyle = '#c62828'; x.beginPath(); x.moveTo(hx - hw * 0.08, hy); x.lineTo(hx + hw / 2, hy - hh * 0.62); x.lineTo(hx + hw * 1.08, hy); x.closePath(); x.fill();
    x.fillStyle = '#1c2530';
    x.fillRect(hx + hw * 0.1, hy + hh * 0.2, hw * 0.22, hh * 0.3); x.fillRect(hx + hw * 0.68, hy + hh * 0.2, hw * 0.22, hh * 0.3);
    x.fillStyle = '#6d4c41'; x.fillRect(hx + hw * 0.4, hy + hh * 0.45, hw * 0.2, hh * 0.55);
    // 나무와 짙은 그늘
    const tx = w * 0.88, ty = h * 0.62;
    x.fillStyle = 'rgba(10,30,10,.55)'; x.beginPath(); x.ellipse(tx - w * 0.02, ty + h * 0.15, w * 0.12, h * 0.05, 0, 0, Math.PI * 2); x.fill();
    x.fillStyle = '#3b2418'; x.fillRect(tx - w * 0.015, ty - h * 0.05, w * 0.03, h * 0.2);
    [[0, -0.2, 0.13, '#1e5a22'], [-0.06, -0.12, 0.1, '#17491b'], [0.06, -0.1, 0.1, '#236b28'], [0, -0.3, 0.09, '#2d7a31']].forEach(([dx, dy, r, col]) => {
      x.fillStyle = col; x.beginPath(); x.arc(tx + dx * w, ty + dy * h, r * h, 0, Math.PI * 2); x.fill();
    });
    // 꽃밭 (진한 색)
    const cols = ['#ffd600', '#ff4081', '#ffffff', '#ab47bc', '#ff6d00'];
    for (let k = 0; k < 70; k++) {
      const fx = w * (0.03 + 0.3 * ((k * 37) % 70) / 70), fy = h * (0.72 + 0.24 * ((k * 53) % 70) / 70);
      x.fillStyle = cols[k % cols.length]; x.beginPath(); x.arc(fx, fy, h * 0.012, 0, Math.PI * 2); x.fill();
    }
    // 풍선 (예전과 같은 위치)
    [[w * 0.15, h * 0.25, '#e53935'], [w * 0.27, h * 0.36, '#43a047'], [w * 0.39, h * 0.21, '#1e88e5']]
      .forEach(([bx, by, col]) => {
        const r = h * 0.07;
        x.strokeStyle = 'rgba(60,60,70,.7)'; x.lineWidth = 1.5;
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
    // mark: 숫자 하나 또는 [{v, color, line}] (line번째 선 위에 점 찍기)
    const marks = Array.isArray(mark) ? mark : mark != null ? [{ v: mark, color: '#e1306c', line: 0 }] : [];
    marks.forEach(m => {
      const L = lines[m.line || 0]; if (!L) return;
      x.fillStyle = m.color; x.strokeStyle = '#fff'; x.lineWidth = 1.5;
      x.beginPath(); x.arc(px(m.v), py(MF.clamp(L.f(m.v))), 5, 0, Math.PI * 2); x.fill(); x.stroke();
    });
  };

  /* ---------- 인스타그램 스타일 필터 ----------
   * 실제 계산식은 공개되어 있지 않아서, 필터의 느낌을 보고 비슷하게 만든 근사치다.
   */
  const lum = (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b;
  const contrast = (v, k) => (v - 128) * k + 128;
  const sat = (r, g, b, k) => { const y = lum(r, g, b); return [y + (r - y) * k, y + (g - y) * k, y + (b - y) * k]; };
  MF.insta = {
    // 물 빠진 느낌: 검정을 들어 올리고 색을 조금 줄인다
    Fade: (r, g, b) => {
      [r, g, b] = sat(r, g, b, 0.8);
      return [r * 0.8 + 45, g * 0.8 + 42, b * 0.8 + 40];
    },
    // 밝고 부드럽게: 전체를 밝히고 대비를 낮춘 뒤 분홍빛(R과 B를 G보다 많이)을 더한다
    Paris: (r, g, b) => {
      [r, g, b] = sat(r, g, b, 0.8);
      return [contrast(r, 0.78) + 40, contrast(g, 0.78) + 18, contrast(b, 0.78) + 34];
    },
    // 깔끔하게 선명: 대비와 채도를 크게 올려 진한 색은 더 진하게, 밝고 어두운 차이를 더 크게
    Simple: (r, g, b) => {
      [r, g, b] = sat(r, g, b, 1.6);
      return [contrast(r, 1.3), contrast(g, 1.3), contrast(b, 1.3)];
    },
    // 어둡고 푸르게: 전체를 어둡게, 빨강은 줄이고 파랑은 더한다
    Midnight: (r, g, b) => {
      [r, g, b] = sat(r * 0.75, g * 0.8, b * 0.85 + 30, 0.85);
      return [contrast(r, 1.1), contrast(g, 1.1), contrast(b, 1.1)];
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
  /* ---------- 사진에서 점 고르기 ----------
   * 결과 사진을 클릭하면 그 점을 고르고, 사진 위에 동그라미로 표시한다.
   * 한 페이지 안의 모든 화면이 같은 점을 쓴다. 고르기 전에는 기본 위치(defaultPoint)를 쓴다.
   */
  let pickFrac = null;
  MF.pickedPoint = photo => pickFrac
    ? { x: Math.min(photo.width - 1, Math.floor(pickFrac[0] * photo.width)), y: Math.min(photo.height - 1, Math.floor(pickFrac[1] * photo.height)) }
    : MF.defaultPoint(photo);
  // 사진 위에 고른 점을 그린 복사본
  MF.withMark = (src, p) => {
    const c = MF.copyCanvas(src), x = c.getContext('2d'), r = Math.max(7, Math.round(src.width / 70));
    x.lineWidth = 4; x.strokeStyle = '#fff'; x.beginPath(); x.arc(p.x, p.y, r, 0, Math.PI * 2); x.stroke();
    x.lineWidth = 2.5; x.strokeStyle = '#e1306c'; x.beginPath(); x.arc(p.x, p.y, r, 0, Math.PI * 2); x.stroke();
    return c;
  };
  MF.pickable = (canvas, onPick) => {
    canvas.style.cursor = 'crosshair';
    canvas.title = '클릭하면 이 점의 숫자를 볼 수 있어요';
    canvas.addEventListener('click', e => {
      const b = canvas.getBoundingClientRect();
      pickFrac = [Math.min(0.999, Math.max(0, (e.clientX - b.left) / b.width)), Math.min(0.999, Math.max(0, (e.clientY - b.top) / b.height))];
      onPick();
    });
  };
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

  /* ---------- 활동지: 화면별 메모 + 필수 기록 3문항 + 이미지 저장 ----------
   * 답은 브라우저(localStorage)에 자동 저장돼서 새로고침해도 남는다. (PC 초기화 시에는 지워짐)
   * getResult(): {canvas, name, code} 를 돌려주는 함수 (활동지에 담을 결과 이미지와 필터 코드)
   * 반환값의 refresh를 마지막 화면이 보일 때 호출한다.
   */
  /* extras: 선택 기록 칸 [{key, title, hint, labelKey, label}] (예: 4차시 진로 연결)
   *   labelKey에 저장된 값(예: 고른 관심 분야)이 label과 함께 표시된다.
   * 반환값의 bind(el, key)로 다른 화면의 입력칸을 같은 기록에 연결할 수 있다.
   */
  // 활동지를 그림으로 찍는 도구 (처음 저장할 때 한 번만 불러온다)
  const loadHtml2Canvas = () => window.html2canvas ? Promise.resolve() : new Promise((res, rej) => {
    const sc = document.createElement('script');
    sc.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
    sc.onload = () => res(); sc.onerror = () => rej(new Error('html2canvas'));
    document.head.append(sc);
  });
  MF.worksheet = function ({ lesson, title, q1title = '오늘 가장 인상 깊었던 수학 원리', q1hint, q2, getResult, extras = [], records = () => ({}) }) {
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
    const memoKey = (i, n) => n ? `m${i}q${n}` : `m${i}`; // 한 화면에 질문이 여러 개일 때
    screens.forEach((sc, i) => sc.querySelectorAll('.screen-q').forEach((q, n) => {
      const K = memoKey(i, n);
      let memo;
      if (q.dataset.table) {
        // data-table="행1::설명|행2::설명" data-cols="R|G|B" → 행마다 열 칸에 짧게 기록하는 표
        const rows = q.dataset.table.split('|').map(r => r.split('::'));
        const cols = (q.dataset.cols || 'R|G|B').split('|');
        const colColor = { R: '#d32f2f', G: '#2e7d32', B: '#1565c0' };
        memo = document.createElement('div');
        memo.className = 'ws-table';
        memo.innerHTML = `<div class="ws-fields-t">✏️ 원본과 비교한 변화를 기록해요 (예: ↑ 커짐, ↓ 작아짐, = 비슷함) · 활동지에 함께 저장돼요</div>
          <table><thead><tr><th></th>${cols.map(c => `<th style="color:${colColor[c] || 'inherit'}">${esc(c)}</th>`).join('')}</tr></thead><tbody></tbody></table>`;
        const tb = memo.querySelector('tbody');
        rows.forEach(([name, sub], r) => {
          const tr = document.createElement('tr');
          tr.innerHTML = `<th><b>${esc(name)}</b>${sub ? `<small>${esc(sub)}</small>` : ''}</th>`;
          cols.forEach((c, k) => {
            const td = document.createElement('td');
            const inp = document.createElement('input');
            inp.type = 'text'; inp.maxLength = 40; inp.placeholder = `${c} 변화`;
            inp.value = data[`${K}_${r}_${k}`] || '';
            inp.addEventListener('input', () => { data[`${K}_${r}_${k}`] = inp.value; save(); });
            td.append(inp); tr.append(td);
          });
          tb.append(tr);
        });
      } else if (q.dataset.fields) {
        // data-fields="이름::설명|이름::설명" → 항목마다 따로 쓰는 칸
        memo = document.createElement('div');
        memo.className = 'ws-fields';
        memo.innerHTML = '<div class="ws-fields-t">✏️ 내 생각 메모 (선택) · 활동지에 함께 저장돼요</div>';
        q.dataset.fields.split('|').forEach((f, k) => {
          const [name, ask, ph] = f.split('::'); // 이름::안내 문장::입력칸 안의 흐린 글씨
          const row = document.createElement('label');
          row.className = 'ws-field';
          row.innerHTML = `<b>${esc(name)}</b>${ask ? `<span class="ws-field-q">${esc(ask)}</span>` : ''}`;
          row.append(box(`${K}_${k}`, 2, ph || '관찰한 숫자와 느낌을 써 보세요', 'ws-memo'));
          memo.append(row);
        });
      } else memo = box(K, 2, '✏️ 내 생각 메모 (선택) · 활동지에 함께 저장돼요', 'ws-memo');
      q.after(memo);
      if (q.dataset.hint) memo.after(hintFor(q.dataset.hint));
    }));
    // 생각해보기 답 칸 (선택)과 힌트
    last.querySelectorAll('.think li').forEach((li, j) => {
      li.append(box('t' + j, 3, '답을 써 보세요', 'ws-memo ws-think'));
      if (li.dataset.hint) li.append(hintFor(li.dataset.hint));
    });

    // 필수 기록 3문항 + 제출
    const REQ = [
      [q1title, q1hint],
      ['내가 만든 필터 설명', q2],
      ['새로 궁금해진 점', '오늘 활동을 하며 새로 궁금해진 점이나, 앞으로 더 만들어 보고 싶은 필터를 써 주세요.']
    ];
    const MIN = 1; // 글자 수 기준은 보여주지 않는다 (최소 글자만 채우는 것을 막기 위해)
    last.dataset.title = last.dataset.title + '·제출';
    const block = document.createElement('div');
    block.className = 'ws-block';
    block.innerHTML = `
      <h3>📄 ${lesson}차시 활동지 제출</h3>
      <p class="small muted" style="margin:4px 0 12px">필수 기록 3개를 쓰고 이미지로 저장해서 카카오톡에 올려요. 모든 화면에서 쓴 답과 기록, 결과 이미지, 필터 코드가 자동으로 함께 담겨요.</p>
      <div class="ws-id">
        <label>학번 <input type="text" data-id="no" maxlength="10" placeholder="예: 10101"></label>
        <label>이름 <input type="text" data-id="name" maxlength="20"></label>
      </div>
      ${REQ.map(([t, h], k) => `
        <div class="ws-req">
          <div class="ws-req-t">필수 ${k + 1}. ${t}</div>
          ${h ? `<div class="small muted">${h}</div>` : ''}
          <div data-slot="${k}"></div>
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
      <div class="btn-row" style="margin-top:14px"><button class="btn grad" data-pdf>📷 활동지 이미지로 저장</button></div>
      <div class="box tip small" style="margin-top:12px">
        버튼을 누르면 활동지가 <b>그림 파일(PNG)</b>로 <b>다운로드 폴더</b>에 저장돼요. 그 파일을 카카오톡에 업로드 하면 끝!<br>
        ⚠️ 작성한 내용은 이 컴퓨터에 임시로 남지만, 컴퓨터실 PC는 껐다 켜면 지워질 수 있어요. 수업이 끝나기 전에 꼭 저장해서 제출해요.
      </div>`;
    last.querySelector('.step').append(block);

    block.querySelectorAll('[data-id]').forEach(inp => {
      inp.value = ident[inp.dataset.id] || '';
      inp.addEventListener('input', () => { ident[inp.dataset.id] = inp.value; write(ID_KEY, ident); });
    });
    REQ.forEach((_, k) => block.querySelector(`[data-slot="${k}"]`).append(box('r' + k, 4, '', 'ws-req-in')));

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
      if (short >= 0) { MF.toast(`필수 ${short + 1}번을 써 주세요.`); block.querySelector(`[data-slot="${short}"] textarea`).focus(); return; }
      const s = snapshot(), today = new Date();
      const date = `${today.getFullYear()}.${today.getMonth() + 1}.${today.getDate()}`;
      const memoOf = (q, K) => {
        if (q.dataset.table) {
          const cols = (q.dataset.cols || 'R|G|B').split('|');
          return q.dataset.table.split('|').map((row, r) => {
            const vals = cols.map((c, k) => [c, (data[`${K}_${r}_${k}`] || '').trim()]).filter(([, v]) => v);
            return vals.length ? `${row.split('::')[0]} — ${vals.map(([c, v]) => `${c}: ${v}`).join(', ')}` : '';
          }).filter(Boolean).join('\n');
        }
        if (q.dataset.fields) {
          return q.dataset.fields.split('|').map((f, k) => [f.split('::')[0], (data[`${K}_${k}`] || '').trim()])
            .filter(([, v]) => v).map(([n, v]) => `${n}: ${v}`).join('\n');
        }
        return data[K];
      };
      // 화면 순서대로: 그 화면의 입력 기록 + 질문과 답 (답하지 않은 질문도 모두)
      const recs = records() || {};
      const screenParts = screens.slice(0, -1).map((sc, i) => {
        const t = sc.dataset.title;
        const rec = (recs[t] || []).map(([k, v]) => `<div class="wp-q"><div class="wp-qt">${esc(k)}</div><div class="wp-a">${esc(String(v || '').trim() || '(작성하지 않음)')}</div></div>`);
        const qs = [...sc.querySelectorAll('.screen-q')].map((q, n) => {
          const v = memoOf(q, memoKey(i, n));
          return `<div class="wp-q"><div class="wp-qt">${esc(q.textContent.trim())}</div><div class="wp-a">${esc((v || '').trim() || '(작성하지 않음)')}</div></div>`;
        });
        return rec.length || qs.length ? `<h3>${i + 1}. ${esc(t)}</h3>${rec.join('')}${qs.join('')}` : '';
      }).join('');
      const thinks = [...last.querySelectorAll('.think li')].map((li, j) => [li.firstChild.textContent.trim(), (data['t' + j] || '').trim() || '(작성하지 않음)']);
      let pr = document.getElementById('wsPrint');
      if (!pr) { pr = document.createElement('div'); pr.id = 'wsPrint'; document.body.append(pr); }
      pr.innerHTML = `
        <div class="wp-head">
          <div><div class="wp-k">AI 융합캠프(조민기) · ${lesson}차시 활동지</div><h1>${esc(title)}</h1></div>
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
        <h2>화면별 활동 기록</h2>
        ${screenParts || '<p class="wp-none">기록할 내용이 없어요.</p>'}
        <h2>정리 질문</h2>
        ${thinks.length ? thinks.map(([q, a]) => `<div class="wp-q"><div class="wp-qt">${esc(q)}</div><div class="wp-a">${esc(a.trim())}</div></div>`).join('') : '<p class="wp-none">질문이 없어요.</p>'}`;
      const fileName = `${lesson}차시_활동지_${no}_${name}`;
      const btn = block.querySelector('[data-pdf]'), label = btn.textContent;
      btn.disabled = true; btn.textContent = '⏳ 이미지 만드는 중…';
      const imgs = [...pr.querySelectorAll('img')];
      Promise.all(imgs.map(im => im.complete ? 0 : new Promise(r => { im.onload = im.onerror = r; })))
        .then(loadHtml2Canvas)
        .then(() => { pr.classList.add('ws-render'); return window.html2canvas(pr, { scale: 2, backgroundColor: '#ffffff', logging: false }); })
        .then(canvas => { MF.download(canvas, fileName + '.png'); MF.toast('활동지 이미지를 다운로드 폴더에 저장했어요!'); })
        .catch(() => {
          // 이미지 도구를 못 불러오면(인터넷 끊김 등) 예전처럼 인쇄 창으로 PDF 저장
          MF.toast('이미지 저장이 안 돼서 인쇄 창을 열어요. 대상을 \'PDF로 저장\'으로 골라 주세요.');
          const oldTitle = document.title; document.title = fileName;
          setTimeout(() => { window.print(); document.title = oldTitle; }, 300);
        })
        .finally(() => { pr.classList.remove('ws-render'); btn.disabled = false; btn.textContent = label; });
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
    try { await navigator.clipboard.writeText(text); MF.toast('복사했어요! 메모장이나 카카오톡에 붙여넣어 두세요.'); }
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
  MF.OPEN_LESSONS = [1, 2, 3, 4];
  const lessonNo = href => { const m = /lesson(\d)\.html/.exec(href || ''); return m ? +m[1] : 0; };
  const isOpen = n => /[?&](preview|edit)/.test(location.search) || MF.OPEN_LESSONS.includes(n);
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

  /* ---------- 선생님용 수정 모드 (주소 끝에 ?edit) ----------
   * 글자를 그 자리에서 고치고, 상자·이미지에 메모를 붙인 뒤, 수정 요청 파일로 저장한다.
   * 학생 화면에는 나타나지 않는다. 고친 내용은 이 브라우저에만 저장되며 사이트 원본은 바뀌지 않는다.
   */
  if (/[?&]edit/.test(location.search)) (() => {
    const PAGE = (location.pathname.split('/').pop() || 'index.html').replace(/\?.*/, '');
    const KEY = 'mf-edit-' + PAGE;
    const PAGE_NAME = PAGE === 'index.html' ? '홈' : PAGE.replace(/lesson(\d)\.html/, '$1차시');
    const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || { texts: {}, notes: [] }; } catch (e) { return { texts: {}, notes: [] }; } };
    const st = load();
    const save = () => { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) {} update(); };
    const clean = t => String(t || '').replace(/\s+/g, ' ').trim();

    // 1) 페이지가 처음 불러와진 상태(정적 HTML)의 글자 요소만 고칠 수 있게 표시한다
    //    (차시 스크립트가 나중에 만드는 숫자·행렬 등은 원본 HTML에 없어서 제외)
    const SKIP = '.pager, .stepper, #photoBar, .ws-block, .mf-edit-bar, script, style, canvas, svg, input, textarea, select, .matrix';
    const CAND = 'h1, h2, h3, p, li, figcaption, label, .btn, .chip, .eyebrow, .matrix-label, .screen-q, .lbl, td, th, .formula, .goal span, .box h3, .mission';
    const orig = {};
    let n = 0;
    document.querySelectorAll(`main :is(${CAND}), footer`).forEach(el => {
      if (el.closest(SKIP) || el.parentElement.closest('[data-ed]')) return;
      const own = [...el.childNodes].some(c => c.nodeType === 3 && c.textContent.trim());
      if (!own) return;
      el.dataset.ed = 'e' + (n++);
      orig[el.dataset.ed] = { html: el.innerHTML.trim(), text: clean(el.textContent) };
    });

    const screenOf = el => {
      const sc = el.closest('.screen'); if (!sc) return PAGE_NAME;
      const all = [...document.querySelectorAll('.screen')];
      return `화면 ${all.indexOf(sc) + 1}. ${sc.dataset.title.replace(/·제출$/, '')}`;
    };
    // 메모를 붙인 요소를 다음에도 찾을 수 있게 main 기준 경로를 만든다
    const pathOf = el => {
      const parts = [];
      for (let e = el; e && e.tagName !== 'MAIN' && e !== document.body; e = e.parentElement) {
        parts.unshift(`${e.tagName.toLowerCase()}:nth-child(${[...e.parentElement.children].indexOf(e) + 1})`);
      }
      return parts.length ? 'main > ' + parts.join(' > ') : 'main';
    };
    const describe = el => {
      if (el.matches('.screen, main')) return '화면 전체';
      const kind = el.tagName === 'CANVAS' ? '사진/그림' : el.tagName === 'IMG' ? '이미지' : el.matches('.btn, button') ? '버튼' : el.matches('h1,h2,h3') ? '제목' : el.matches('p,li,.screen-q') ? '글' : '상자/영역';
      const own = clean(el.textContent);
      if (own && own.length <= 60) return `${kind} "${own}"`;
      // 글자가 없거나 너무 큰 영역은 이름(id/class)과 가까운 제목으로 설명한다
      const name = el.id || (el.className && typeof el.className === 'string' ? el.className.split(' ').filter(c => !c.startsWith('mf-'))[0] : '') || el.tagName.toLowerCase();
      const label = el.closest('div, figure, section');
      const head = clean((label && label.querySelector('.matrix-label, h3, figcaption')) ? label.querySelector('.matrix-label, h3, figcaption').textContent : '').slice(0, 30);
      return `${kind} (${name})${head ? ' · ' + head : ''}${own ? ` "${own.slice(0, 30)}…"` : ''}`;
    };

    // 저장된 글자 수정 되살리기
    Object.entries(st.texts).forEach(([id, v]) => { const el = document.querySelector(`[data-ed="${id}"]`); if (el && orig[id] && orig[id].text === v.from) el.innerHTML = v.html; });

    // 2) 도구 막대
    const bar = document.createElement('div');
    bar.className = 'mf-edit-bar';
    bar.innerHTML = `
      <b>✏️ 수정 모드 · ${PAGE_NAME}</b>
      <div class="mf-edit-modes">
        <button data-m="text" class="on">글자 고치기</button>
        <button data-m="note">📌 메모 붙이기</button>
        <button data-m="off">👆 체험하기</button>
      </div>
      <span class="mf-edit-count"></span>
      <button data-a="screen">이 화면 전체에 메모</button>
      <button data-a="save" class="mf-edit-save">💾 수정 내용 저장</button>
      <button data-a="list">목록</button>
      <button data-a="reset">모두 되돌리기</button>
      <div class="mf-edit-help"></div>`;
    document.body.append(bar);
    document.body.classList.add('mf-editing');
    const HELP = {
      text: '글자를 클릭하면 바로 고칠 수 있어요. 점선 테두리가 고칠 수 있는 글자예요. 다 고쳤으면 바깥을 클릭하세요.',
      note: '바꾸고 싶은 상자, 사진, 버튼을 클릭하면 메모를 남길 수 있어요. 예: "이 상자를 사진 위로", "이미지를 더 크게"',
      off: '학생처럼 사이트를 눌러 볼 수 있어요. 고치려면 위 버튼으로 모드를 바꾸세요.'
    };
    let mode = 'text';
    const setMode = m => {
      mode = m;
      bar.querySelectorAll('[data-m]').forEach(b => b.classList.toggle('on', b.dataset.m === m));
      document.body.classList.toggle('mf-mode-text', m === 'text');
      document.body.classList.toggle('mf-mode-note', m === 'note');
      document.querySelectorAll('[data-ed]').forEach(el => { if (m === 'text') el.setAttribute('contenteditable', 'true'); else el.removeAttribute('contenteditable'); });
      bar.querySelector('.mf-edit-help').textContent = HELP[m];
    };
    bar.querySelectorAll('[data-m]').forEach(b => b.addEventListener('click', () => setMode(b.dataset.m)));

    // 글자 고치기: 버튼·링크가 눌리지 않게 막고, 고친 내용은 바깥을 클릭하면 기록한다
    document.addEventListener('click', e => {
      if (e.target.closest('.mf-edit-bar, .mf-pop, .mf-pin')) return;
      if (mode === 'text' && e.target.closest('[data-ed]')) { e.preventDefault(); e.stopPropagation(); }
      if (mode === 'note') {
        const el = e.target.closest('main *, footer');
        if (!el || el.closest('.pager, .stepper')) return;
        e.preventDefault(); e.stopPropagation();
        openPop(el, e.pageX, e.pageY);
      }
    }, true);
    document.addEventListener('focusout', e => {
      const el = e.target.closest && e.target.closest('[data-ed]'); if (!el) return;
      const id = el.dataset.ed, now = clean(el.textContent);
      if (now === orig[id].text) delete st.texts[id];
      else st.texts[id] = { where: screenOf(el), from: orig[id].text, to: now, html: el.innerHTML.trim(), fromHtml: orig[id].html };
      save();
    });
    document.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey && e.target.closest && e.target.closest('[data-ed]')) { e.preventDefault(); e.target.blur(); } });

    // 메모 붙이기
    let hoverEl = null;
    document.addEventListener('mouseover', e => {
      if (mode !== 'note') return;
      const el = e.target.closest('main *, footer');
      if (hoverEl) hoverEl.classList.remove('mf-hover');
      hoverEl = el && !el.closest('.pager, .stepper, .mf-edit-bar') ? el : null;
      if (hoverEl) hoverEl.classList.add('mf-hover');
    });
    const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    function openPop(el, x, y, editIdx) {
      document.querySelector('.mf-pop')?.remove();
      const note = editIdx != null ? st.notes[editIdx] : null;
      const pop = document.createElement('div');
      pop.className = 'mf-pop';
      pop.innerHTML = `<div class="mf-pop-t">📌 ${esc(note ? note.where : screenOf(el))}<br><small>${esc(note ? note.target : describe(el))}</small></div>
        <textarea rows="4" placeholder="어떻게 바꾸고 싶은지 써 주세요. 예: 이 상자를 사진 위로 옮겨 주세요.">${esc(note ? note.memo : '')}</textarea>
        <div><button data-p="ok" class="mf-edit-save">저장</button> ${note ? '<button data-p="del">메모 삭제</button>' : ''} <button data-p="x">취소</button></div>`;
      pop.style.left = Math.min(x, window.scrollX + innerWidth - 340) + 'px';
      pop.style.top = (y + 12) + 'px';
      document.body.append(pop);
      pop.querySelector('textarea').focus();
      pop.addEventListener('click', ev => {
        const b = ev.target.closest('[data-p]'); if (!b) return;
        const memo = pop.querySelector('textarea').value.trim();
        if (b.dataset.p === 'ok' && memo) {
          if (note) note.memo = memo;
          else st.notes.push({ where: screenOf(el), target: describe(el), path: el === document.body ? null : pathOf(el), memo });
          save();
        }
        if (b.dataset.p === 'del') { st.notes.splice(editIdx, 1); save(); }
        pop.remove();
      });
    }
    // 메모 핀을 지금 보이는 요소 위에 그린다 (화면을 넘길 때마다 위치가 바뀌므로 주기적으로 다시 그림)
    const pinLayer = document.createElement('div');
    pinLayer.className = 'mf-pins';
    document.body.append(pinLayer);
    const drawPins = () => {
      pinLayer.innerHTML = '';
      st.notes.forEach((nt, i) => {
        const el = nt.path ? document.querySelector(nt.path) : null;
        if (!el) return;
        const r = el.getBoundingClientRect(); if (!r.width && !r.height) return;
        el.classList.add('mf-noted');
        const pin = document.createElement('button');
        pin.className = 'mf-pin'; pin.textContent = i + 1; pin.title = nt.memo;
        pin.style.left = (r.right + scrollX - 12) + 'px'; pin.style.top = (r.top + scrollY - 12) + 'px';
        pin.addEventListener('click', e => { e.stopPropagation(); openPop(el, e.pageX, e.pageY, i); });
        pinLayer.append(pin);
      });
    };
    setInterval(drawPins, 600);

    // 화면 전체 메모
    bar.querySelector('[data-a="screen"]').addEventListener('click', e => {
      const sc = document.querySelector('.screen.on') || document.querySelector('main');
      openPop(sc, e.pageX, e.pageY + 20);
    });

    // 3) 저장: 사람이 읽는 목록 + Claude가 읽는 JSON
    const report = () => {
      const d = new Date(), texts = Object.values(st.texts);
      const lines = [`[행렬 필터 연구소 수정 요청] ${PAGE_NAME} (${PAGE}) · ${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()}`, ''];
      lines.push(`■ 글자 수정 (${texts.length}개)`);
      texts.forEach((t, i) => lines.push(`${i + 1}. [${t.where}]`, `   전: ${t.from}`, `   후: ${t.to}`, ''));
      lines.push(`■ 메모 (${st.notes.length}개)`);
      st.notes.forEach((nt, i) => lines.push(`${i + 1}. [${nt.where}] ${nt.target}`, `   메모: ${nt.memo}`, ''));
      lines.push('---- 아래는 Claude가 반영할 때 읽는 정보예요 (지우지 마세요) ----');
      lines.push(JSON.stringify({ page: PAGE, texts, notes: st.notes }));
      return lines.join('\r\n');
    };
    bar.querySelector('[data-a="save"]').addEventListener('click', () => {
      document.activeElement && document.activeElement.blur && document.activeElement.blur();
      setTimeout(() => {
        if (!Object.keys(st.texts).length && !st.notes.length) { MF.toast('아직 수정한 내용이 없어요.'); return; }
        const blob = new Blob(['﻿' + report()], { type: 'text/plain;charset=utf-8' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob); a.download = `수정요청_${PAGE_NAME}.txt`;
        document.body.append(a); a.click(); a.remove();
        MF.toast('수정 요청 파일을 저장했어요. 다운로드 폴더를 확인하세요.');
      }, 50);
    });
    bar.querySelector('[data-a="list"]').addEventListener('click', () => {
      document.querySelector('.mf-list')?.remove();
      const box = document.createElement('div'); box.className = 'mf-pop mf-list';
      box.innerHTML = `<div class="mf-pop-t">수정 목록 · ${PAGE_NAME}</div><pre>${esc(report().split('---- 아래는')[0])}</pre><button data-p="x">닫기</button>`;
      box.style.left = (scrollX + 20) + 'px'; box.style.top = (scrollY + 80) + 'px';
      box.addEventListener('click', e => { if (e.target.closest('[data-p]')) box.remove(); });
      document.body.append(box);
    });
    bar.querySelector('[data-a="reset"]').addEventListener('click', () => {
      if (!confirm(`${PAGE_NAME}에서 고친 글자와 메모를 모두 지울까요?`)) return;
      Object.keys(st.texts).forEach(id => { const el = document.querySelector(`[data-ed="${id}"]`); if (el) el.innerHTML = orig[id].html; });
      st.texts = {}; st.notes = []; document.querySelectorAll('.mf-noted').forEach(el => el.classList.remove('mf-noted'));
      save();
    });
    function update() {
      bar.querySelector('.mf-edit-count').textContent = `글자 ${Object.keys(st.texts).length}곳 · 메모 ${st.notes.length}개`;
      document.querySelectorAll('[data-ed]').forEach(el => el.classList.toggle('mf-changed', !!st.texts[el.dataset.ed]));
    }
    setMode('text'); update();
  })();

  window.MF = MF;
})();
