import * as THREE from 'three'
import { cutawayMaterial, lampMaterial, windowMaterial } from '../env/state'
import { useMemo, type ReactNode } from 'react'
import { useFrame } from '@react-three/fiber'
import { B, COLORS, Cyl, RB, boxUV, coneGeo, cylGeo, mat, sphereGeo, torusGeo, unitBox, unitPlane } from '../kit'
import { AtlasSign, atlasMat, signId, townUV } from '../townAtlas'
import { aptFaceMat, officeFaceMat } from '../sharedMats'
export { aptFaceMat, officeFaceMat }
import { corrugatedTex, labelTex, roofTex, shutterTex, signTex, solarTex, windowsTex, canvasTex, fillFit, FONT } from '../textures'
import { L } from '../../i18n'

export { solarTex }
import { Decal } from './structures'

function repeated(tex: THREE.Texture, rx: number, ry: number) {
  const t = tex.clone()
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.repeat.set(rx, ry)
  t.needsUpdate = true
  return t
}

const font = (w: number, px: number) => `${w} ${px}px ${FONT}`

/** 가게 간판 */
export function shopSignTex(text: string, bg: string, fg = '#FFFFFF') {
  return canvasTex(`shop-${text}-${bg}`, 512, 128, (ctx, w, h) => {
    ctx.fillStyle = bg
    ctx.fillRect(0, 0, w, h)
    ctx.fillStyle = fg
    ctx.font = font(800, 62)
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(text, w / 2, h / 2 + 3)
  })
}

function lockerTex() {
  return canvasTex('locker', 512, 340, (ctx, w, h) => {
    ctx.fillStyle = '#2F55E6'
    ctx.fillRect(0, 0, w, h)
    ctx.fillStyle = '#FFFFFF'
    ctx.font = font(800, 30)
    ctx.fillText(L('다온 무인택배함', 'Daon Parcel Locker'), 18, 36)
    for (let c = 0; c < 6; c++) {
      for (let r = 0; r < 5; r++) {
        if (c === 2 && r < 3) continue
        ctx.fillStyle = (c + r) % 4 === 0 ? '#DCE6FF' : '#EEF2FC'
        ctx.fillRect(14 + c * 82, 54 + r * 56, 76, 50)
        ctx.fillStyle = '#8FA2D9'
        ctx.fillRect(14 + c * 82 + 62, 54 + r * 56 + 20, 6, 12)
      }
    }
    ctx.fillStyle = '#16203A'
    ctx.fillRect(14 + 2 * 82, 54, 76, 160)
    ctx.fillStyle = '#35D07F'
    ctx.fillRect(14 + 2 * 82 + 10, 70, 56, 36)
  })
}


function rollerTex() {
  return canvasTex('rollers', 64, 64, (ctx, w, h) => {
    ctx.fillStyle = '#7C8597'
    ctx.fillRect(0, 0, w, h)
    for (let y = 0; y < h; y += 8) {
      ctx.fillStyle = '#B8C0CF'
      ctx.fillRect(0, y, w, 5)
    }
  }, { repeat: [1, 8] })
}

function wheelSorterTex() {
  return canvasTex('wheel-sorter', 128, 64, (ctx, w, h) => {
    ctx.fillStyle = '#3B4252'
    ctx.fillRect(0, 0, w, h)
    for (let x = 4; x < w; x += 12) {
      for (let y = 6; y < h; y += 14) {
        ctx.fillStyle = '#7CD1A0'
        ctx.beginPath()
        ctx.ellipse(x + 3, y + 3, 3, 5, 0.6, 0, Math.PI * 2)
        ctx.fill()
      }
    }
  }, { repeat: [12, 1] })
}

// ───────────────────────── 이천 풀필먼트센터

/** 유리 지붕(AMR 구역) + 일반 지붕(보관·콜드체인) 건물 */
export function FulfillmentCenter({ b, glassX1, refs }: {
  b: { x0: number; x1: number; z0: number; z1: number; h: number }
  glassX1: number
  refs?: { reefers: (THREE.Object3D | null)[]; docks: number[] }
}) {
  const { x0, x1, z0, z1, h } = b
  const D = z1 - z0
  const cz = (z0 + z1) / 2
  const oW = x1 - glassX1
  const ocx = (glassX1 + x1) / 2
  const mats = useMemo(() => {
    const corr = corrugatedTex('#F1F3F9', '#D9DFEB')
    const front = new THREE.MeshStandardMaterial({ map: repeated(corr, oW / 6, 1), roughness: 0.8 })
    const side = new THREE.MeshStandardMaterial({ map: repeated(corr, D / 6, 1), roughness: 0.8 })
    const roof = new THREE.MeshStandardMaterial({ map: repeated(roofTex('#3A60EE'), oW / 10, 1), roughness: 0.65 })
    return { box: [side, side, roof, roof, front, front] as THREE.Material[] }
  }, [oW, D])
  const wallMat = useMemo(() => windowMaterial(new THREE.MeshStandardMaterial({ map: repeated(windowsTex('office'), 8, 0.6), roughness: 0.4, metalness: 0.05 }), 'office'), [])
  const frontMat = useMemo(() => cutawayMaterial(windowMaterial(new THREE.MeshStandardMaterial({ map: repeated(windowsTex('office'), 8, 0.6), roughness: 0.4, metalness: 0.05 }), 'office'), 'IC'), [])
  const glass = useMemo(() => new THREE.MeshStandardMaterial({ color: '#CFE0FF', transparent: true, opacity: 0.1, depthWrite: false, roughness: 0.35 }), [])
  const solar = useMemo(() => new THREE.MeshStandardMaterial({ map: solarTex(), roughness: 0.25, metalness: 0.3 }), [])
  const shutter = useMemo(() => new THREE.MeshStandardMaterial({ map: shutterTex('#DCE2EE'), roughness: 0.6 }), [])
  const gW = glassX1 - x0
  const gcx = (x0 + glassX1) / 2
  return (
    <group>
      {/* 보관·콜드체인 동 */}
      <mesh geometry={unitBox} position={[ocx, h / 2, cz]} scale={[oW, h, D]} material={mats.box} castShadow receiveShadow />
      <B s={[oW + 0.3, 0.9, D + 0.3]} p={[ocx, h - 0.45, cz]} c={COLORS.brand} />
      <B s={[oW + 0.2, 0.8, D + 0.2]} p={[ocx, 0.4, cz]} c="#C8D0E2" />
      {[-20, -10, 0, 10].map((dz) =>
        [0, 1, 2].map((k) => (
          <mesh key={`${dz}${k}`} geometry={unitBox} position={[glassX1 + 8 + k * 14, h + 0.6, cz + dz]} rotation={[-0.25, 0, 0]} scale={[12, 0.12, 7]} material={solar} castShadow />
        )),
      )}
      <Decal tex={signTex(L('다온 풀필먼트', 'Daon Fulfillment'), L('이천 FC · IC-03', 'Icheon FC · IC-03'))} w={15} h={3.75} p={[glassX1 + 18, 8.6, z1 + 0.06]} />
      <Decal tex={labelTex(L('콜드체인 -18℃', 'Cold Chain -18℃'), '#13A39A', '#FFFFFF', 480, 96)} w={7} h={1.4} p={[499.5, 7.2, z1 + 0.06]} />
      {/* 유리 지붕 AMR 동: 벽 + 트러스 + 유리 */}
      <mesh geometry={unitBox} position={[gcx, h / 2, z0]} scale={[gW, h, 0.4]} material={wallMat} castShadow receiveShadow />
      <mesh geometry={unitBox} position={[x0, h / 2, cz]} scale={[0.4, h, D]} material={wallMat} castShadow receiveShadow />
      {/* 앞벽 윗부분: 카메라가 가까이 오면 녹아 없어져 안(피킹·분류기)이 보인다 */}
      <mesh geometry={unitBox} position={[gcx, h / 2 + 2.5, z1]} scale={[gW, h - 5, 0.4]} material={frontMat} userData={{ skip: true }} receiveShadow />
      <B s={[gW, 2.5, 0.4]} p={[gcx, 1.25, z1]} c="#E6EAF3" />
      {Array.from({ length: Math.floor(gW / 7) + 1 }, (_, i) => x0 + i * 7).map((x) => (
        <B key={x} s={[0.3, 0.5, D]} p={[x, h, cz]} c="#F4F6FB" />
      ))}
      <B s={[gW, 0.5, 0.3]} p={[gcx, h, z0]} c="#F4F6FB" />
      <B s={[gW, 0.5, 0.3]} p={[gcx, h, z1]} c="#F4F6FB" />
      <mesh geometry={unitPlane} scale={[gW, 1, D]} position={[gcx, h + 0.3, cz]} material={glass} />
      <mesh geometry={unitPlane} scale={[gW - 0.6, 1, D - 0.6]} position={[gcx, 0.04, cz]} material={mat('#E4E8F1')} receiveShadow />
      {/* 출고 라인 벽 개구부 */}
      {[417, 443, 469].map((x) => (
        <B key={x} s={[1.8, 1.6, 0.1]} p={[x, 0.9, z1 + 0.22]} c="#151A25" cast={false} />
      ))}
      {/* 냉동 도크 */}
      {[492, 507].map((x, i) => (
        <group key={x} position={[x, 0, z1 + 0.01]}>
          <B s={[3.7, 3.9, 0.5]} p={[0, 2.95, 0.25]} c="#2A2F3B" />
          <B s={[2.9, 3.1, 0.06]} p={[0, 2.8, 0.52]} c="#0E1520" cast={false} />
          <group position={[0, 4.35, 0.56]} userData={{ dynamic: true }} ref={(o) => { if (refs) refs.reefers[i] = o }}>
            <mesh geometry={unitBox} position={[0, -1.55, 0]} scale={[2.9, 3.1, 0.05]} material={shutter} />
          </group>
          <B s={[3.6, 1.2, 0.4]} p={[0, 0.6, 0.2]} c="#C4CBDA" />
          <Decal tex={labelTex(L(`냉동 ${i + 1}`, `Frozen ${i + 1}`), '#13A39A')} w={1.9} h={0.72} p={[0, 5.3, 0.55]} />
        </group>
      ))}
      <B s={[18, 0.3, 3.2]} p={[499.5, 6.0, z1 + 1.6]} c="#F4F6FB" />
    </group>
  )
}

