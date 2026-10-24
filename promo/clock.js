// 홍보 영상 녹화용 가상 시계. 페이지 스크립트보다 먼저 주입한다(Page.addScriptToEvaluateOnNewDocument).
// __promo.start() 이후에는 requestAnimationFrame·performance.now·Date.now·setTimeout·setInterval이
// 실제 시간이 아니라 __promo.step(ms)로만 흐른다. 한 번 step할 때 한 프레임이 그려지므로
// 캡처가 느려도 영상은 정확히 30fps로 매끄럽다.
(() => {
  const realRAF = window.requestAnimationFrame.bind(window)
  const realNow = performance.now.bind(performance)
  const realDateNow = Date.now
  const realSetTimeout = window.setTimeout.bind(window)
  const realSetInterval = window.setInterval.bind(window)
  const realClearTimeout = window.clearTimeout.bind(window)
  const realClearInterval = window.clearInterval.bind(window)
  let manual = false
  let vt = 0
  let dateBase = 0
  let raf = []
  let rafId = 1
  const timers = new Map()
  let timerId = 1e6
  performance.now = () => (manual ? vt : realNow())
  Date.now = () => (manual ? dateBase + vt : realDateNow())
  window.requestAnimationFrame = (cb) => {
    if (!manual) return realRAF(cb)
    const id = rafId++
    raf.push({ id, cb })
    return id
  }
  const realCancel = window.cancelAnimationFrame.bind(window)
  window.cancelAnimationFrame = (id) => {
    if (!manual) return realCancel(id)
    raf = raf.filter((r) => r.id !== id)
  }
  const add = (cb, ms, args, repeat) => {
    const id = timerId++
    timers.set(id, { cb, at: vt + Math.max(0, ms || 0), ms: Math.max(1, ms || 0), args, repeat })
    return id
  }
  window.setTimeout = (cb, ms, ...args) => (manual && typeof cb === 'function' ? add(cb, ms, args, false) : realSetTimeout(cb, ms, ...args))
  window.setInterval = (cb, ms, ...args) => (manual && typeof cb === 'function' ? add(cb, ms, args, true) : realSetInterval(cb, ms, ...args))
  window.clearTimeout = (id) => (timers.has(id) ? timers.delete(id) : realClearTimeout(id))
  window.clearInterval = (id) => (timers.has(id) ? timers.delete(id) : realClearInterval(id))
  window.__promo = {
    get manual() {
      return manual
    },
    get vt() {
      return vt
    },
    start() {
      if (manual) return
      vt = realNow()
      dateBase = realDateNow() - vt
      manual = true
    },
    /** 가상 시간을 ms만큼 흘리고, 그 사이 만기된 타이머와 rAF 콜백(한 프레임)을 실행한다 */
    step(ms) {
      const end = vt + ms
      for (let guard = 0; guard < 500; guard++) {
        let next = null
        for (const [id, t] of timers) if (t.at <= end && (!next || t.at < next[1].at)) next = [id, t]
        if (!next) break
        const [id, t] = next
        vt = Math.max(vt, t.at)
        if (t.repeat) t.at += t.ms
        else timers.delete(id)
        try {
          t.cb(...(t.args || []))
        } catch (e) {
          console.error(e)
        }
      }
      vt = end
      const q = raf
      raf = []
      for (const r of q) {
        try {
          r.cb(vt)
        } catch (e) {
          console.error(e)
        }
      }
    },
  }
})()
