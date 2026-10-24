// 홍보 영상 연출(페이지 안에서 실행). 장면마다 카메라·환경·화면 UI·자막을 시간(t, 초)의 함수로 정한다.
// record.mjs가 장면 준비(setup) 후 프레임마다 frame(i, f)를 부르고 화면을 찍는다.
// 시간은 clock.js의 가상 시계로만 흐르므로, 같은 연출이면 결과도 늘 같다(Jev 응답 시점만 예외).
(() => {
  const S = window.__sim
  const ST = window.__store
  const C = window.__controls
  const P = window.__promo
  const FPS = 30
  const DT = 1 / FPS

  // ───────────── 화면 정리: 카메라 초점 이동(패널 피하기)을 끄고, 3D 화면을 상단 바 아래까지 채운다
  const realFocal = C.setFocalOffset.bind(C)
  realFocal(0, 0, 0, false)
  C.setFocalOffset = () => Promise.resolve()
  const canvasBox = document.querySelector('#root > div > div.absolute.inset-0')
  if (canvasBox) canvasBox.style.top = '0px'
  const uiRoot = document.querySelector('#root > div > div.pointer-events-none')

  // ───────────── 자막 레이어
  const style = document.createElement('style')
  style.textContent = `
  #promo{position:fixed;inset:0;z-index:99999;pointer-events:none;font-family:'Pretendard Variable',Pretendard,sans-serif;color:#fff;-webkit-font-smoothing:antialiased}
  #promo .layer{position:absolute;inset:0}
  #promo .shade{background:radial-gradient(ellipse at center,rgba(6,10,26,.5) 0%,rgba(6,10,26,.9) 100%)}
  #promo .black{background:#04060c}
  #promo .lowbg{top:auto;height:460px;background:linear-gradient(to top,rgba(5,9,22,.78),rgba(5,9,22,0))}
  #promo .hook{position:absolute;left:0;right:0;top:43%;text-align:center;font-size:68px;font-weight:800;letter-spacing:-.025em;text-shadow:0 2px 6px rgba(0,0,0,.45),0 4px 34px rgba(0,0,0,.6)}
  #promo .hook small{display:block;margin-top:16px;font-size:30px;font-weight:600;opacity:.9;letter-spacing:-.01em}
  #promo .title{position:absolute;left:0;right:0;top:35%;text-align:center}
  #promo .title .brand{font-size:150px;font-weight:900;letter-spacing:-.045em;line-height:1}
  #promo .title .brand span{color:#7F9BFF}
  #promo .title .sub{margin-top:26px;font-size:36px;font-weight:650;opacity:.95;letter-spacing:-.015em}
  #promo .title .tags{margin-top:30px;font-size:21px;font-weight:600;opacity:.72;letter-spacing:.02em}
  #promo .lower{position:absolute;left:84px;bottom:92px;max-width:1240px}
  #promo .lower .chip{display:inline-block;padding:7px 13px;border-radius:9px;background:#3D63FF;font-size:21px;font-weight:800;letter-spacing:.05em;vertical-align:middle}
  #promo .lower .kicker{display:inline-block;margin-left:14px;font-size:23px;font-weight:650;opacity:.88;vertical-align:middle}
  #promo .lower .name{margin-top:14px;font-size:70px;font-weight:900;letter-spacing:-.035em;line-height:1.05;text-shadow:0 3px 26px rgba(0,0,0,.45)}
  #promo .lower .desc{margin-top:14px;font-size:29px;font-weight:600;line-height:1.5;text-shadow:0 2px 18px rgba(0,0,0,.65)}
  #promo .pill{position:absolute;left:50%;top:96px;padding:15px 30px;border-radius:999px;background:rgba(10,16,38,.86);font-size:29px;font-weight:700;white-space:nowrap;box-shadow:0 12px 40px rgba(0,0,0,.28);letter-spacing:-.01em}
  #promo .pill b{color:#9DB4FF;font-weight:800}
  #promo .pill i{font-style:normal;color:#FFB08A;font-weight:800;margin-right:12px}
  #promo .mark{position:absolute;right:56px;top:44px;font-size:28px;font-weight:900;letter-spacing:-.03em;text-shadow:0 2px 14px rgba(0,0,0,.55)}
  #promo .mark span{color:#8FA8FF}
  `
  document.head.appendChild(style)
  const root = document.createElement('div')
  root.id = 'promo'
  root.innerHTML = `
    <div class="layer shade" data-k="shade"></div>
    <div class="layer lowbg" data-k="lowbg"></div>
    <div class="mark" data-k="mark">Hub<span>Trace</span></div>
    <div class="hook" data-k="hook"></div>
    <div class="title" data-k="title"><div class="brand">Hub<span>Trace</span></div><div class="sub"></div><div class="tags"></div></div>
    <div class="lower" data-k="lower"><span class="chip"></span><span class="kicker"></span><div class="name"></div><div class="desc"></div></div>
    <div class="pill" data-k="pill"></div>
    <div class="layer black" data-k="black"></div>`
  document.body.appendChild(root)
  const el = Object.fromEntries([...root.querySelectorAll('[data-k]')].map((e) => [e.dataset.k, e]))
  const html = new Map()
  const setHTML = (e, h) => {
    if (html.get(e) !== h) {
      html.set(e, h)
      e.innerHTML = h
    }
  }
  const op = (e, o, dy = 0, x = '') => {
    e.style.opacity = String(Math.max(0, Math.min(1, o)))
    e.style.transform = `${x}translateY(${dy}px)`
  }

  // ───────────── 수학
  const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v))
  const lerp = (a, b, k) => a + (b - a) * k
  const smooth = (k) => {
    k = clamp(k)
    return k * k * (3 - 2 * k)
  }
  const glide = (k) => 0.35 * clamp(k) + 0.65 * smooth(k)
  /** 구간 [a, b] 안에서 보이는 정도(들어올 때 fi초, 나갈 때 fo초) */
  /** 시각 a에 해당하는 프레임 한 번만 참(버튼 누르기처럼 두 번 하면 안 되는 일에 쓴다) */
  const once = (t, a) => t >= a - DT / 2 && t < a + DT / 2
  const win = (t, a, b, fi = 0.6, fo = 0.6) => (t < a || t > b ? 0 : Math.min(smooth((t - a) / fi), smooth((b - t) / fo)))

  // ───────────── 자막 상태: 장면마다 매 프레임 다시 정한다
  let cap = null
  const reset = () => {
    cap = { shade: 0, black: 0, lowbg: 0, mark: 0, hook: null, title: null, lower: null, pill: null }
  }
  const hook = (t, items) => {
    for (const [a, b, text, small] of items) {
      const o = win(t, a, b, 0.55, 0.45)
      if (o > 0) cap.hook = { o, text, small, rise: (1 - smooth((t - a) / 0.8)) * 18 }
    }
  }
  const pill = (t, items) => {
    for (const [a, b, h] of items) {
      const o = win(t, a, b, 0.4, 0.4)
      if (o > 0) cap.pill = { o, h }
    }
  }
  const lower = (t, a, b, chip, kicker, name, desc) => {
    const o = win(t, a, b, 0.7, 0.6)
    if (o > 0) {
      cap.lower = { o, chip, kicker, name, desc, dx: (1 - smooth((t - a) / 0.9)) * -40 }
      cap.lowbg = Math.max(cap.lowbg, o)
    }
  }
  const render = () => {
    if (uiO > 0.05) cap.mark = 0
    // 영화 같은 숏에서 큰 문구가 밝은 바닥 위에서도 읽히게 화면을 살짝 어둡게
    if (cap.hook && uiO < 0.5) cap.shade = Math.max(cap.shade, 0.38 * cap.hook.o)
    op(el.shade, cap.shade)
    op(el.black, cap.black)
    op(el.lowbg, cap.lowbg)
    op(el.mark, cap.mark)
    if (cap.hook) {
      setHTML(el.hook, cap.hook.text + (cap.hook.small ? `<small>${cap.hook.small}</small>` : ''))
      op(el.hook, cap.hook.o, cap.hook.rise)
    } else op(el.hook, 0)
    if (cap.title) {
      setHTML(el.title.querySelector('.sub'), cap.title.sub)
      setHTML(el.title.querySelector('.tags'), cap.title.tags ?? '')
      op(el.title, cap.title.o, (1 - cap.title.o) * 16)
    } else op(el.title, 0)
    if (cap.lower) {
      const l = cap.lower
      setHTML(el.lower.querySelector('.chip'), l.chip)
      setHTML(el.lower.querySelector('.kicker'), l.kicker)
      setHTML(el.lower.querySelector('.name'), l.name)
      setHTML(el.lower.querySelector('.desc'), l.desc)
      el.lower.style.opacity = String(l.o)
      el.lower.style.transform = `translateX(${l.dx}px)`
    } else op(el.lower, 0)
    // 화면 UI가 보일 때는 앱 알림(상단 가운데)과 겹치지 않게 조금 아래에 띄운다
    el.pill.style.top = uiO > 0.5 ? '168px' : '96px'
    if (cap.pill) {
      setHTML(el.pill, cap.pill.h)
      op(el.pill, cap.pill.o, (1 - cap.pill.o) * -10, 'translateX(-50%) ')
    } else op(el.pill, 0, 0, 'translateX(-50%) ')
  }

  // ───────────── 화면 UI · 환경 · 속도
  let uiO = 0
  const ui = (target, rate = 3) => {
    uiO += (target - uiO) * (1 - Math.exp(-DT * rate * 3))
    if (Math.abs(uiO - target) < 0.01) uiO = target
    if (uiRoot) {
      uiRoot.style.opacity = String(uiO)
      uiRoot.style.visibility = uiO < 0.01 ? 'hidden' : 'visible'
    }
  }
  const uiNow = (v) => {
    uiO = v
    ui(v)
  }
  const env = (season, time, weather) => ST.getState().setEnv({ season, time, weather })
  const speed = (n) => ST.getState().setSpeed(n)
  const store = () => ST.getState()
  /** 렌더 없이 시뮬레이션만 앞당긴다(장면 사이 컷에서만) */
  const seek = (pred, max = 6000) => {
    for (let i = 0; i < max; i++) {
      if (pred()) return true
      S.step(0.1)
    }
    return pred()
  }
  /** 화면을 찍지 않고 몇 프레임 흘려 환경 전환·카메라를 자리 잡게 한다 */
  const settle = (ms = 3200) => {
    for (let k = 0; k < ms / 400; k++) P.step(400)
  }
  const unselect = () => {
    store().select(null)
    ST.setState({ follow: false })
  }
  const pick = (sel, site) => {
    store().select(sel, site)
    ST.setState({ follow: false })
  }
  const tagsHidden = (on) => document.body.classList.toggle('promo-notags', on)
  const tagStyle = document.createElement('style')
  tagStyle.textContent = 'body.promo-notags .story-tag{display:none!important}'
  document.head.appendChild(tagStyle)

  // ───────────── 카메라
  const sph = (c, d, az, pol) => [c[0] + d * Math.sin(pol) * Math.sin(az), c[1] + d * Math.cos(pol), c[2] + d * Math.sin(pol) * Math.cos(az)]
  const look = (p, t) => C.setLookAt(p[0], p[1], p[2], t[0], t[1], t[2], false)
  /** 궤도 숏: 중심 c 둘레를 거리·방위·고도각을 바꾸며 돈다 */
  const orbit = (k, c, d0, d1, az0, az1, pol0, pol1, c1 = c) => {
    const e = glide(k)
    const cc = [lerp(c[0], c1[0], e), lerp(c[1], c1[1], e), lerp(c[2], c1[2], e)]
    look(sph(cc, lerp(d0, d1, e), lerp(az0, az1, e), lerp(pol0, pol1, e)), cc)
  }
  /** 따라가기 숏: 대상 뒤쪽 위에서 부드럽게 따라간다(back·height·side는 대상 진행 방향 기준) */
  let chase = null
  const follow = (pos, heading, o, snap = false) => {
    const fx = Math.sin(heading)
    const fz = Math.cos(heading)
    const want = [pos[0] - fx * o.back + fz * (o.side ?? 0), pos[1] + o.height, pos[2] - fz * o.back - fx * (o.side ?? 0)]
    const tgt = [pos[0] + fx * (o.lead ?? 0), pos[1] + (o.ty ?? 0), pos[2] + fz * (o.lead ?? 0)]
    if (!chase || snap) chase = { p: want, t: tgt, h: heading }
    const kp = 1 - Math.exp(-DT * (o.lag ?? 2.2))
    const kt = 1 - Math.exp(-DT * 6)
    for (let i = 0; i < 3; i++) {
      chase.p[i] += (want[i] - chase.p[i]) * kp
      chase.t[i] += (tgt[i] - chase.t[i]) * kt
    }
    look(chase.p, chase.t)
  }
  /** 고정 방향에서 대상을 내려다보며 따라간다(방향이 자주 바뀌는 대상용) */
  const track = (pos, d, az, pol, snap = false) => {
    if (!chase || snap) chase = { p: sph(pos, d, az, pol), t: [...pos] }
    const kt = 1 - Math.exp(-DT * 3.2)
    for (let i = 0; i < 3; i++) chase.t[i] += (pos[i] - chase.t[i]) * kt
    look(sph(chase.t, d, az, pol), chase.t)
  }
  const vpos = (id) => {
    const p = S.locate('vehicle', id)
    return p ? [p.x, 0, p.z] : null
  }

  // ───────────── 장면
  const scenes = []
  const scene = (name, dur, setup, frame) => scenes.push({ name, dur, setup, frame })

  // 0. 오프닝: 전국 네트워크 위로(석양)
  scene('open', 14, () => {
    env('autumn', 'day', 'clear')
    speed(2)
    unselect()
    uiNow(0)
    tagsHidden(true)
    settle(4000)
  }, (t) => {
    // 곤지암 허브 바로 위에서 시작해 하늘로 올라가며 전국 네트워크를 드러낸다
    const k = t / 14
    const e = smooth(k)
    const c = [lerp(-6, -240, e), 0, lerp(-20, 30, e)]
    const d = 90 * Math.pow(1700 / 90, smooth(clamp(k * 1.15)))
    look(sph(c, d, lerp(0.55, 0.35, e), lerp(0.82, 0.9, e)), c)
    cap.shade = 0.12 + 0.6 * win(t, 9, 14, 0.8, 0.01)
    hook(t, [
      [0.8, 4.6, '오늘도 18만 개의 상자가 움직입니다'],
      [5.0, 8.6, '트럭 · 배 · 비행기 · 로봇', '6개 거점이 하나의 네트워크로'],
    ])
    const o = win(t, 9.2, 14, 0.8, 0.01)
    if (o > 0) cap.title = { o, sub: '한국 물류의 모든 움직임을, 하나의 3D 관제 화면에', tags: '' }
  })

  // 1. 관제 화면 공개
  scene('dashboard', 16, () => {
    env('autumn', 'day', 'clear')
    speed(2)
    store().setSite('GJ')
    ST.setState({ trackMode: 'story', view: 'site' })
    unselect()
    tagsHidden(false)
    uiNow(0)
    settle(3600)
  }, (t) => {
    orbit(t / 16, [10, 0, -14], 300, 190, 0.2, 0.55, 0.85, 0.92)
    ui(t > 0.6 ? 1 : 0, 2.2)
    if (once(t, 8)) {
      const w = S.vehicles.find((v) => v.site === 'GJ' && v.kind === 'wing' && v.visible) ?? S.vehicles.find((v) => v.site === 'GJ' && v.visible)
      if (w) pick({ kind: 'vehicle', id: w.id }, 'GJ')
    }
    pill(t, [
      [1.6, 7.6, '<b>실시간 3D 물류 관제</b> · 차량·지게차·크레인·화물기가 실제처럼 움직입니다'],
      [8.4, 15.4, '무엇이든 누르면 <b>지금 무엇을 하는지</b> 바로 보입니다'],
    ])
  })

  // 2~7. 거점 소개: 넓은 숏 10초 + 가까운 숏 10초
  const site = (key, info, wide, close, prep) => {
    scene(`site-${key}`, 20, () => {
      env('autumn', 'day', 'clear')
      speed(2)
      unselect()
      store().setSite(key)
      uiNow(0)
      tagsHidden(true)
      chase = null
      prep?.()
      settle(2400)
    }, (t) => {
      if (t < 10) wide(t / 10)
      else close((t - 10) / 10, t - 10)
      cap.mark = 1
      lower(t, 0.5, 9.3, info.code, info.kind, info.name, info.desc)
      lower(t, 10.6, 19.4, info.code, info.kind, info.name2, info.desc2)
    })
  }

  site('IC', {
    code: 'IC-03', kind: '풀필먼트 · 콜드체인', name: '이천 풀필먼트센터',
    desc: '주문이 들어오면 AMR 로봇이 선반째 작업자에게 가져옵니다',
    name2: '피킹 → 포장 → 랩핑 → 상차', desc2: '랩핑한 파렛트를 지게차가 5톤 윙바디에 실어 곤지암으로 보냅니다',
  }, (k) => orbit(k, [452, 0, -30], 230, 175, -0.35, 0.15, 0.9, 0.84),
  (k) => orbit(k, [456, 1, -2], 78, 58, 0.35, 0.85, 0.82, 0.74))

  site('GJ', {
    code: 'GJ-01', kind: '전국 허브', name: '곤지암 메가허브',
    desc: '전국에서 모인 택배를 행선지별로 나누는 심장부',
    name2: '크로스벨트 소터', desc2: '유리 지붕 아래 루프 소터가 시간당 약 3만 개를 6개 행선지로 나눕니다',
  }, (k) => orbit(k, [-4, 0, -12], 250, 185, 0.95, 0.45, 0.9, 0.82),
  (k) => orbit(k, [-8, 1, -26], 70, 52, 0.25, 0.7, 0.72, 0.66))

  site('IN', {
    code: 'IN-05', kind: '서브터미널', name: '인천 서브터미널',
    desc: '간선 탑차에서 내린 상자가 컨베이어를 타고 동네별로 나뉩니다',
    name2: '휠소터 → 기사별 슈트', desc2: '스캐너가 송장을 읽고, 휠소터가 상자를 기사별 슈트로 밀어 1톤 탑차에 싣습니다',
  }, (k) => orbit(k, [-470, 0, -22], 150, 115, 0.35, 0.8, 0.86, 0.8),
  (k) => orbit(k, [-490, 1, -24], 46, 36, 1.0, 0.55, 0.7, 0.64))

  let twVan = null
  site('TW', {
    code: 'TW-01', kind: '라스트마일', name: '다온마을 배송구역',
    desc: '아파트 6개 동, 빌라, 편의점과 무인택배함이 있는 동네',
    name2: '문 앞까지 마지막 100m', desc2: '기사는 배송 메모대로 문 앞·경비실·택배함으로 걷고, 오토바이·배송 로봇·드론도 함께 달립니다',
  }, (k) => orbit(k, [-470, 0, 150], 300, 210, 0.75, 1.15, 0.9, 0.84),
  (k, tt) => {
    const v = twVan && S.vehicle(twVan)
    const p = v && v.visible ? vpos(v.id) : null
    if (p) track(p, 46, 0.95 + tt * 0.02, 0.82, tt < DT)
    else orbit(k, [-470, 0, 150], 90, 70, 0.9, 1.2, 0.8, 0.76)
  }, () => {
    seek(() => S.vehicles.some((v) => v.site === 'TW' && v.visible && v.phase === 'delivering' && v.z > 120), 3000)
    twVan = S.vehicles.find((v) => v.site === 'TW' && v.visible && v.phase === 'delivering' && v.z > 120)?.id ?? null
  })

  site('BS', {
    code: 'BS-04', kind: '항만 물류', name: '부산신항',
    desc: '컨테이너선이 접안하면 자동화 터미널이 밤낮없이 돌아갑니다',
    name2: '안벽 크레인 · AGV · 야드 크레인', desc2: '안벽 크레인이 내린 컨테이너를 무인 운반차가 옮기고, 자동화 크레인이 장치장에 쌓습니다',
  }, (k) => orbit(k, [258, 0, 250], 360, 270, Math.PI + 0.35, Math.PI + 0.85, 0.92, 0.84),
  (k) => orbit(k, [255, 12, 296], 110, 82, Math.PI + 0.15, Math.PI + 0.55, 0.92, 0.86))

  site('AP', {
    code: 'AP-06', kind: '항공 화물', name: '인천공항 화물터미널',
    desc: '활주로와 주기장, 관제탑, 화물터미널까지',
    name2: '내리고, 싣고, 다시 하늘로', desc2: '착륙한 화물기에서 ULD를 내리고, 메인덱 로더로 수출 화물을 실어 다시 띄웁니다',
  }, (k) => orbit(k, [-905, 0, -165], 470, 360, Math.PI - 0.35, Math.PI - 0.8, 0.9, 0.82),
  (k) => {
    const s = S.airport.stands.find((x) => x.ac >= 0) ?? S.airport.stands[0]
    const sp = [[-955, -125], [-845, -125]][s.k]
    orbit(k, [sp[0] - 6, 4, sp[1] - 4], 105, 80, Math.PI - 0.15, Math.PI - 0.6, 0.9, 0.82)
  }, () => {
    seek(() => S.airport.stands.some((s) => s.ac >= 0 && /하역|적재/.test(s.label)), 6000)
  })

  // 8. 계절 · 날씨 · 시간대
  scene('seasons', 45, () => {
    env('spring', 'day', 'clear')
    speed(1.5)
    unselect()
    store().setSite('TW')
    uiNow(0)
    tagsHidden(true)
    settle(3600)
  }, (t) => {
    orbit(t / 45, [-462, 0, 146], 240, 175, 0.55, 1.75, 0.88, 0.84)
    const at = (a) => once(t, a)
    if (at(10)) env('summer', 'day', 'rain')
    if (at(20.5)) env('autumn', 'sunset', 'clear')
    if (at(31)) env('winter', 'night', 'snow')
    cap.mark = 1
    hook(t, [
      [0.6, 9.4, '봄', '벚꽃이 날리는 오후'],
      [10.8, 19.8, '여름', '장대비가 쏟아지는 날'],
      [21.2, 30.4, '가을', '석양과 낙엽'],
      [31.8, 38.6, '겨울', '눈 내리는 밤, 창마다 불이 켜집니다'],
    ])
    if (at(39.2)) {
      const b = document.querySelector('button[aria-label="현재 시각과 환경 설정"]')
      b?.click()
    }
    ui(t > 39 ? 1 : 0, 2.5)
    pill(t, [[39.6, 44.6, '계절 · 시간대 · 날씨는 <b>오늘 날짜와 현재 시각</b>을 따라 자동으로, 직접 고를 수도 있습니다']])
    if (at(44.7)) document.querySelector('button[aria-label="현재 시각과 환경 설정"]')?.click()
  })

  // 9. 해상 수입 컨테이너 따라가기
  let seaTruck = null
  scene('sea', 45, () => {
    env('autumn', 'day', 'clear')
    speed(4)
    S.sea.start()
    seek(() => S.sea.stage >= 1, 6000)
    store().setSite('BS')
    pick({ kind: 'story', id: 'sea' }, 'BS')
    ST.setState({ trackMode: 'sea' })
    uiNow(1)
    tagsHidden(false)
    chase = null
    seaTruck = null
  }, (t) => {
    const at = (a) => once(t, a)
    if (at(10)) {
      seek(() => S.sea.stage >= 5 && !!S.sea.truck, 9000)
      seaTruck = S.sea.truck
      chase = null
    }
    if (at(20)) {
      seek(() => {
        const v = seaTruck && S.vehicle(seaTruck)
        return S.sea.stage >= 6 && !!v && v.phase === 'highway' && v.x < 150
      }, 9000)
      chase = null
    }
    if (at(33)) {
      seek(() => S.sea.stage >= 7, 9000)
      chase = null
    }
    if (t < 10) {
      const p = S.sea.pos()
      track([p.x, p.y * 0.5, p.z], 88, Math.PI + 0.5 + t * 0.01, 0.9, t < DT)
    } else {
      const id = seaTruck ?? S.sea.truck
      const v = id && S.vehicle(id)
      const p = v ? vpos(v.id) : null
      if (p && t < 20) track(p, 70, Math.PI + 0.7, 0.88, t - 10 < DT)
      else if (p && t < 33) follow(p, v.heading, { back: 38, height: 20, lead: 14, lag: 2.6 }, t - 20 < DT)
      else if (p) track(p, 85, 0.6, 0.88, t - 33 < DT)
    }
    pill(t, [
      [0.5, 9.6, '<i>해상 수입</i>상하이에서 온 컨테이너 한 대를 따라갑니다'],
      [10.4, 19.6, '<i>STEP 6</i>육측 야드 크레인이 <b>트레일러</b>에 싣습니다'],
      [20.4, 32.6, '<i>STEP 7</i>부산신항 → 곤지암, <b>간선 운송</b>'],
      [33.4, 44.6, '<i>STEP 8</i>곤지암 CY에서 내려 <b>적출</b> · 이제 택배로 갈라집니다'],
    ])
  })

  // 10. 항공 수출: 트럭 → 화물기 → 이륙
  let airAc = null
  scene('air', 28, () => {
    env('autumn', 'day', 'clear')
    speed(4)
    // 곤지암 항공 도크에서 싣고 있는 트럭으로 여정을 시작한다
    seek(() => S.vehicles.some((v) => v.home === 'AP' && v.site === 'GJ' && v.phase === 'loading'), 12000)
    S.air.start()
    seek(() => {
      const v = S.air.truck && S.vehicle(S.air.truck)
      return S.air.stage >= 1 && !!v && v.x < -560
    }, 12000)
    store().setSite('AP')
    pick({ kind: 'story', id: 'air' }, 'AP')
    ST.setState({ trackMode: 'air' })
    uiNow(1)
    tagsHidden(false)
    chase = null
    airAc = null
  }, (t) => {
    const at = (a) => once(t, a)
    if (at(7)) {
      seek(() => S.air.stage >= 5 && !!S.air.ac, 12000)
      chase = null
    }
    if (at(14)) {
      seek(() => !!S.air.ac && (S.air.ac.phase === 'lineup' || S.air.ac.phase === 'takeoff'), 9000)
      airAc = S.air.ac
      chase = null
      // 이륙은 ×2로 천천히 보여 준다
      speed(2)
    }
    if (t < 7) {
      const v = S.air.truck && S.vehicle(S.air.truck)
      const p = v ? vpos(v.id) : null
      if (p) follow(p, v.heading, { back: 34, height: 17, lead: 12, lag: 2.6 }, t < DT)
    } else if (t < 14) {
      const p = S.air.pos()
      track([p.x, 3, p.z], 70, Math.PI - 0.35, 0.86, t - 7 < DT)
    } else {
      const a = airAc ?? S.air.ac
      if (a) follow([a.x, a.y, a.z], Math.PI / 2, { back: 105, height: 26, side: 62, lead: 30, ty: 6, lag: 4.5 }, t - 14 < DT)
    }
    pill(t, [
      [0.5, 6.6, '<i>항공 수출</i>역직구 상자를 싣고 <b>인천공항</b>으로'],
      [7.4, 13.6, '<i>STEP 6</i>메인덱 로더가 ULD를 <b>화물기</b>에 싣습니다'],
      [14.4, 27.6, `<i>STEP 8</i><b>이륙</b> · ${S.air.dest || '해외'}행`],
    ])
  })

  // 11. AI(Jev): 교통 정보 한 줄 → 막힌 구간 판독 → 경로 반영
  scene('ai', 22, () => {
    env('autumn', 'day', 'clear')
    speed(2)
    unselect()
    store().showNetwork()
    ST.setState({ trackMode: 'story' })
    uiNow(1)
    tagsHidden(true)
    settle(1600)
  }, (t) => {
    orbit(t / 22, [250, 0, 0], 760, 640, 0.15, 0.35, 0.8, 0.76)
    const at = (a) => once(t, a)
    const q = (s) => document.querySelector(s)
    if (at(0.8)) q('button[aria-label="Jev 설정"]')?.click()
    if (at(2.0)) q('button[role="switch"]')?.getAttribute('aria-checked') === 'false' && q('button[role="switch"]').click()
    if (at(4.2)) q('button[aria-label="Jev 설정"]')?.click()
    if (at(5.0)) q('button[aria-label="현장 보고·돌발 상황"]')?.click()
    if (at(5.6)) [...document.querySelectorAll('button')].find((b) => b.textContent?.startsWith('돌발 상황'))?.click()
    const text = '영동고속도로 이천IC 부근 화물차 추돌, 2개 차로 통제 중'
    if (t > 6.2 && t < 9.6) {
      const input = q('input[aria-label="돌발 상황 입력"]')
      if (input) {
        const n = Math.round(clamp((t - 6.2) / 3) * text.length)
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, text.slice(0, n))
        input.dispatchEvent(new Event('input', { bubbles: true }))
      }
    }
    if (at(9.8)) q('input[aria-label="돌발 상황 입력"]')?.form?.requestSubmit()
    pill(t, [
      [0.6, 5.0, '<i>AI</i>상단 스위치로 <b>Jev</b>를 켭니다'],
      [5.4, 10.4, '교통 정보 한 줄을 입력하면'],
      [10.8, 21.6, 'Jev가 <b>막힌 구간과 영향</b>을 읽고 → 코드가 <b>속도·도착 시간</b>을 다시 계산합니다'],
    ])
  })

  // 12. 엔딩: 밤의 네트워크
  scene('finale', 14, () => {
    env('autumn', 'night', 'clear')
    speed(2)
    unselect()
    uiNow(0)
    tagsHidden(true)
    settle(4000)
  }, (t) => {
    orbit(t / 14, [-120, 0, 40], 1350, 1900, 0.95, 0.6, 0.9, 0.96, [-260, 0, 30])
    cap.shade = 0.2 + 0.6 * win(t, 3.5, 14, 1.2, 0.01)
    hook(t, [[0.6, 3.6, '택배 한 상자가 문 앞에 닿기까지']])
    const o = win(t, 4, 14, 1.0, 0.01)
    if (o > 0) cap.title = { o, sub: '물류의 모든 순간을, 한 화면에', tags: '3D 실시간 물류 시뮬레이션 · AI 판독 Jev · React Three Fiber' }
    cap.black = smooth((t - 12.6) / 1.4)
  })

  window.__director = {
    scenes: scenes.map((s) => ({ name: s.name, dur: s.dur, frames: Math.round(s.dur * FPS) })),
    setup(i) {
      reset()
      render()
      chase = null
      scenes[i].setup?.()
    },
    frame(i, f) {
      reset()
      scenes[i].frame(f / FPS)
      render()
      P.step(1000 / FPS)
    },
  }
})()
