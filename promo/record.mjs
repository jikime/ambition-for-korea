// 홍보 영상 녹화기(ego-browser nodejs로 실행). 설정은 promo/config.json.
//  preview: 장면마다 몇 장만 1배 해상도로 저장해 구도를 확인한다
//  full: 2배 해상도(3840×2160)로 그려 1080p로 줄이며, 장면마다 ffmpeg로 바로 인코딩한다(프레임을 디스크에 쌓지 않음)
// 사용: ego-browser nodejs < promo/record.mjs
const fs = await import('node:fs/promises')
const cp = await import('node:child_process')
// ego-browser 스크립트는 작업 폴더가 '/'라서 절대 경로가 필요하다. 다른 컴퓨터에서는 이 줄만 고친다
const ROOT = '/Users/jikime/Dev/Private/Experimental/Logistics/promo/'
const cfg = JSON.parse(await fs.readFile(ROOT + 'config.json', 'utf8'))
const clock = await fs.readFile(ROOT + 'clock.js', 'utf8')
const director = await fs.readFile(ROOT + 'director.js', 'utf8')
cfg.out = cfg.out.startsWith('/') ? cfg.out : ROOT + cfg.out
const full = cfg.mode === 'full'
const dsf = full ? cfg.dsf ?? 1.5 : 1
await fs.mkdir(cfg.out, { recursive: true })

// 매번 새 공간에서 연다: 같은 페이지에 가상 시계 스크립트가 겹쳐 주입되면 클릭이 먹지 않는다
const task = await taskSpace(`HubTrace 홍보 영상 ${new Date().toISOString().slice(11, 19)}`)
console.log('space', task.spaceId)
const page = task.page('p1')
await page.cdp('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, deviceScaleFactor: dsf, mobile: false })
await page.cdp('Page.addScriptToEvaluateOnNewDocument', { source: clock })
await page.goto(cfg.url ?? 'http://localhost:5188/')
await page.waitForFunction(() => !!window.__sim, undefined, { timeout: 40000 })
// 한국어 화면, AI는 끈 상태에서 시작(영상 중간에 스위치로 켠다). 둘 다 이 탭에만 저장된다
await page.evaluate(() => {
  sessionStorage.setItem('hubtrace.lang', 'ko')
  sessionStorage.setItem('hubtrace.ai.on', '0')
})
await page.reload()
await page.waitForFunction(() => !!window.__sim && !!window.__controls && !!window.__promo && !!document.querySelector('button[aria-label="AI 설정"]'), undefined, { timeout: 40000 })
await page.waitForTimeout(4000)
await page.evaluate(director)
// 자막 글자(Pretendard 부분 글꼴)를 미리 불러 둔다
await page.evaluate((src) => {
  const d = document.createElement('div')
  d.style.cssText = 'position:fixed;left:0;top:0;opacity:0.01;font-family:"Pretendard Variable";font-size:20px;font-weight:900;width:10px;height:10px;overflow:hidden'
  d.textContent = src
  document.body.appendChild(d)
  const d2 = d.cloneNode(true)
  d2.style.fontWeight = '600'
  document.body.appendChild(d2)
  return document.fonts.ready.then(() => true)
}, director)
await page.waitForTimeout(2500)
await page.evaluate(() => window.__promo.start())
const scenes = await page.evaluate(() => window.__director.scenes)
const pick = cfg.scenes ?? scenes.map((_, i) => i)
const t0 = Date.now()

const shoot = async () => {
  const r = await page.cdp('Page.captureScreenshot', { format: 'jpeg', quality: full ? 93 : 82 })
  return Buffer.from(r.data, 'base64')
}

for (const i of pick) {
  const sc = scenes[i]
  await page.evaluate((i) => window.__director.setup(i), i)
  let ff = null
  let done = null
  if (full) {
    const file = `${cfg.out}${String(i).padStart(2, '0')}-${sc.name}.mp4`
    ff = cp.spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', '30', '-c:v', 'mjpeg', '-i', '-',
      '-vf', 'scale=1920:1080:flags=lanczos,format=yuv420p', '-c:v', 'libx264', '-preset', 'medium', '-crf', '14', '-r', '30', file])
    done = new Promise((res) => ff.on('close', res))
    ff.stderr.on('data', (d) => console.log('ffmpeg', String(d)))
  }
  const marks = new Set((cfg.previewAt ?? [0.04, 0.3, 0.55, 0.8, 0.97]).map((k) => Math.min(sc.frames - 1, Math.round(k * sc.frames))))
  for (let f = 0; f < sc.frames; f++) {
    await page.evaluate(([i, f]) => window.__director.frame(i, f), [i, f])
    if (full) {
      const buf = await shoot()
      if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r))
    } else if (marks.has(f)) {
      await fs.writeFile(`${cfg.out}${String(i).padStart(2, '0')}-${sc.name}-${String(f).padStart(4, '0')}.jpg`, await shoot())
    }
  }
  if (ff) {
    ff.stdin.end()
    await done
  }
  console.log(`scene ${i} ${sc.name} ${sc.frames}f · ${((Date.now() - t0) / 60000).toFixed(1)}분`)
}
const errs = await page.evaluate(() => window.__errs ?? null)
console.log('done', ((Date.now() - t0) / 60000).toFixed(1), 'min', errs ? JSON.stringify(errs) : '')
await task.finish({ keep: [] })
