// 화물기 모델(기수 = +z). 다온항공 747-8F형(2층 혹, 엔진 4발), 한빛카고 777F형(엔진 2발).
// 도장은 한국 국적 항공사 느낌(하늘색 상단·은회색 하단 / 흰 동체·색동 꼬리)을 참고한 가상 항공사다.
import { useMemo, type Ref } from 'react'
import * as THREE from 'three'
import { mat, cylGeo, sphereGeo, unitBox } from '../kit'
import { FONT, canvasTex } from '../textures'
import { lampMaterial } from '../env/state'
import { AC_LEN, DOOR } from '../../sim/airport'
import { L as tr } from '../../i18n'

export type Airline = 'daon' | 'hanbit'
const R = 3.05
const L = AC_LEN
const font = (w: number, px: number) => `${w} ${px}px ${FONT}`

/** 동체 단면 반지름: 기수(둥글게) → 원통 → 꼬리(가늘게) */
function fuselageGeo() {
  const pts: THREE.Vector2[] = []
  const n = 48
  for (let i = 0; i <= n; i++) {
    const t = i / n // 0 = 꼬리 끝, 1 = 기수 끝
    let r: number
    if (t < 0.24) r = R * (0.22 + 0.78 * Math.pow(t / 0.24, 0.75))
    else if (t < 0.86) r = R
    else r = R * Math.sqrt(Math.max(0, 1 - Math.pow((t - 0.86) / 0.14, 2)))
    pts.push(new THREE.Vector2(Math.max(0.001, r), -L / 2 + t * L))
  }
  const g = new THREE.LatheGeometry(pts, 40)
  // 회전축 y → z(기수 방향). 회전 후 u=0 아래, 0.25 왼쪽(+x), 0.5 위, 0.75 오른쪽
  g.rotateX(Math.PI / 2)
  // 꼬리를 살짝 들어 올린다
  const p = g.attributes.position as THREE.BufferAttribute
  for (let i = 0; i < p.count; i++) {
    const z = p.getZ(i)
    if (z < -L / 2 + L * 0.24) {
      const k = 1 - (z + L / 2) / (L * 0.24)
      p.setY(i, p.getY(i) + k * k * 1.6)
    }
  }
  g.computeVertexNormals()
  return g
}

/** 동체 도장: 캔버스 가로 = 둘레(u), 세로 = 길이(위쪽이 기수) */
function fuselageTex(airline: Airline) {
  return canvasTex(`fus-${airline}`, 1024, 2048, (ctx, w, h) => {
    const daon = airline === 'daon'
    // 아래(u=0)·오른쪽 아래는 은회색, 위는 하늘색(다온) / 흰색(한빛)
    ctx.fillStyle = daon ? '#D5DAE1' : '#C9CDD4'
    ctx.fillRect(0, 0, w, h)
    const top0 = w * (daon ? 0.31 : 0.27)
    const top1 = w * (daon ? 0.69 : 0.73)
    ctx.fillStyle = daon ? '#83C6EA' : '#F6F7F9'
    ctx.fillRect(top0, 0, top1 - top0, h)
    // 경계선
    ctx.fillStyle = daon ? '#2B6FAE' : '#8C939E'
    ctx.fillRect(top0 - 6, 0, 6, h)
    ctx.fillRect(top1, 0, 6, h)
    if (!daon) {
      // 한빛: 아랫부분 진회색 띠
      ctx.fillStyle = '#7B828D'
      ctx.fillRect(0, 0, w * 0.12, h)
      ctx.fillRect(w * 0.88, 0, w * 0.12, h)
    }
    // 조종석 창(기수 위)
    ctx.fillStyle = '#1C2433'
    for (const s of [-1, 1]) {
      ctx.save()
      ctx.translate(w * 0.5 + s * w * 0.06, h * 0.03)
      ctx.rotate(s * 0.25)
      ctx.fillRect(-w * 0.035, -h * 0.004, w * 0.07, h * 0.012)
      ctx.restore()
    }
    // 글자: 왼쪽(u≈0.38)은 기수→꼬리, 오른쪽(u≈0.62)은 꼬리→기수로 읽힌다
    const title = daon ? 'DAON AIR CARGO' : 'HANBIT CARGO'
    const kor = tr(daon ? '다온항공' : '한빛카고', '') // 영어 화면은 영문 이름만
    const color = daon ? '#0B3F75' : '#3A3F4A'
    const drawSide = (u: number, rot: number) => {
      ctx.save()
      ctx.translate(w * u, h * 0.5)
      ctx.rotate(rot)
      ctx.fillStyle = color
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.font = font(900, 92)
      ctx.fillText(title, -h * 0.05, 0)
      ctx.font = font(800, 80)
      ctx.fillText(kor, h * 0.3, 0)
      ctx.restore()
    }
    drawSide(0.4, Math.PI / 2)
    drawSide(0.6, -Math.PI / 2)
    // 등록 기호
    ctx.save()
    ctx.translate(w * 0.36, h * 0.86)
    ctx.rotate(Math.PI / 2)
    ctx.fillStyle = color
    ctx.font = font(700, 40)
    ctx.fillText(daon ? 'HL7601' : 'HL8227', 0, 0)
    ctx.restore()
  })
}