/** 파렛트 롤러 컨베이어(출고 라인) */
export function RollerLine({ x, z0, z1, y = 0.45 }: { x: number; z0: number; z1: number; y?: number }) {
  const m = useMemo(() => {
    const t = repeated(rollerTex(), 1, (z1 - z0) / 1.2)
    const top = new THREE.MeshStandardMaterial({ map: t, roughness: 0.4, metalness: 0.3 })
    const side = mat('#9AA4B8')
    return [side, side, top, side, side, side] as THREE.Material[]
  }, [z0, z1])
  const len = z1 - z0
  return (
    <group>
      <mesh geometry={unitBox} position={[x, y - 0.06, (z0 + z1) / 2]} scale={[1.3, 0.12, len]} material={m} receiveShadow castShadow />
      {[0.68, -0.68].map((dx) => (
        <B key={dx} s={[0.06, 0.18, len]} p={[x + dx, y, (z0 + z1) / 2]} c="#F2B92B" />
      ))}
      {Array.from({ length: Math.floor(len / 2) + 1 }, (_, i) => z0 + 0.4 + i * 2).map((z) => (
        <B key={z} s={[1.2, y - 0.1, 0.08]} p={[x, (y - 0.1) / 2, z]} c="#8C96AA" />
      ))}
    </group>
  )
}

/** 스트레치 랩핑기: 팔(arm)이 파렛트 둘레를 돈다 */
export function StretchWrapper({ armRef, rollRef }: { armRef?: (o: THREE.Object3D | null) => void; rollRef?: (o: THREE.Object3D | null) => void }) {
  return (
    <group>
      <B s={[0.3, 2.9, 0.3]} p={[-1.25, 1.45, -1.25]} c="#F4F6FB" />
      <B s={[0.3, 2.9, 0.3]} p={[1.25, 1.45, -1.25]} c="#F4F6FB" />
      <B s={[0.3, 2.9, 0.3]} p={[-1.25, 1.45, 1.25]} c="#F4F6FB" />
      <B s={[0.3, 2.9, 0.3]} p={[1.25, 1.45, 1.25]} c="#F4F6FB" />
      <B s={[2.8, 0.28, 2.8]} p={[0, 2.95, 0]} c={COLORS.brand} />
      <group ref={armRef} position={[0, 2.8, 0]} userData={{ dynamic: true }}>
        <B s={[1.1, 0.1, 0.12]} p={[0.55, 0, 0]} c="#3A4152" />
        <B s={[0.1, 1.2, 0.1]} p={[1.1, -0.6, 0]} c="#3A4152" />
        <group ref={rollRef} position={[1.1, -1.3, 0]}>
          <mesh geometry={cylGeo(0.09, 0.09, 0.5, 12)} material={mat('#E9F0FF', { rough: 0.2 })} />
        </group>
      </group>
      <B s={[0.5, 1.2, 0.4]} p={[1.6, 0.6, 1.4]} c="#F4F6FB" />
      <B s={[0.3, 0.2, 0.02]} p={[1.6, 0.95, 1.61]} c="#16203A" cast={false} />
    </group>
  )
}

/** 피킹 스테이션(작업대 + 모니터 + 신호등) */
export function PickStation() {
  return (
    <group>
      <B s={[2.6, 0.9, 1.0]} p={[0, 0.45, 0]} c="#F4F6FB" />
      <B s={[2.6, 0.06, 1.0]} p={[0, 0.92, 0]} c="#C9D2E6" />
      <B s={[0.7, 0.45, 0.05]} p={[0.6, 1.4, -0.3]} c="#16203A" />
      <B s={[0.05, 0.4, 0.05]} p={[0.6, 1.1, -0.3]} c="#3A4152" />
      <Cyl rt={0.03} h={1.8} p={[-1.2, 0.9, -0.4]} c="#3A4152" />
      <mesh geometry={cylGeo(0.08, 0.08, 0.3, 10)} position={[-1.2, 1.95, -0.4]} material={mat('#35D07F', { emissive: '#35D07F', emissiveIntensity: 0.8 })} />
      {[-0.6, 0.0].map((x) => (
        <B key={x} s={[0.5, 0.3, 0.38]} p={[x, 1.1, 0.2]} c="#3E63FF" />
      ))}
    </group>
  )
}

