// 로딩 화면(index.html의 #boot)에 단계를 알린다. 진행률 범위(%):
//  code 0~18(JS 받기, index.html이 스스로) → sim 18~42(시뮬레이션 예열) → scene 42~52(장면 구성)
//  → assets 52~90(GLB · 텍스처, 실제 받은 개수) → render 90~100(셰이더 미리 컴파일 · 첫 프레임) → 사라짐
// 로딩 화면이 없으면(테스트 등) 아무 일도 하지 않는다.
type BootStep = 'code' | 'sim' | 'scene' | 'assets' | 'render'
interface BootApi {
  step(key: BootStep, from: number, cap: number): void
  set(p: number, detail?: string): void
  done(): void
  onDone(f: () => void): void
  readonly finished: boolean
}

const api = (): BootApi | undefined => (globalThis as { __boot?: BootApi }).__boot

export const boot = {
  step: (key: BootStep, from: number, cap: number) => api()?.step(key, from, cap),
  set: (p: number, detail?: string) => api()?.set(p, detail),
  done: () => api()?.done(),
  /** 로딩 화면이 사라진 뒤(없으면 바로) */
  onDone: (f: () => void) => {
    const a = api()
    if (a) a.onDone(f)
    else f()
  },
  get finished() {
    return api()?.finished ?? true
  },
}

/** 다음 화면 그리기까지 기다린다(바로 이어지는 무거운 작업 전에 단계 문구가 먼저 보이게) */
export const nextPaint = () => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())))