/** 수직 꼬리날개 도장(정사각 캔버스, 모양 좌표를 그대로 UV로 쓴다) */
function finTex(airline: Airline) {
  return canvasTex(`fin-${airline}`, 512, 512, (ctx, w, h) => {
    if (airline === 'daon') {
      ctx.fillStyle = '#FFFFFF'
      ctx.fillRect(0, 0, w, h)
      // 원형 상징: 파란 원 + 빨간 날개 곡선(가상)
      const cx = w * 0.55
      const cy = h * 0.42
      ctx.fillStyle = '#2B6FAE'
      ctx.beginPath(); ctx.arc(cx, cy, 120, 0, Math.PI * 2); ctx.fill()
      ctx.fillStyle = '#E2463C'
      ctx.beginPath()
      ctx.moveTo(cx - 120, cy + 8)
      ctx.bezierCurveTo(cx - 60, cy - 80, cx + 40, cy + 60, cx + 120, cy - 8)
      ctx.lineTo(cx + 120, cy - 40)
      ctx.bezierCurveTo(cx + 40, cy + 20, cx - 60, cy - 120, cx - 120, cy - 24)
      ctx.fill()
      ctx.fillStyle = '#FFFFFF'
      ctx.beginPath(); ctx.arc(cx, cy, 34, 0, Math.PI * 2); ctx.fill()
    } else {
      // 색동 줄무늬
      ctx.fillStyle = '#F6F7F9'
      ctx.fillRect(0, 0, w, h)
      const bands = ['#E2463C', '#F2B92B', '#2E9E5B', '#2F6FDB', '#F6F7F9', '#E86AA6', '#7A4CC2']
      const bw = 46
      ctx.save()
      ctx.translate(0, h)
      ctx.rotate(-0.42)
      bands.forEach((c, i) => {
        ctx.fillStyle = c
        ctx.fillRect(-200, -h * 0.55 - i * bw, w * 2, bw)
      })
      ctx.restore()
    }
  })
}

/** 사다리꼴 날개 단면(평면형) → 두께를 준 메시 */
function wingGeo(span: number, root: number, tip: number, sweep: number, thick: number) {
  const s = new THREE.Shape()
  const off = Math.tan(sweep) * span
  // x = 스팬(바깥쪽), y = 앞뒤(+y = 앞)
  s.moveTo(0, root / 2)
  s.lineTo(span, root / 2 - off)
  s.lineTo(span, root / 2 - off - tip)
  s.lineTo(0, -root / 2)
  s.closePath()
  const g = new THREE.ExtrudeGeometry(s, { depth: thick, bevelEnabled: true, bevelThickness: thick * 0.25, bevelSize: thick * 0.25, bevelSegments: 1 })
  g.translate(0, 0, -thick / 2)
  // 모양 평면(xy)을 수평(xz)으로: +y(앞) → +z
  g.rotateX(Math.PI / 2)
  return g
}