/** 자동 봉함기(박스 테이핑) */
export function CaseSealer() {
  return (
    <group>
      <B s={[1.6, 0.8, 1.0]} p={[0, 0.4, 0]} c="#E9EDF4" />
      <RB s={[1.4, 1.0, 1.1]} rad={0.08} p={[0, 1.3, 0]} c={COLORS.brand} />
      <B s={[1.5, 0.3, 0.8]} p={[0, 0.82, 0]} c="#16203A" cast={false} />
      <B s={[0.4, 0.2, 0.02]} p={[0.4, 1.4, 0.56]} c="#16203A" cast={false} />
    </group>
  )
}

// ───────────────────────── 서브터미널

/** 투명 지붕 캐노피(서브터미널 · 분류장 공용) */
export function Canopy({ x0, x1, z0, z1, h = 7.4, label }: { x0: number; x1: number; z0: number; z1: number; h?: number; label?: string }) {
  const cx = (x0 + x1) / 2
  const cz = (z0 + z1) / 2
  const glass = useMemo(() => new THREE.MeshStandardMaterial({ color: '#C7D6FF', transparent: true, opacity: 0.13, depthWrite: false, side: THREE.DoubleSide, roughness: 0.2 }), [])
  const cols = Math.max(2, Math.round((x1 - x0) / 12))
  const xs = Array.from({ length: cols + 1 }, (_, i) => x0 + ((x1 - x0) * i) / cols)
  return (
    <group>
      {xs.flatMap((x) => [z0, z1].map((z) => <B key={`${x}${z}`} s={[0.4, h, 0.4]} p={[x, h / 2, z]} c="#E3E8F2" />))}
      <B s={[x1 - x0 + 0.6, 0.6, 0.45]} p={[cx, h, z1]} c={COLORS.brand} />
      <B s={[x1 - x0 + 0.6, 0.6, 0.45]} p={[cx, h, z0]} c="#E3E8F2" />
      {xs.map((x) => <B key={x} s={[0.32, 0.45, z1 - z0]} p={[x, h, cz]} c="#E3E8F2" />)}
      {Array.from({ length: Math.floor((z1 - z0) / 3.5) }, (_, i) => z0 + 1.75 + i * 3.5).map((z) => (
        <B key={z} s={[x1 - x0, 0.1, 0.1]} p={[cx, h + 0.26, z]} c="#F4F6FB" cast={false} />
      ))}
      <mesh geometry={unitPlane} scale={[x1 - x0 + 0.4, 1, z1 - z0]} position={[cx, h + 0.32, cz]} material={glass} />
      {label && <Decal tex={labelTex(label, '#2F55E6', '#FFFFFF', 720, 96)} w={11} h={1.47} p={[cx, h - 0.1, z1 + 0.25]} />}
    </group>
  )
}

/** 메인 컨베이어 + 휠소터 구간 + 슈트 */
export function SortLine({ x0, x1, z, y, chutes, sorterX0, sorterX1, scannerX, chuteLen = 1.55 }: {
  x0: number; x1: number; z: number; y: number; chutes: number[]; sorterX0: number; sorterX1: number; scannerX: number; chuteLen?: number
}) {
  const len = x1 - x0
  const belt = useMemo(() => {
    const t = canvasTex('belt-in', 128, 32, (ctx, w, h) => {
      ctx.fillStyle = '#3B4252'
      ctx.fillRect(0, 0, w, h)
      for (let x = 0; x < w; x += 16) {
        ctx.fillStyle = '#525A6D'
        ctx.fillRect(x, 0, 5, h)
      }
    }, { repeat: [40, 1] })
    return new THREE.MeshStandardMaterial({ map: t, roughness: 0.7 })
  }, [])
  const sorter = useMemo(() => new THREE.MeshStandardMaterial({ map: repeated(wheelSorterTex(), (sorterX1 - sorterX0) / 2, 1), roughness: 0.5 }), [sorterX0, sorterX1])
  const sl = sorterX1 - sorterX0
  return (
    <group>
      <B s={[len, 0.28, 1.34]} p={[x0 + len / 2, y - 0.2, z]} c="#C3CAD8" />
      <mesh geometry={unitBox} position={[x0 + len / 2, y, z]} scale={[len, 0.08, 1.02]} material={belt} receiveShadow userData={{ beltIn: true }} />
      <mesh geometry={unitBox} position={[sorterX0 + sl / 2, y + 0.006, z]} scale={[sl, 0.08, 1.02]} material={sorter} receiveShadow />
      {[0.6, -0.6].map((dz) => <B key={dz} s={[len, 0.2, 0.07]} p={[x0 + len / 2, y + 0.12, z + dz]} c="#97A1B5" />)}
      {Array.from({ length: Math.floor(len / 2.6) + 1 }, (_, i) => x0 + 0.6 + i * 2.6).map((x) => (
        <group key={x}>
          <B s={[0.1, y - 0.3, 0.1]} p={[x, (y - 0.3) / 2, z + 0.55]} c="#8C96AA" />
          <B s={[0.1, y - 0.3, 0.1]} p={[x, (y - 0.3) / 2, z - 0.55]} c="#8C96AA" />
        </group>
      ))}
      {chutes.flatMap((x) => [-1, 1].map((s) => (
        <group key={`${x}${s}`} position={[x, 0, z + s * (0.55 + chuteLen / 2)]}>
          <B s={[1.1, 0.05, chuteLen]} p={[0, y - 0.18, 0]} r={[s * -0.14, 0, 0]} c="#B7C0D1" />
          <B s={[0.05, 0.22, chuteLen]} p={[0.55, y - 0.08, 0]} r={[s * -0.14, 0, 0]} c="#97A1B5" />
          <B s={[0.05, 0.22, chuteLen]} p={[-0.55, y - 0.08, 0]} r={[s * -0.14, 0, 0]} c="#97A1B5" />
          <B s={[1.3, 0.5, 0.08]} p={[0, y - 0.25, s * (chuteLen / 2)]} c="#F2B92B" />
        </group>
      )))}
      <group position={[scannerX, 0, z]}>
        <B s={[0.25, 2.6, 0.25]} p={[0, 1.3, 0.85]} c="#F4F6FB" />
        <B s={[0.25, 2.6, 0.25]} p={[0, 1.3, -0.85]} c="#F4F6FB" />
        <RB s={[0.9, 0.6, 2.0]} rad={0.1} p={[0, 2.7, 0]} c="#F4F6FB" />
        <B s={[0.92, 0.12, 2.02]} p={[0, 2.55, 0]} m={mat('#5B7CFF', { emissive: '#3E63FF', emissiveIntensity: 1.2 })} cast={false} />
        <Decal tex={labelTex(L('ITS 스캐너', 'ITS Scanner'), '#1E3BB3', '#FFFFFF', 300, 80)} w={1.4} h={0.38} p={[0.46, 2.72, 0]} r={[0, Math.PI / 2, 0]} />
      </group>
      <B s={[1.4, 0.7, 1.7]} p={[x0 - 0.5, y - 0.1, z]} c="#97A1B5" />
    </group>
  )
}

