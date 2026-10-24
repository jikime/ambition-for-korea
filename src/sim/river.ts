// 강: 북쪽 산골짜기에서 내려와 간선 다리 · 철교 아래를 지나 바다로 드는 강의 중심선(화면 world/Terrain.tsx와 내륙 화물선이 같이 쓴다)
//  - 평지 구간 폭 34m, 산골짜기 22m. 다리는 모두 지면 높이라 배는 다리 밑을 지나지 못한다
//  - 대전 강변 부두: 곤지암 철송선 철교(z −100) 북쪽 서쪽 둑을 30m 파낸 정박지(배가 제자리에서 돌 수 있는 폭)와 안벽
export const RIVER: [number, number][] = [
  [818, -2150], [796, -1700], [826, -1300], [800, -950], [812, -700], [796, -480], [806, -250], [794, 0], [806, 180], [800, 300], [802, 420],
]
export const RIVER_W = 34

/** 중심선 위 한 점(균등 캣멀-롬). t는 0~RIVER.length-1 */
function riverAt(t: number): [number, number] {
  const n = RIVER.length
  const i = Math.max(0, Math.min(n - 2, Math.floor(t)))
  const u = t - i
  const p = (k: number) => RIVER[Math.max(0, Math.min(n - 1, k))]
  const [p0, p1, p2, p3] = [p(i - 1), p(i), p(i + 1), p(i + 2)]
  const f = (a: number, b: number, c: number, d: number) =>
    0.5 * (2 * b + (-a + c) * u + (2 * a - 5 * b + 4 * c - d) * u * u + (-a + 3 * b - 3 * c + d) * u * u * u)
  return [f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]
}

/** 중심선을 촘촘히 뽑은 점들(북 → 남) */
export const RIVER_LINE: [number, number][] = (() => {
  const out: [number, number][] = []
  for (let i = 0; i < RIVER.length - 1; i++) for (let k = 0; k < 40; k++) out.push(riverAt(i + k / 40))
  out.push(RIVER[RIVER.length - 1])
  return out
})()

/** z 위치의 강 중심 x */
export function riverX(z: number) {
  for (let i = 0; i < RIVER_LINE.length - 1; i++) {
    const [ax, az] = RIVER_LINE[i]
    const [bx, bz] = RIVER_LINE[i + 1]
    if ((z - az) * (z - bz) <= 0 && az !== bz) return ax + ((bx - ax) * (z - az)) / (bz - az)
  }
  return RIVER_LINE[z < RIVER_LINE[0][1] ? 0 : RIVER_LINE.length - 1][0]
}

/** 대전 강변 부두(정박지 · 안벽 · 야적장) */
export const WHARF = (() => {
  const z = -180
  const cx = riverX(z)
  const quayX = cx - RIVER_W / 2 - 30
  return {
    /** 배를 돌리고 대는 기준 z */
    z,
    /** 정박지 물: 안벽에서 강 중심까지(강 물과 겹친다) */
    basin: { x0: quayX, x1: cx, z0: -285, z1: -125 },
    quayX,
    /** 야적장(안벽 뒤) */
    apron: { x0: quayX - 32, x1: quayX, z0: -285, z1: -125 },
    /** 제자리에서 도는 점(물 폭 가운데) */
    pivot: { x: (quayX + cx + RIVER_W / 2) / 2, z },
    /** 안벽에 댄 배 중심(배 폭 9.5m) */
    berth: { x: quayX + 0.8 + 4.75, z },
    /** 하류로 오다 정박지로 꺾는 점 */
    entry: { x: (quayX + cx + RIVER_W / 2) / 2, z: z - 52 },
  }
})()