function finGeo(h: number, root: number, tip: number, sweep: number) {
  const s = new THREE.Shape()
  const off = Math.tan(sweep) * h
  // x = 앞뒤(+x = 앞), y = 높이
  s.moveTo(root / 2, 0)
  s.lineTo(root / 2 - off, h)
  s.lineTo(root / 2 - off - tip, h)
  s.lineTo(-root / 2, 0)
  s.closePath()
  const g = new THREE.ShapeGeometry(s)
  // UV를 0~1로
  g.computeBoundingBox()
  const bb = g.boundingBox!
  const uv = g.attributes.uv as THREE.BufferAttribute
  const pos = g.attributes.position as THREE.BufferAttribute
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (pos.getX(i) - bb.min.x) / (bb.max.x - bb.min.x), (pos.getY(i) - bb.min.y) / (bb.max.y - bb.min.y))
  g.rotateY(-Math.PI / 2)
  return g
}

function Engine({ p, big }: { p: [number, number, number]; big?: boolean }) {
  const r = big ? 1.75 : 1.25
  const len = big ? 7 : 5.2
  return (
    <group position={p}>
      <mesh geometry={cylGeo(r, r * 0.82, len, 24)} rotation={[Math.PI / 2, 0, 0]} material={mat('#E9ECF1', { rough: 0.4, metal: 0.2 })} castShadow />
      <mesh geometry={cylGeo(r * 0.86, r * 0.86, 0.1, 24)} rotation={[Math.PI / 2, 0, 0]} position={[0, 0, len / 2 + 0.02]} material={mat('#262B35')} />
      <mesh geometry={cylGeo(r * 0.3, 0.05, 1.2, 12)} rotation={[Math.PI / 2, 0, 0]} position={[0, 0, len / 2 + 0.5]} material={mat('#3A4050', { metal: 0.4 })} />
      <mesh geometry={cylGeo(r * 0.55, r * 0.35, 1.6, 16)} rotation={[Math.PI / 2, 0, 0]} position={[0, 0, -len / 2 - 0.6]} material={mat('#9DA4B0', { metal: 0.5, rough: 0.4 })} />
      {/* 파일런 */}
      <mesh geometry={unitBox} position={[0, r + 0.5, 0.6]} scale={[0.35, 1.2, len * 0.7]} material={mat('#D3D8E0')} />
    </group>
  )
}

function Gear({ p, bogie }: { p: [number, number, number]; bogie?: boolean }) {
  const tire = mat('#23262E')
  return (
    <group position={p}>
      <mesh geometry={unitBox} position={[0, -1.4, 0]} scale={[0.22, 2.8, 0.22]} material={mat('#B8BEC8', { metal: 0.4 })} />
      {(bogie ? [-0.9, 0.9] : [0]).flatMap((dz) => [-0.45, 0.45].map((dx) => (
        <mesh key={`${dz}${dx}`} geometry={cylGeo(0.62, 0.62, 0.38, 16)} rotation={[0, 0, Math.PI / 2]} position={[dx, -2.75, dz]} material={tire} castShadow />
      )))}
    </group>
  )
}

export interface AircraftRefs {
  gear?: Ref<THREE.Group>
  door?: Ref<THREE.Group>
  beacon?: Ref<THREE.Mesh>
}