/** 신축 컨베이어(간선 차량 안으로 늘어난다) */
export function FeederConveyor({ pts, y, boomRef }: { pts: [number, number][]; y: number; boomRef?: (o: THREE.Object3D | null) => void }) {
  const segs = pts.slice(0, -1).map((p, i) => {
    const q = pts[i + 1]
    const dx = q[0] - p[0]
    const dz = q[1] - p[1]
    return { cx: (p[0] + q[0]) / 2, cz: (p[1] + q[1]) / 2, len: Math.hypot(dx, dz), rot: Math.atan2(dx, dz) }
  })
  const [first, ...rest] = segs
  return (
    <group>
      {rest.map((s, i) => (
        <group key={i} position={[s.cx, 0, s.cz]} rotation={[0, s.rot, 0]}>
          <B s={[1.1, 0.12, s.len + 0.6]} p={[0, y, 0]} c="#3B4252" />
          <B s={[1.3, 0.24, s.len + 0.6]} p={[0, y - 0.18, 0]} c="#C3CAD8" />
          <B s={[0.1, y - 0.3, 0.1]} p={[0.5, (y - 0.3) / 2, 0]} c="#8C96AA" />
          <B s={[0.1, y - 0.3, 0.1]} p={[-0.5, (y - 0.3) / 2, 0]} c="#8C96AA" />
        </group>
      ))}
      {first && (
        <group position={[pts[1][0], 0, pts[1][1]]} rotation={[0, first.rot + Math.PI, 0]}>
          <B s={[1.4, y - 0.1, 1.2]} p={[0, (y - 0.1) / 2, 0]} c="#F2B92B" />
          <group ref={boomRef} userData={{ dynamic: true }}>
            <B s={[1.0, 0.14, first.len]} p={[0, y, -first.len / 2]} c="#3B4252" />
            <B s={[1.16, 0.2, first.len]} p={[0, y - 0.16, -first.len / 2]} c="#F2B92B" />
          </group>
        </group>
      )}
    </group>
  )
}

/** 소형 사무동 */
export function SmallOffice({ w = 12, d = 8, floors = 2, label }: { w?: number; d?: number; floors?: number; label?: string }) {
  const h = floors * 3.4
  // 창 무늬 반복 배율은 지오메트리에 구워, 모든 사무동이 텍스처 하나를 같이 쓴다(Merge가 한 번에 그림)
  const geo = boxUV([[d / 6, floors / 2.4], [d / 6, floors / 2.4], null, null, [w / 6, floors / 2.4], [w / 6, floors / 2.4]])
  const m = useMemo(() => [officeFaceMat(), officeFaceMat(), mat('#EEF1F7'), mat('#EEF1F7'), officeFaceMat(), officeFaceMat()] as THREE.Material[], [])
  return (
    <group>
      <mesh geometry={geo} position={[0, h / 2, 0]} scale={[w, h, d]} material={m} castShadow receiveShadow />
      <B s={[w + 0.3, 0.4, d + 0.3]} p={[0, h + 0.2, 0]} c={COLORS.brand} />
      {label && <AtlasSign cell={signId(label)} w={5} h={1.25} p={[0, h + 1.0, d / 2 - 0.3]} lit />}
      {label && <B s={[5.2, 1.4, 0.2]} p={[0, h + 1.0, d / 2 - 0.45]} c="#FFFFFF" />}
    </group>
  )
}

// ───────────────────────── 다온마을

/** 아파트 동(정면 = +z). 공동현관(유리 양문·인터폰·계단·화단), 택배 보관실, 자전거 거치대 */
export function AptBlock({ h, label }: { h: number; label: string }) {
  const n = Number(label.replace(/\D/g, '')) // '101동'·'Bldg 101' 모두 동 번호만
  const end = townUV(`end-${n}`)
  const geo = boxUV([end, end, null, null, [2.2, h / 26], [2.2, h / 26]])
  const m = useMemo(() => [atlasMat(), atlasMat(), mat('#E3E7F0'), mat('#E3E7F0'), aptFaceMat(), aptFaceMat()] as THREE.Material[], [])
  const glass = mat('#9DB2E8', { rough: 0.2, metal: 0.1 })
  return (
    <group>
      <mesh geometry={geo} position={[0, h / 2, 0]} scale={[30, h, 11]} material={m} castShadow receiveShadow />
      <B s={[30.4, 0.6, 11.4]} p={[0, h + 0.3, 0]} c="#C9D3EA" />
      {/* 뒷벽 노란 가스관: 땅 위 가로관 + 세로 입상관 4줄, 아래 계량기함 */}
      <B s={[27, 0.14, 0.14]} p={[0, 0.6, -5.62]} c="#F2C233" cast={false} />
      {[-12.6, -4.2, 4.2, 12.6].map((x) => (
        <group key={x}>
          <B s={[0.14, h - 1.2, 0.14]} p={[x, (h - 1.2) / 2 + 0.6, -5.62]} c="#F2C233" cast={false} />
          <B s={[0.7, 0.9, 0.3]} p={[x + 0.6, 1.3, -5.7]} c="#D8DEE8" cast={false} />
        </group>
      ))}
      {/* 옥탑: 계단실·물탱크 */}
      <B s={[7, 3.2, 5]} p={[-8, h + 1.6, 0]} c="#F1F3F8" />
      <Cyl rt={1.1} h={1.8} p={[8, h + 1.5, 0]} c="#D9DFEB" />
      {/* 공동현관 */}
      <B s={[4.2, 3.2, 1.6]} p={[0, 1.6, 6.2]} c="#E9EDF4" />
      <B s={[2.2, 2.4, 0.08]} p={[0, 1.2, 7.02]} m={glass} cast={false} />
      <B s={[0.06, 2.4, 0.1]} p={[0, 1.2, 7.06]} c="#5B6B90" cast={false} />
      <B s={[5, 0.25, 2.6]} p={[0, 3.3, 6.6]} c={COLORS.brand} />
      <AtlasSign cell={`lbl-${n}`} w={1.8} h={0.68} p={[0, 2.8, 7.08]} lit />
      <B s={[4.6, 0.16, 1.3]} p={[0, 0.08, 7.65]} c="#CDD3DE" />
      {/* 인터폰 기둥 */}
      <B s={[0.32, 1.3, 0.26]} p={[1.65, 0.65, 7.45]} c="#3B4252" />
      <B s={[0.2, 0.26, 0.02]} p={[1.65, 1.05, 7.59]} c="#9FC3EA" cast={false} />
      {/* 택배 보관실(공동현관 왼쪽) */}
      <B s={[2.8, 2.6, 1.4]} p={[-3.9, 1.3, 6.1]} c="#EEF1F6" />
      <B s={[1.1, 2.0, 0.06]} p={[-3.9, 1.0, 6.82]} m={glass} cast={false} />
      <AtlasSign cell={signId('택배 보관실')} w={1.9} h={0.48} p={[-3.9, 2.25, 6.83]} />
      {/* 화단(오른쪽) */}
      <B s={[3.6, 0.45, 1.3]} p={[4.4, 0.22, 6.5]} c="#B9AFA2" />
      <B s={[3.4, 0.3, 1.1]} p={[4.4, 0.5, 6.5]} c="#5E9E5E" />
      {[3.3, 4.4, 5.5].map((x) => (
        <mesh key={x} geometry={sphereGeo(0.45, 10, 8)} position={[x, 0.85, 6.5]} material={mat('#4F8F55')} castShadow />
      ))}
      {/* 자전거 거치대 */}
      <group position={[9.6, 0, 7.3]}>
        <B s={[3.6, 0.08, 0.08]} p={[0, 0.7, 0]} c="#9AA4B8" />
        {[-1.6, 1.6].map((x) => <B key={x} s={[0.08, 0.7, 0.08]} p={[x, 0.35, 0]} c="#9AA4B8" />)}
        {[-1.1, 0, 1.1].map((x, i) => (
          <group key={x} position={[x, 0, 0.2]} rotation={[0, Math.PI / 2, 0]}>
            <Bicycle color={['#2F55E6', '#E2453C', '#3B4252'][i]} />
          </group>
        ))}
      </group>
    </group>
  )
}

/** 자전거(정적, 길이 방향 = x) */
export function Bicycle({ color = '#2F55E6' }: { color?: string }) {
  const tire = mat('#22262F', { rough: 0.9 })
  return (
    <group>
      {[-0.52, 0.52].map((x) => (
        <mesh key={x} geometry={torusGeo(0.33, 0.04)} position={[x, 0.37, 0]} material={tire} castShadow />
      ))}
      <B s={[1.0, 0.05, 0.05]} p={[0, 0.55, 0]} r={[0, 0, -0.18]} c={color} />
      <B s={[0.05, 0.42, 0.05]} p={[-0.18, 0.55, 0]} c={color} />
      <B s={[0.24, 0.05, 0.12]} p={[-0.2, 0.8, 0]} c="#22262F" />
      <B s={[0.05, 0.05, 0.5]} p={[0.42, 0.88, 0]} c="#9AA4B8" />
    </group>
  )
}

/** 필로티 빌라(1층 주차장 + 4층 주거) */
export function Villa({ name, color = '#EDE6DC' }: { name: string; color?: string }) {
  const geo = boxUV([[0.9, 0.35], [0.9, 0.35], null, null, [0.9, 0.35], [0.9, 0.35]])
  const m = useMemo(() => {
    const face = aptFaceMat().clone()
    face.color.set(color)
    return [face, face, mat('#D9D2C8'), mat('#D9D2C8'), face, face] as THREE.Material[]
  }, [color])
  return (
    <group>
      <mesh geometry={geo} position={[0, 3 + 6.4, 0]} scale={[12, 12.8, 10]} material={m} castShadow receiveShadow />
      {[[-5.6, -4.6], [5.6, -4.6], [-5.6, 4.6], [5.6, 4.6], [0, 4.6]].map(([x, z], i) => (
        <B key={i} s={[0.6, 3, 0.6]} p={[x, 1.5, z]} c="#D9D2C8" />
      ))}
      <B s={[12.2, 0.4, 10.2]} p={[0, 3, 0]} c="#CFC7BB" />
      <B s={[12.4, 0.5, 10.4]} p={[0, 16, 0]} c="#B9AFA2" />
      <AtlasSign cell={signId(name)} w={3.2} h={0.8} p={[-5.9, 4.0, 0]} r={[0, -Math.PI / 2, 0]} lit />
      {/* 필로티 우편함·도시가스 배관 */}
      <B s={[0.5, 0.9, 1.6]} p={[-5.3, 1.3, -2.5]} c="#C9B79A" />
      <B s={[0.08, 12.8, 0.08]} p={[6.05, 9.4, -3.5]} c="#F2C233" cast={false} />
      <B s={[0.08, 0.08, 7]} p={[6.05, 3.4, 0]} c="#F2C233" cast={false} />
    </group>
  )
}

/** 1층 상가(편의점·카페·세탁소) */
export function ShopRow() {
  const shops: [string, string][] = [['카페 온담', '#8A5A3B'], ['편의점 다온25', '#1FA35B'], ['다온 세탁', '#2F55E6']]
  return (
    <group>
      <B s={[10, 7.2, 34]} p={[0, 3.6, 0]} c="#EEF1F6" />
      <B s={[10.3, 0.4, 34.3]} p={[0, 7.4, 0]} c="#C9D3EA" />
      {shops.map(([n, c], i) => (
        <group key={n} position={[-5.05, 0, -11 + i * 11]}>
          <B s={[0.1, 2.6, 9]} p={[0, 1.5, 0]} m={mat('#AFC3EE', { rough: 0.2, metal: 0.1 })} cast={false} />
          <AtlasSign cell={signId(n)} w={6} h={1.5} p={[-0.02, 3.6, 0]} r={[0, -Math.PI / 2, 0]} lit />
          <B s={[1.6, 0.12, 9]} p={[-0.8, 2.95, 0]} c={c} />
        </group>
      ))}
    </group>
  )
}

/** 무인택배함 */
export function ParcelLocker() {
  const tex = useMemo(() => new THREE.MeshStandardMaterial({ map: lockerTex(), roughness: 0.5 }), [])
  return (
    <group>
      <mesh geometry={unitBox} position={[0, 1.1, 0]} scale={[3.2, 2.2, 0.7]} material={[mat('#2F55E6'), mat('#2F55E6'), mat('#1E3BB3'), mat('#1E3BB3'), mat('#2F55E6'), tex]} castShadow receiveShadow />
      <B s={[3.6, 0.15, 1.1]} p={[0, 2.3, -0.1]} c="#F4F6FB" />
    </group>
  )
}

/** 단지 경비실 */
export function GuardHouse() {
  return (
    <group>
      <RB s={[2.6, 2.6, 2.4]} rad={0.1} p={[0, 1.3, 0]} c="#F6F8FC" />
      <B s={[2.62, 0.9, 2.42]} p={[0, 1.7, 0]} c={COLORS.glass} cast={false} />
      <B s={[3.4, 0.22, 3.2]} p={[0, 2.75, 0]} c="#5B6B90" />
    </group>
  )
}

/** 놀이터 */
export function Playground() {
  return (
    <group>
      <mesh geometry={unitPlane} scale={[12, 1, 9]} position={[0, 0.03, 0]} material={mat('#F3D6B0')} receiveShadow />
      <B s={[2, 2.2, 2]} p={[-3, 1.1, 0]} c="#FF8A5B" />
      <B s={[0.9, 0.1, 3.4]} p={[-3, 1.2, 2.4]} r={[0.55, 0, 0]} c="#FFC93C" />
      <B s={[0.1, 2.4, 0.1]} p={[2, 1.2, -1]} c="#5B7CFF" />
      <B s={[0.1, 2.4, 0.1]} p={[5, 1.2, -1]} c="#5B7CFF" />
      <B s={[3.2, 0.12, 0.12]} p={[3.5, 2.4, -1]} c="#5B7CFF" />
      <B s={[0.6, 0.06, 0.3]} p={[3, 0.6, -1]} c="#3E8E5A" />
      <B s={[0.6, 0.06, 0.3]} p={[4, 0.6, -1]} c="#3E8E5A" />
      <mesh geometry={sphereGeo(0.8, 16, 10)} scale={[1, 0.5, 1]} position={[2.5, 0.3, 2.6]} material={mat('#7CD1A0')} castShadow />
    </group>
  )
}