export function AircraftModel({ airline, refs }: { airline: Airline; refs?: AircraftRefs }) {
  const jumbo = airline === 'daon'
  const m = useMemo(() => {
    const body = new THREE.MeshStandardMaterial({ map: fuselageTex(airline), roughness: 0.42, metalness: 0.15 })
    const fin = new THREE.MeshStandardMaterial({ map: finTex(airline), roughness: 0.45, side: THREE.DoubleSide })
    const wing = new THREE.MeshStandardMaterial({ color: '#D6DBE3', roughness: 0.5, metalness: 0.2 })
    const hump = new THREE.MeshStandardMaterial({ color: jumbo ? '#83C6EA' : '#F6F7F9', roughness: 0.42 })
    for (const x of [body, fin, wing, hump]) x.userData.snow = 0.4
    return { body, fin, wing, hump }
  }, [airline, jumbo])
  const geo = useMemo(() => ({
    fus: fuselageGeo(),
    wing: wingGeo(27, 13, 3.4, 0.6, 0.7),
    stab: wingGeo(10.5, 6.5, 2.4, 0.66, 0.35),
    fin: finGeo(11.5, 10, 3.6, 0.72),
  }), [])
  const engines: [number, number, number][] = jumbo ? [[8.6, -1.6, 2.6], [17.2, -1.0, -3.4]] : [[9.6, -1.9, 1.6]]
  return (
    <group>
      <mesh geometry={geo.fus} material={m.body} castShadow receiveShadow />
      {jumbo && (
        // 747 2층 혹
        <mesh geometry={sphereGeo(1, 24, 14)} position={[0, R * 0.55, L * 0.27]} scale={[R * 0.72, R * 0.78, L * 0.2]} material={m.hump} castShadow />
      )}
      {/* 주날개 · 수평 꼬리날개(좌우) */}
      {[1, -1].map((s) => (
        <group key={s} scale={[s, 1, 1]}>
          <mesh geometry={geo.wing} position={[R * 0.6, -R * 0.55, 4]} rotation={[0, 0, 0.07]} material={m.wing} castShadow />
          <mesh geometry={geo.stab} position={[0.6, 0.9, -L / 2 + 6]} rotation={[0, 0, 0.1]} material={m.wing} castShadow />
          {engines.map((e, i) => <Engine key={i} p={e} big={!jumbo} />)}
          {/* 날개 끝 항법등: 왼쪽(+x) 빨강, 오른쪽 초록 */}
          <mesh geometry={sphereGeo(0.22, 8, 6)} position={[R * 0.6 + 27, -R * 0.55 + 1.9, 4 - Math.tan(0.6) * 27 + 13 / 2 - 2]} material={lampMaterial(mat(s > 0 ? '#FF3B30' : '#2BD96B', { emissive: s > 0 ? '#FF3B30' : '#2BD96B', emissiveIntensity: 1.2 }))} />
        </group>
      ))}
      {/* 수직 꼬리날개(양면 도장 + 가운데 두께) */}
      <group position={[0, R * 0.7, -L / 2 + 7]}>
        <mesh geometry={geo.fin} position={[0.2, 0, 0]} material={m.fin} castShadow />
        <mesh geometry={geo.fin} position={[-0.2, 0, 0]} material={m.fin} />
        <mesh geometry={sphereGeo(0.2, 8, 6)} position={[0, 11.3, -5.6]} material={lampMaterial(mat('#FFFFFF', { emissive: '#FFFFFF', emissiveIntensity: 1 }))} />
      </group>
      {/* 충돌 방지등(빨강, 깜빡임) */}
      <mesh ref={refs?.beacon} geometry={sphereGeo(0.28, 10, 8)} position={[0, R + 0.15, 2]} material={lampMaterial(mat('#FF2D2D', { emissive: '#FF2D2D', emissiveIntensity: 1.5 }))} userData={{ noMerge: true }} />
      {/* 착륙장치 */}
      <group ref={refs?.gear}>
        <Gear p={[0, -R + 0.2, L / 2 - 8]} />
        {(jumbo ? [[2.6, -1], [-2.6, -1], [4.4, 2.2], [-4.4, 2.2]] : [[3.4, -0.5], [-3.4, -0.5]]).map(([x, z], i) => <Gear key={i} p={[x, -R + 0.25, z]} bogie />)}
      </group>
      {/* 왼쪽 후방 화물문: 위쪽 경첩으로 열린다 */}
      <group position={[DOOR.x - 0.05, 0.8, DOOR.z]} ref={refs?.door}>
        <mesh geometry={unitBox} position={[0.12, -1.5, 0]} scale={[0.14, 3.0, 3.6]} material={m.wing} userData={{ noMerge: true }} />
      </group>
      <mesh geometry={unitBox} position={[DOOR.x - 0.2, -0.7, DOOR.z]} scale={[0.1, 3.0, 3.4]} material={mat('#1E232D')} />
    </group>
  )
}