/** 신호등(머리 3구). lampRefs로 색을 바꾼다 */
export function TrafficLight({ lampRef, arm = 4 }: { lampRef?: (o: THREE.Object3D | null) => void; arm?: number }) {
  return (
    <group>
      <Cyl rt={0.1} rb={0.13} h={6} p={[0, 3, 0]} c="#9AA4B8" />
      <B s={[0.12, 0.12, arm]} p={[0, 5.8, arm / 2]} c="#9AA4B8" />
      <group position={[0, 5.5, arm - 0.3]}>
        <B s={[0.36, 0.36, 1.2]} c="#2E3442" />
        <group ref={lampRef} userData={{ noMerge: true }}>
          {['#E2463C', '#F2B92B', '#35D07F'].map((c, i) => (
            <mesh key={c} userData={{ noMerge: true }} geometry={sphereGeo(0.12, 10, 8)} position={[0.19, 0, -0.38 + i * 0.38]} material={mat(c, { emissive: c, emissiveIntensity: 0.2 })} />
          ))}
        </group>
      </group>
    </group>
  )
}

/** 버스 정류장 */
export function BusStop({ name }: { name: string }) {
  return (
    <group>
      <B s={[4, 0.12, 1.6]} p={[0, 2.5, 0]} c="#2F55E6" />
      <B s={[0.1, 2.5, 0.1]} p={[1.9, 1.25, 0.7]} c="#9AA4B8" />
      <B s={[0.1, 2.5, 0.1]} p={[-1.9, 1.25, 0.7]} c="#9AA4B8" />
      <B s={[4, 2.2, 0.06]} p={[0, 1.3, -0.75]} m={mat('#CFE0FF', { opacity: 0.4 })} cast={false} />
      <B s={[2.6, 0.12, 0.5]} p={[0, 0.5, -0.4]} c="#C9D0DE" />
      <AtlasSign cell={signId(name)} w={2.2} h={0.55} p={[0, 2.85, 0.82]} lit />
      <B s={[2.3, 0.6, 0.06]} p={[0, 2.85, 0.79]} c="#1E3BB3" />
    </group>
  )
}

/** 간선도로 표지판 갠트리 */
export function SignGantry({ text, sub, span = 16 }: { text: string; sub: string; span?: number }) {
  const t = useMemo(() => canvasTex(`gantry-${text}`, 1024, 300, (ctx, w, h) => {
    ctx.fillStyle = '#1F7A4D'
    ctx.fillRect(0, 0, w, h)
    ctx.strokeStyle = '#FFFFFF'
    ctx.lineWidth = 8
    ctx.strokeRect(10, 10, w - 20, h - 20)
    ctx.fillStyle = '#FFFFFF'
    ctx.textBaseline = 'middle'
    fillFit(ctx, text, 50, 120, w - 100, 800, 110)
    fillFit(ctx, sub, 54, 222, w - 104, 600, 52)
  }), [text, sub])
  return (
    <group>
      <B s={[0.4, 7.5, 0.4]} p={[0, 3.75, -span / 2]} c="#9AA4B8" />
      <B s={[0.4, 7.5, 0.4]} p={[0, 3.75, span / 2]} c="#9AA4B8" />
      <B s={[0.3, 0.4, span]} p={[0, 7.3, 0]} c="#9AA4B8" />
      <Decal tex={t} w={6.8} h={2.0} p={[0.2, 6.2, -3]} r={[0, Math.PI / 2, 0]} />
      <B s={[0.15, 2.1, 7]} p={[0.06, 6.2, -3]} c="#1F7A4D" />
    </group>
  )
}

// ───────────────────────── 부산신항

/** 컨테이너선 */
export function Ship({ len = 162, beam = 30 }: { len?: number; beam?: number }) {
  const deck = 7
  return (
    <group>
      <B s={[len, deck, beam]} p={[0, deck / 2 - 3, 0]} c="#24324F" />
      <B s={[len + 0.2, 2.2, beam + 0.2]} p={[0, -2.2, 0]} c="#C44A4A" />
      <mesh geometry={coneGeo(beam / 2, 18, 4)} rotation={[0, Math.PI / 4, -Math.PI / 2]} scale={[1, 1, 0.75]} position={[-len / 2 - 8, deck / 2 - 3, 0]} material={mat('#24324F')} castShadow />
      <B s={[12, 20, beam - 6]} p={[len / 2 - 10, deck + 7, 0]} c="#F4F6FB" />
      <B s={[12.2, 1.4, beam - 5.8]} p={[len / 2 - 10, deck + 14, 0]} c={COLORS.glass} cast={false} />
      <B s={[3, 8, 3]} p={[len / 2 - 14, deck + 21, 0]} c="#C44A4A" />
      <Decal tex={shopSignTex('DAON OCEAN', '#24324F')} w={20} h={4} p={[-10, 1.5, beam / 2 + 0.12]} />
    </group>
  )
}

/** 안벽 크레인(STS). 트롤리·스프레더는 엔티티가 움직인다 */
export function QuayCrane({ trolleyRef, spreaderRef, cableRef, boxRef }: {
  trolleyRef?: (o: THREE.Object3D | null) => void
  spreaderRef?: (o: THREE.Object3D | null) => void
  cableRef?: (o: THREE.Object3D | null) => void
  boxRef?: (o: THREE.Object3D | null) => void
}) {
  const c = '#2F55E6'
  return (
    <group>
      {[-8, 8].flatMap((x) => [-7, 7].map((z) => <B key={`${x}${z}`} s={[1.2, 30, 1.2]} p={[x, 15, z]} c={c} />))}
      {[-8, 8].map((x) => <B key={x} s={[1.4, 1.4, 16]} p={[x, 29, 0]} c={c} />)}
      {[-7, 7].map((z) => <B key={z} s={[17, 1.4, 1.4]} p={[0, 29, z]} c={c} />)}
      {[-8, 8].map((x) => <B key={`d${x}`} s={[0.5, 0.5, 17]} p={[x, 15, 0]} r={[0.95, 0, 0]} c={c} />)}
      <B s={[3.2, 2.2, 82]} p={[0, 38, 14]} c="#F4F6FB" />
      <B s={[8, 6, 10]} p={[0, 33, -16]} c="#F4F6FB" />
      {[-1.6, 1.6].map((x) => <B key={x} s={[0.4, 10, 0.4]} p={[x, 34, 6]} r={[0.6, 0, 0]} c="#F4F6FB" />)}
      <B s={[2.8, 0.4, 10]} p={[0, 31, -22]} c="#F4F6FB" />
      {[-8, 8].flatMap((x) => [-7, 7].map((z) => <B key={`w${x}${z}`} s={[1.6, 0.6, 2.4]} p={[x, 0.3, z]} c="#3A4152" />))}
      <group ref={trolleyRef} position={[0, 36.6, 0]} userData={{ dynamic: true }}>
        <B s={[3, 1.2, 3]} c="#3A4152" />
        <group ref={cableRef} userData={{ dynamic: true }}>
          {[-1, 1].map((x) => <B key={x} s={[0.06, 1, 0.06]} p={[x, -0.5, 0]} c="#2E3442" cast={false} />)}
        </group>
        <group ref={spreaderRef} position={[0, -20, 0]} userData={{ dynamic: true }}>
          <B s={[12.4, 0.4, 2.6]} c="#F2B92B" />
          <group ref={boxRef} position={[0, -1.5, 0]} userData={{ noMerge: true }} />
        </group>
      </group>
    </group>
  )
}

/** 항만 조명탑 */
export function LightTower({ h = 26 }: { h?: number }) {
  return (
    <group>
      <Cyl rt={0.3} rb={0.5} h={h} p={[0, h / 2, 0]} c="#C3CAD8" />
      <B s={[3, 1.2, 0.6]} p={[0, h, 0]} m={lampMaterial(mat('#FFFBEA', { emissive: '#FFF2C2', emissiveIntensity: 0.5 }))} />
    </group>
  )
}

/** 리치스태커 */
export function ReachStacker() {
  return (
    <group>
      <RB s={[3.2, 1.6, 6.6]} rad={0.12} p={[0, 1.4, 0]} c="#F2B92B" />
      <B s={[1.8, 2.0, 1.8]} p={[0, 3, -0.6]} c="#2E3442" />
      <B s={[1.82, 1.0, 1.82]} p={[0, 3.3, -0.6]} c={COLORS.glass} cast={false} />
      <B s={[0.9, 0.9, 9]} p={[0, 4.6, 2.2]} r={[0.35, 0, 0]} c="#F2B92B" />
      <B s={[2.6, 0.3, 6]} p={[0, 6.0, 6.2]} c="#3A4152" />
      {[2.2, -2.2].flatMap((z) => [1.5, -1.5].map((x) => (
        <mesh key={`${x}${z}`} geometry={cylGeo(0.75, 0.75, 0.7, 16)} rotation={[0, 0, Math.PI / 2]} position={[x, 0.75, z]} material={mat(COLORS.tire)} castShadow />
      )))}
    </group>
  )
}

/** 컨테이너 블록(인스턴스) */
export function ContainerStacks({ items }: { items: { x: number; z: number; y: number; color: string; rot?: number }[] }) {
  const mesh = useMemo(() => {
    const t = canvasTex('cont-generic', 256, 64, (ctx, w, h) => {
      ctx.fillStyle = '#FFFFFF'
      ctx.fillRect(0, 0, w, h)
      for (let x = 0; x < w; x += 8) {
        ctx.fillStyle = 'rgba(0,0,0,0.13)'
        ctx.fillRect(x, 0, 3, h)
      }
    })
    const m = new THREE.InstancedMesh(unitBox, new THREE.MeshStandardMaterial({ map: t, roughness: 0.6 }), items.length)
    const o = new THREE.Object3D()
    const c = new THREE.Color()
    items.forEach((it, i) => {
      o.position.set(it.x, it.y + 1.3, it.z)
      o.rotation.set(0, it.rot ?? 0, 0)
      o.scale.set(2.44, 2.6, 12.1)
      o.updateMatrix()
      m.setMatrixAt(i, o.matrix)
      m.setColorAt(i, c.set(it.color))
    })
    m.castShadow = true
    m.receiveShadow = true
    return m
  }, [items])
  return <primitive object={mesh} />
}

/** 바다 */
/** 바다 물보라 시간(모든 바다 재질 공유) */
const SEA_U = { uSeaT: { value: 0 } }

export function Sea({ x0, x1, z0, z1 }: { x0: number; x1: number; z0: number; z1: number }) {
  const m = useMemo(() => {
    const t = canvasTex('sea', 256, 256, (ctx, w, h) => {
      ctx.fillStyle = '#9DB8EE'
      ctx.fillRect(0, 0, w, h)
      ctx.strokeStyle = 'rgba(255,255,255,0.13)'
      ctx.lineWidth = 4
      for (let y = 8; y < h; y += 22) {
        ctx.beginPath()
        for (let x = 0; x <= w; x += 8) ctx.lineTo(x, y + Math.sin((x + y) * 0.08) * 3)
        ctx.stroke()
      }
    }, { repeat: [(x1 - x0) / 40, (z1 - z0) / 40] })
    const m = new THREE.MeshStandardMaterial({ map: t, roughness: 0.5, metalness: 0 })
    m.userData.noSnow = true
    // 물보라: 월드 좌표 잡음으로 흰 조각이 천천히 흘러간다(시간 유니폼은 SEA_U)
    m.userData.customShader = true
    m.onBeforeCompile = (sh) => {
      sh.uniforms.uSeaT = SEA_U.uSeaT
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vSeaW;')
        .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvSeaW = (modelMatrix * vec4(transformed, 1.0)).xyz;')
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', `#include <common>
varying vec3 vSeaW;
uniform float uSeaT;
float seaHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float seaNoise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(seaHash(i), seaHash(i + vec2(1.0, 0.0)), f.x), mix(seaHash(i + vec2(0.0, 1.0)), seaHash(i + vec2(1.0, 1.0)), f.x), f.y);
}`)
        .replace('#include <map_fragment>', `#include <map_fragment>
{
  vec2 q = vSeaW.xz * 0.11 + vec2(uSeaT * 0.05, uSeaT * 0.02);
  float n = seaNoise(q) * 0.65 + seaNoise(q * 2.7 - vec2(uSeaT * 0.08, 0.0)) * 0.35;
  float foam = smoothstep(0.74, 0.8, n);
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.97, 0.98, 1.0), foam * 0.75);
}`)
    }
    m.customProgramCacheKey = () => 'sea-foam'
    return m
  }, [x0, x1, z0, z1])
  useFrame((_, dt) => {
    SEA_U.uSeaT.value += dt
  })
  return <mesh geometry={unitPlane} scale={[x1 - x0, 1, z1 - z0]} position={[(x0 + x1) / 2, 0.05, (z0 + z1) / 2]} material={m} receiveShadow userData={{ noMerge: true }} />
}


// ───────────────────────── 부산신항 자동화 장비

/** 무인 운반차(AGV): 운전석 없는 평판 차량. 컨테이너는 부모가 위에 얹는다 */
export function AgvModel({ children }: { children?: ReactNode }) {
  return (
    <group>
      <RB s={[2.9, 0.75, 13]} rad={0.15} p={[0, 0.62, 0]} c="#F3B414" />
      <B s={[2.95, 0.12, 13.05]} p={[0, 1.02, 0]} c="#3A4152" />
      {[6.45, -6.45].map((z) => (
        <B key={z} s={[2.6, 0.32, 0.12]} p={[0, 0.62, z]} m={mat('#5B7CFF', { emissive: '#3E63FF', emissiveIntensity: 1.1 })} cast={false} />
      ))}
      {[4.8, 1.6, -1.6, -4.8].flatMap((z) => [1.35, -1.35].map((x) => (
        <mesh key={`${x}${z}`} geometry={cylGeo(0.36, 0.36, 0.32, 14)} rotation={[0, 0, Math.PI / 2]} position={[x, 0.36, z]} material={mat(COLORS.tire)} castShadow />
      )))}
      <B s={[0.5, 0.18, 0.18]} p={[0, 1.05, 6.6]} c="#16203A" cast={false} />
      <group position={[0, 1.08, 0]}>{children}</group>
    </group>
  )
}

/** 자동화 레일 야드 크레인(ARMG): 블록을 걸터앉아 z축으로 이동 */
export function ArmgModel({ trolleyRef, spreaderRef, cableRef, boxRef }: {
  trolleyRef?: (o: THREE.Object3D | null) => void
  spreaderRef?: (o: THREE.Object3D | null) => void
  cableRef?: (o: THREE.Object3D | null) => void
  boxRef?: (o: THREE.Object3D | null) => void
}) {
  const c = '#E9EDF4'
  const H = 20
  return (
    <group>
      {[-6, 6].flatMap((z) => [-9, 9].map((x) => <B key={`${x}${z}`} s={[0.9, H, 0.9]} p={[x, H / 2, z]} c={c} />))}
      {[-6, 6].map((z) => <B key={z} s={[19.2, 1.2, 1.1]} p={[0, H, z]} c={COLORS.brand} />)}
      {[-9, 9].map((x) => <B key={x} s={[1.1, 1.0, 13]} p={[x, H - 0.2, 0]} c={c} />)}
      {[-9, 9].map((x) => <B key={`b${x}`} s={[1.4, 0.8, 14]} p={[x, 0.4, 0]} c="#3A4152" />)}
      <B s={[2.6, 2.2, 3]} p={[-7.6, H + 1.6, 4]} c={c} />
      <group ref={trolleyRef} position={[0, H + 0.9, 0]} userData={{ dynamic: true }}>
        <B s={[3, 0.9, 13]} c="#3A4152" />
        <group ref={cableRef} userData={{ dynamic: true }}>
          {[-0.9, 0.9].map((x) => <B key={x} s={[0.06, 1, 0.06]} p={[x, -0.5, 0]} c="#2E3442" cast={false} />)}
        </group>
        <group ref={spreaderRef} position={[0, -10, 0]} userData={{ dynamic: true }}>
          <B s={[2.6, 0.35, 12.4]} c="#F2B92B" />
          <group ref={boxRef} position={[0, -1.5, 0]} userData={{ noMerge: true }} />
        </group>
      </group>
    </group>
  )
}

/** 예인선 */
export function Tugboat({ color = '#C44A4A' }: { color?: string }) {
  return (
    <group>
      <RB s={[4.6, 2.2, 13]} rad={0.6} p={[0, 0.4, 0]} c={color} />
      <B s={[4.7, 0.5, 13.1]} p={[0, 1.3, 0]} c="#2E3442" />
      <B s={[3.2, 2.6, 4.2]} p={[0, 2.9, 1.2]} c="#F4F6FB" />
      <B s={[3.22, 0.8, 4.22]} p={[0, 3.4, 1.2]} c={COLORS.glass} cast={false} />
      <Cyl rt={0.35} h={2.4} p={[0, 4.6, -0.6]} c="#2E3442" />
      <B s={[4.8, 0.6, 0.6]} p={[0, 1.3, 6.6]} c="#2E3442" />
    </group>
  )
}

/** 세관 X-ray 컨테이너 검색기(드라이브 스루 포털) */
export function XrayPortal({ beamRef }: { beamRef?: (o: THREE.Object3D | null) => void }) {
  return (
    <group>
      {[-4.2, 4.2].map((z) => <B key={z} s={[3.4, 7, 1.4]} p={[0, 3.5, z]} c="#F4F6FB" />)}
      <B s={[3.6, 1.6, 10]} p={[0, 7.6, 0]} c="#F4F6FB" />
      <B s={[3.65, 0.4, 10.05]} p={[0, 6.9, 0]} c="#E2463C" />
      <Decal tex={labelTex(L('세관 X-ray 검색기', 'Customs X-ray Scanner'), '#E2463C', '#FFFFFF', 480, 96)} w={4.6} h={0.92} p={[1.82, 7.7, 0]} r={[0, Math.PI / 2, 0]} />
      <group ref={beamRef} userData={{ noMerge: true }} visible={false}>
        <mesh position={[0, 3.6, 0]}>
          <boxGeometry args={[0.15, 6.6, 7.6]} />
          <meshBasicMaterial color="#FF5A4E" transparent opacity={0.45} toneMapped={false} />
        </mesh>
      </group>
      <B s={[2.2, 2.6, 2.6]} p={[0, 1.3, 7.6]} c="#E9EDF4" />
    </group>
  )
}

/** 게이트 OCR 카메라 포털 */
export function OcrPortal({ width = 14 }: { width?: number }) {
  return (
    <group>
      {[-width / 2, width / 2].map((x) => <B key={x} s={[0.5, 6.4, 0.5]} p={[x, 3.2, 0]} c="#9AA4B8" />)}
      <B s={[width + 0.6, 0.7, 0.8]} p={[0, 6.4, 0]} c={COLORS.brand} />
      {[-4.5, -1.5, 1.5, 4.5].map((x) => (
        <group key={x} position={[x, 5.8, 0.5]}>
          <B s={[0.4, 0.3, 0.6]} c="#2E3442" />
          <mesh userData={{ noMerge: true }} position={[0, -0.05, 0.31]} geometry={sphereGeo(0.08, 8, 6)} material={mat('#35D07F', { emissive: '#35D07F', emissiveIntensity: 1 })} />
        </group>
      ))}
      <Decal tex={labelTex(L('자동 게이트 · OCR', 'Auto Gate · OCR'), '#1E3BB3', '#FFFFFF', 480, 96)} w={4.2} h={0.84} p={[0, 6.4, 0.42]} />
    </group>
  )
}

/** 냉동 컨테이너 전원 랙(리퍼 플러그) */
export function ReeferRack({ length = 130 }: { length?: number }) {
  return (
    <group>
      {Array.from({ length: Math.floor(length / 13) + 1 }, (_, i) => -length / 2 + i * 13).map((z) => (
        <group key={z} position={[0, 0, z]}>
          <B s={[0.3, 9, 0.3]} p={[0, 4.5, 0]} c="#9AA4B8" />
          <B s={[1.4, 0.2, 0.4]} p={[0, 9, 0]} c="#9AA4B8" />
          {[2.2, 4.8, 7.4].map((y) => (
            <mesh key={y} userData={{ noMerge: true }} position={[0.2, y, 0]} geometry={sphereGeo(0.09, 8, 6)} material={mat('#35D07F', { emissive: '#35D07F', emissiveIntensity: 1.1 })} />
          ))}
        </group>
      ))}
      <B s={[0.2, 0.2, length]} p={[0.1, 8.6, 0]} c="#3A4152" cast={false} />
    </group>
  )
}

/** 항만 관제탑 */
export function ControlTower() {
  return (
    <group>
      <B s={[7, 22, 7]} p={[0, 11, 0]} c="#EEF1F6" />
      <B s={[10, 4.2, 10]} p={[0, 24, 0]} c={COLORS.glass} />
      <B s={[10.6, 0.6, 10.6]} p={[0, 26.4, 0]} c={COLORS.brand} />
      <B s={[10.6, 0.5, 10.6]} p={[0, 21.7, 0]} c="#F4F6FB" />
      <Cyl rt={0.12} h={5} p={[2, 29, 2]} c="#9AA4B8" />
      <Decal tex={labelTex(L('BS-04 관제탑', 'BS-04 Control Tower'), '#FFFFFF', '#1E3BB3', 360, 96)} w={4.4} h={1.17} p={[0, 18, 3.52]} />
    </group>
  )
}
