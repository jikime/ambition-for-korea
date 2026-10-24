import * as THREE from 'three'
import { useEffect, useMemo } from 'react'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { B, COLORS, Cyl, RB, basic, boxUV, coneGeo, cylGeo, mat, unitBox, unitPlane } from '../kit'
import {
  beltTex, containerTex, corrugatedTex, labelTex, roofLogoTex, roofTex, shutterTex, signTex, stripeTex, windowsTex,
} from '../textures'
import * as L from '../../sim/layout'
import { L as tr } from '../../i18n'
import { AtlasSign, APT_NUMS, signId } from '../townAtlas'
import { aptFaceMat, corrugatedMat } from '../sharedMats'
import { solarTex } from '../textures'
import { lampMaterial, windowMaterial } from '../env/state'

function repeated(tex: THREE.Texture, rx: number, ry: number) {
  const t = tex.clone()
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.repeat.set(rx, ry)
  t.needsUpdate = true
  return t
}

/** 벽면에 붙이는 텍스처 판 */
export function Decal({ tex, w, h, p, r, opacity }: { tex: THREE.Texture; w: number; h: number; p: [number, number, number]; r?: [number, number, number]; opacity?: number }) {
  const m = useMemo(() => new THREE.MeshStandardMaterial({ map: tex, transparent: true, opacity: opacity ?? 1, roughness: 0.6 }), [tex, opacity])
  return (
    <mesh position={p} rotation={r} material={m}>
      <planeGeometry args={[w, h]} />
    </mesh>
  )
}

/** 바닥 도색 */
export function GroundPaint({ tex, w, h, p, rot = 0, opacity = 0.9 }: { tex: THREE.Texture; w: number; h: number; p: [number, number]; rot?: number; opacity?: number }) {
  return <mesh geometry={unitPlane} scale={[w, 1, h]} position={[p[0], 0.035, p[1]]} rotation={[0, rot, 0]} material={basic('#ffffff', opacity, tex)} />
}

/** 같은 노면 글자 여러 곳을 한 메시로(그리기 명령 1개). spots: [x, z, 회전] */
export function GroundPaints({ tex, w, h, spots, opacity = 0.9 }: { tex: THREE.Texture; w: number; h: number; spots: [number, number, number?][]; opacity?: number }) {
  const key = JSON.stringify(spots)
  const geo = useMemo(() => {
    const m4 = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    const up = new THREE.Vector3(0, 1, 0)
    const parts = spots.map(([x, z, rot = 0]) => unitPlane.clone().applyMatrix4(m4.compose(new THREE.Vector3(x, 0.035, z), q.setFromAxisAngle(up, rot), new THREE.Vector3(w, 1, h))))
    const g = mergeGeometries(parts, false)!
    parts.forEach((p) => p.dispose())
    return g
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, w, h])
  useEffect(() => () => geo.dispose(), [geo])
  return <mesh geometry={geo} material={basic('#ffffff', opacity, tex)} />
}

export interface DoorRefs {
  inDoors: (THREE.Object3D | null)[]
  docks: (THREE.Object3D | null)[]
}

/** 곤지암 메가허브 본동 */
export function HubBuilding({ refs }: { refs?: DoorRefs }) {
  const { x0, x1, z0, z1, h } = L.BUILDING
  const D = z1 - z0
  const cz = (z0 + z1) / 2
  // 서쪽은 파렛트 보관동(지붕), 동쪽은 유리 지붕 분류동(크로스벨트 소터가 보인다)
  const GX = L.SORT_HALL_X0
  const sW = GX - x0
  const scx = (x0 + GX) / 2
  const gW = x1 - GX
  const gcx = (GX + x1) / 2
  const mats = useMemo(() => {
    const corr = corrugatedTex('#F1F3F9', '#D9DFEB')
    const front = new THREE.MeshStandardMaterial({ map: repeated(corr, sW / 6, 1), roughness: 0.8 })
    const side = new THREE.MeshStandardMaterial({ map: repeated(corr, D / 6, 1), roughness: 0.8 })
    const top = mat('#E0E5F0')
    const hallFront = new THREE.MeshStandardMaterial({ map: repeated(corr, gW / 6, 1), roughness: 0.8 })
    return { box: [side, side, top, top, front, front] as THREE.Material[], side, hallFront }
  }, [sW, gW, D])
  const roof = useMemo(() => new THREE.MeshStandardMaterial({ map: repeated(roofTex(COLORS.roof), sW / 10, 1), roughness: 0.65 }), [sW])
  const glass = useMemo(() => new THREE.MeshStandardMaterial({ color: '#CFE0FF', transparent: true, opacity: 0.12, depthWrite: false, roughness: 0.35 }), [])
  const shutter = useMemo(() => new THREE.MeshStandardMaterial({ map: shutterTex('#DCE2EE'), roughness: 0.6 }), [])
  const windows = useMemo(() => windowMaterial(new THREE.MeshStandardMaterial({ map: repeated(windowsTex('office'), 6, 0.3), roughness: 0.4, metalness: 0.05 }), 'office'), [])
  const fz = z1 + 0.01
  const deep = mat(COLORS.brandDeep)

  return (
    <group>
      {/* 보관동 */}
      <mesh geometry={unitBox} position={[scx, h / 2, cz]} scale={[sW, h, D]} material={mats.box} castShadow receiveShadow />
      <mesh geometry={unitBox} position={[(x0 - 0.3 + GX) / 2, h + 0.2, cz]} scale={[sW + 0.3, 0.4, D + 0.6]} material={[deep, deep, roof, roof, deep, deep]} castShadow receiveShadow />
      <B s={[sW + 0.1, 0.9, D + 0.2]} p={[(x0 - 0.1 + GX) / 2, h - 0.45, cz]} c={COLORS.brand} />
      <B s={[sW + 0.08, 0.8, D + 0.16]} p={[(x0 - 0.08 + GX) / 2, 0.4, cz]} c="#C8D0E2" />
      {/* 분류동 벽 */}
      <mesh geometry={unitBox} position={[gcx, h / 2, z0 + 0.2]} scale={[gW, h, 0.4]} material={mats.hallFront} castShadow receiveShadow />
      <mesh geometry={unitBox} position={[gcx, h / 2, z1 - 0.2]} scale={[gW, h, 0.4]} material={mats.hallFront} castShadow receiveShadow />
      <mesh geometry={unitBox} position={[x1 - 0.2, h / 2, cz]} scale={[0.4, h, D]} material={mats.side} castShadow receiveShadow />
      {[[gcx + 0.2, z0 + 0.15, gW - 0.3, 0.6], [gcx + 0.2, z1 - 0.15, gW - 0.3, 0.6]].map(([x, z, w, d], i) => (
        <group key={i}>
          <B s={[w, 0.9, d]} p={[x, h - 0.45, z]} c={COLORS.brand} />
          <B s={[w, 0.8, d - 0.1]} p={[x, 0.4, z]} c="#C8D0E2" />
          <B s={[w, 0.4, d + 0.3]} p={[x, h + 0.2, z]} c={COLORS.brandDeep} />
        </group>
      ))}
      <B s={[0.6, 0.9, D + 0.2]} p={[x1 - 0.15, h - 0.45, cz]} c={COLORS.brand} />
      <B s={[0.5, 0.8, D + 0.16]} p={[x1 - 0.15, 0.4, cz]} c="#C8D0E2" />
      <B s={[0.9, 0.4, D + 0.6]} p={[x1 + 0.0, h + 0.2, cz]} c={COLORS.brandDeep} />
      {/* 유리 지붕: 트러스 · 중도리 · 유리 */}
      {Array.from({ length: Math.floor(gW / 7) }, (_, i) => GX + 7 * (i + 1)).filter((x) => x < x1 - 1).map((x) => (
        <B key={x} s={[0.16, 0.3, D]} p={[x, h + 0.12, cz]} c="#E9EDF5" cast={false} />
      ))}
      <B s={[gW, 0.14, 0.14]} p={[gcx, h + 0.18, cz]} c="#E9EDF5" cast={false} />
      <mesh geometry={unitPlane} scale={[gW, 1, D]} position={[gcx, h + 0.32, cz]} material={glass} />
      {/* 천장 조명 라인 */}
      {[-33, -26, -19].map((z) => (
        <B key={z} s={[gW - 4, 0.08, 0.22]} p={[gcx, h - 1.2, z]} m={mat('#FFFFFF', { emissive: '#FFF7E0', emissiveIntensity: 0.6 })} cast={false} />
      ))}
      <B s={[sW + 0.7, 0.55, 0.3]} p={[scx, h + 0.55, z1 + 0.2]} c={COLORS.brand} />
      <B s={[sW + 0.7, 0.55, 0.3]} p={[scx, h + 0.55, z0 - 0.2]} c={COLORS.brand} />
      <B s={[0.3, 0.55, D + 0.7]} p={[x0 - 0.2, h + 0.55, cz]} c={COLORS.brand} />
      <B s={[0.3, 0.55, D + 0.7]} p={[x1 + 0.2, h + 0.55, cz]} c={COLORS.brand} />
      {[[x0, z0], [x1, z0], [x0, z1], [x1, z1], [GX, z0], [GX, z1]].map(([x, z], i) => (
        <B key={i} s={[0.9, h + 0.3, 0.9]} p={[x, (h + 0.3) / 2, z]} c={COLORS.brandDeep} />
      ))}
      {/* 보관동 지붕: 채광창 · 공조기 · 로고 */}
      {[-54, -32].map((x) => (
        <B key={x} s={[1.4, 0.16, D - 6]} p={[x, h + 0.46, cz]} c="#D9E3FF" cast={false} />
      ))}
      {[[-47, -14.5], [-39, -14.5], [-52, -39.5], [-44, -39.5], [-36, -39.5]].map(([x, z], i) => (
        <group key={i} position={[x, h + 0.4, z]}>
          <RB s={[2.6, 1.1, 1.8]} rad={0.1} p={[0, 0.55, 0]} c="#F3F5FA" />
          <mesh geometry={cylGeo(0.55, 0.55, 0.06, 20)} position={[-0.6, 1.12, 0]} material={mat('#5A6274')} />
          <mesh geometry={cylGeo(0.55, 0.55, 0.06, 20)} position={[0.65, 1.12, 0]} material={mat('#5A6274')} />
        </group>
      ))}
      <mesh geometry={unitPlane} scale={[13, 1, 13]} position={[-43, h + 0.42, cz]} material={basic('#ffffff', 1, roofLogoTex())} />
      {/* 보관동 지붕 태양광(탄소 탭에서 발전량 확인) */}
      <SolarPanels y={h + 0.4} panels={[-50.2, -45.2, -40.2, -35.2].flatMap((x) => [[x, -17.6, 4.6, 2.6], [x, -36.2, 4.6, 2.6]] as [number, number, number, number][])} />

      {/* 정면 간판 · 창 */}
      <Decal tex={signTex(tr('다온로지스', 'Daon Logistics'), tr('곤지암 메가허브 · GJ-01', 'Gonjiam Mega Hub · GJ-01'))} w={17} h={4.25} p={[-24, 8.1, fz + 0.05]} />
      <mesh geometry={unitBox} position={[-1, 8.6, fz]} scale={[24, 1.6, 0.08]} material={windows} />

      {/* 입고문(지게차) */}
      {L.IN_DOORS.map((x, i) => (
        <group key={x} position={[x, 0, fz]}>
          <B s={[4.1, 4.75, 0.24]} p={[0, 2.37, 0.02]} c={COLORS.brand} />
          <B s={[3.6, 4.3, 0.06]} p={[0, 2.15, 0.16]} c="#1A1F2B" cast={false} />
          <group position={[0, 4.3, 0.2]} userData={{ dynamic: true }} ref={(o) => { if (refs) refs.inDoors[i] = o }}>
            <mesh geometry={unitBox} position={[0, -2.15, 0]} scale={[3.6, 4.3, 0.06]} material={shutter} />
          </group>
          <B s={[3.7, 0.3, 0.4]} p={[0, 4.45, 0.3]} c="#DCE2EE" />
          <Decal tex={labelTex(tr(`입고 ${i + 1}`, `Inbound ${i + 1}`))} w={1.9} h={0.72} p={[0, 5.3, 0.16]} />
          {[2.3, -2.3].map((dx) => (
            <group key={dx}>
              <Cyl rt={0.13} h={1.1} p={[dx, 0.55, 0.55]} c={COLORS.yellow} />
              <Cyl rt={0.135} h={0.14} p={[dx, 0.8, 0.55]} c="#2E3442" cast={false} />
            </group>
          ))}
        </group>
      ))}

      {/* 출고 도크(간선 탑차) */}
      <B s={[32, 0.3, 3.4]} p={[-6, 6.3, z1 + 1.7]} c="#F4F6FB" />
      <B s={[32, 0.42, 0.16]} p={[-6, 6.3, z1 + 3.4]} c={COLORS.brand} />
      {L.OUT_DOCKS.map((x, i) => (
        <group key={x} position={[x, 0, fz]}>
          <B s={[3.9, 3.9, 0.5]} p={[0, 2.95, 0.25]} c="#2A2F3B" />
          <B s={[3.0, 3.2, 0.06]} p={[0, 2.8, 0.52]} c="#11151F" cast={false} />
          <group position={[0, 4.4, 0.56]} userData={{ dynamic: true }} ref={(o) => { if (refs) refs.docks[i] = o }}>
            <mesh geometry={unitBox} position={[0, -1.6, 0]} scale={[3.0, 3.2, 0.05]} material={shutter} />
          </group>
          <B s={[3.7, 1.2, 0.4]} p={[0, 0.6, 0.2]} c="#C4CBDA" />
          <B s={[3.7, 0.08, 0.06]} p={[0, 1.22, 0.42]} c={COLORS.yellow} cast={false} />
          {[1.25, -1.25].map((dx) => (
            <B key={dx} s={[0.32, 0.5, 0.3]} p={[dx, 1.0, 0.5]} c="#1F232C" />
          ))}
          <Decal tex={labelTex(tr(`출고 ${i + 1}`, `Outbound ${i + 1}`), '#1E3BB3')} w={1.9} h={0.72} p={[0, 5.35, 0.55]} />
          <B s={[0.3, 0.2, 0.3]} p={[2.1, 4.5, 0.3]} m={lampMaterial(mat('#FFF6D8', { emissive: '#FFE7A0', emissiveIntensity: 0.6 }))} />
        </group>
      ))}

      {/* 동쪽 벽 컨베이어 출구 */}
      <B s={[0.2, 1.8, 2.0]} p={[x1 + 0.05, 1.45, L.CONVEYOR.z]} c="#151A25" cast={false} />
      <B s={[0.3, 0.3, 2.6]} p={[x1 + 0.12, 2.5, L.CONVEYOR.z]} c={COLORS.brand} />
      {/* 빗물 홈통 */}
      {[-56, -45.5, -36.5, -28, -19, 8, 12].map((x) => (
        <Cyl key={x} rt={0.1} h={h} p={[x, h / 2, z1 + 0.15]} c={COLORS.brandDeep} cast={false} />
      ))}
    </group>
  )
}

/** 배송 분류장 캐노피 + 컨베이어(휠소터) */
export function SortingCanopy() {
  const { x0, x1, z0, z1 } = L.CANOPY
  const H = 7.2
  const cx = (x0 + x1) / 2
  const cz = (z0 + z1) / 2
  const C = L.CONVEYOR
  const len = C.x1 - C.x0
  const belt = useMemo(() => new THREE.MeshStandardMaterial({ map: beltTex(), roughness: 0.7 }), [])
  const glass = useMemo(() => new THREE.MeshStandardMaterial({ color: '#C7D6FF', transparent: true, opacity: 0.14, depthWrite: false, side: THREE.DoubleSide, roughness: 0.2 }), [])
  return (
    <group>
      {[x0, (x0 + cx) / 2, cx, (cx + x1) / 2, x1].flatMap((x) => [z0 + 0.4, z1].map((z) => (
        <B key={`${x}${z}`} s={[0.38, H, 0.38]} p={[x, H / 2, z]} c="#E3E8F2" />
      )))}
      <B s={[x1 - x0 + 0.6, 0.55, 0.4]} p={[cx, H, z1]} c={COLORS.brand} />
      <B s={[x1 - x0 + 0.6, 0.55, 0.4]} p={[cx, H, z0 + 0.4]} c="#E3E8F2" />
      {[x0, (x0 + cx) / 2, cx, (cx + x1) / 2, x1].map((x) => (
        <B key={x} s={[0.3, 0.45, z1 - z0]} p={[x, H, cz]} c="#E3E8F2" />
      ))}
      {Array.from({ length: 9 }, (_, i) => z0 + 1 + i * 3.4).map((z) => (
        <B key={z} s={[x1 - x0, 0.1, 0.1]} p={[cx, H + 0.25, z]} c="#F4F6FB" cast={false} />
      ))}
      <mesh geometry={unitPlane} scale={[x1 - x0 + 0.4, 1, z1 - z0]} position={[cx, H + 0.3, cz]} material={glass} />
      <Decal tex={labelTex(tr('배송 분류장 · SUB-A', 'Delivery Sorting · SUB-A'), '#2F55E6', '#FFFFFF', 640, 96)} w={9} h={1.35} p={[cx, H - 0.05, z1 + 0.22]} />

      {/* 컨베이어 */}
      <B s={[len, 0.28, 1.34]} p={[C.x0 + len / 2, C.y - 0.2, C.z]} c="#C3CAD8" />
      <mesh geometry={unitBox} position={[C.x0 + len / 2, C.y, C.z]} scale={[len, 0.08, 1.02]} material={[belt, belt, belt, belt, belt, belt]} receiveShadow userData={{ belt: true }} />
      {[0.6, -0.6].map((dz) => (
        <B key={dz} s={[len, 0.2, 0.07]} p={[C.x0 + len / 2, C.y + 0.12, C.z + dz]} c="#97A1B5" />
      ))}
      {Array.from({ length: Math.floor(len / 2.6) + 1 }, (_, i) => C.x0 + 0.6 + i * 2.6).map((x) => (
        <group key={x}>
          <B s={[0.1, C.y - 0.3, 0.1]} p={[x, (C.y - 0.3) / 2, C.z + 0.55]} c="#8C96AA" />
          <B s={[0.1, C.y - 0.3, 0.1]} p={[x, (C.y - 0.3) / 2, C.z - 0.55]} c="#8C96AA" />
        </group>
      ))}
      {L.VAN_XS.flatMap((x) => [
        <group key={`n${x}`} position={[x, 0, 0]}>
          <B s={[1.1, 0.05, 1.55]} p={[0, C.y - 0.1, C.z - 1.3]} r={[0.12, 0, 0]} c="#B7C0D1" />
          <B s={[0.05, 0.2, 1.5]} p={[0.55, C.y, C.z - 1.3]} r={[0.12, 0, 0]} c="#97A1B5" />
          <B s={[0.05, 0.2, 1.5]} p={[-0.55, C.y, C.z - 1.3]} r={[0.12, 0, 0]} c="#97A1B5" />
        </group>,
        <group key={`s${x}`} position={[x, 0, 0]}>
          <B s={[1.1, 0.05, 1.55]} p={[0, C.y - 0.1, C.z + 1.3]} r={[-0.12, 0, 0]} c="#B7C0D1" />
          <B s={[0.05, 0.2, 1.5]} p={[0.55, C.y, C.z + 1.3]} r={[-0.12, 0, 0]} c="#97A1B5" />
          <B s={[0.05, 0.2, 1.5]} p={[-0.55, C.y, C.z + 1.3]} r={[-0.12, 0, 0]} c="#97A1B5" />
        </group>,
      ])}
      {/* 자동 스캐너 게이트 */}
      <group position={[C.x0 + 3.2, 0, C.z]}>
        <B s={[0.25, 2.6, 0.25]} p={[0, 1.3, 0.85]} c="#F4F6FB" />
        <B s={[0.25, 2.6, 0.25]} p={[0, 1.3, -0.85]} c="#F4F6FB" />
        <RB s={[0.9, 0.6, 2.0]} rad={0.1} p={[0, 2.7, 0]} c="#F4F6FB" />
        <B s={[0.92, 0.12, 2.02]} p={[0, 2.55, 0]} m={mat('#5B7CFF', { emissive: '#3E63FF', emissiveIntensity: 1.2 })} cast={false} />
      </group>
      <B s={[1.2, 0.6, 1.6]} p={[C.x1 + 0.4, C.y - 0.1, C.z]} c="#97A1B5" />
    </group>
  )
}

/** 정문 · 경비실 · 차단기 */
export function GateHouse({ inRef, outRef }: { inRef?: (o: THREE.Object3D | null) => void; outRef?: (o: THREE.Object3D | null) => void }) {
  const stripe = useMemo(() => new THREE.MeshStandardMaterial({ map: stripeTex(), roughness: 0.5 }), [])
  const z = L.GATE_Z
  return (
    <group>
      <group position={[68.6, 0, z + 0.5]}>
        <RB s={[3.4, 2.8, 3.0]} rad={0.1} p={[0, 1.4, 0]} c="#F6F8FC" />
        <B s={[3.42, 0.9, 3.02]} p={[0, 1.85, 0]} c={COLORS.glass} cast={false} />
        <B s={[4.4, 0.25, 4.0]} p={[0, 2.95, 0]} c={COLORS.brand} />
        <Decal tex={labelTex(tr('정문 경비실', 'Gate Security'), '#FFFFFF', '#1E3BB3', 320, 96)} w={2.2} h={0.66} p={[0, 2.5, 1.52]} />
      </group>
      {[
        { px: 65.7, dir: -1, ref: inRef },
        { px: 58.3, dir: 1, ref: outRef },
      ].map(({ px, dir, ref }) => (
        <group key={px} position={[px, 0, z]}>
          <B s={[0.45, 1.1, 0.45]} p={[0, 0.55, 0]} c={COLORS.yellow} />
          <B s={[0.47, 0.18, 0.47]} p={[0, 0.85, 0]} c="#2E3442" cast={false} />
          <group position={[0, 1.0, 0]} userData={{ dynamic: true }} ref={ref}>
            <mesh geometry={unitBox} position={[dir * 1.75, 0, 0]} scale={[3.5, 0.14, 0.1]} material={stripe} castShadow />
          </group>
        </group>
      ))}
      <B s={[7, 0.12, 0.5]} p={[62, 0.06, z + 3]} c={COLORS.yellow} />
      <B s={[0.25, 2.6, 0.25]} p={[56.6, 1.3, z + 1.2]} c="#AEB6C6" />
      <group position={[56.6, 2.9, z + 1.2]}>
        <Decal tex={labelTex(tr('GJ-01 곤지암 메가허브', 'GJ-01 Gonjiam Mega Hub'), '#1E3BB3', '#FFFFFF', 640, 110)} w={4.6} h={0.8} p={[0, 0, 0.14]} />
        <B s={[4.7, 0.9, 0.2]} p={[0, 0, 0]} c="#1E3BB3" />
      </group>
    </group>
  )
}

/** 관리동(3층 커튼월) */
export function Office({ p, w = 16, d = 10, floors = 3 }: { p: [number, number]; w?: number; d?: number; floors?: number }) {
  const h = floors * 3.6
  const m = useMemo(() => {
    const t = windowsTex('office')
    const a = windowMaterial(new THREE.MeshStandardMaterial({ map: repeated(t, w / 6, floors / 2.2), roughness: 0.4, metalness: 0.05 }), 'office')
    const b = windowMaterial(new THREE.MeshStandardMaterial({ map: repeated(t, d / 6, floors / 2.2), roughness: 0.4, metalness: 0.05 }), 'office')
    return [b, b, mat('#EEF1F7'), mat('#EEF1F7'), a, a] as THREE.Material[]
  }, [w, d, floors])
  return (
    <group position={[p[0], 0, p[1]]}>
      <mesh geometry={unitBox} position={[0, h / 2, 0]} scale={[w, h, d]} material={m} castShadow receiveShadow />
      <B s={[w + 0.4, 0.5, d + 0.4]} p={[0, h + 0.25, 0]} c={COLORS.brand} />
      <B s={[w + 0.3, 0.4, d + 0.3]} p={[0, 0.2, 0]} c="#C8D0E2" />
      <B s={[5, 0.25, 2.6]} p={[0, 3.4, d / 2 + 1.3]} c="#F4F6FB" />
      <B s={[0.18, 3.4, 0.18]} p={[2.3, 1.7, d / 2 + 2.4]} c="#C9D0DE" />
      <B s={[0.18, 3.4, 0.18]} p={[-2.3, 1.7, d / 2 + 2.4]} c="#C9D0DE" />
      <RB s={[3.2, 1.1, 2.4]} rad={0.1} p={[-3, h + 1.0, -1]} c="#F3F5FA" />
      <Decal tex={labelTex(tr('다온로지스', 'Daon Logistics'), '#FFFFFF', '#2F55E6', 400, 110)} w={5.2} h={1.4} p={[2.5, h + 1.3, d / 2 - 0.4]} />
    </group>
  )
}

export function ShippingContainer({ name, color }: { name: string; color: string }) {
  const m = useMemo(() => {
    const side = new THREE.MeshStandardMaterial({ map: containerTex(name, color), roughness: 0.6 })
    const plain = mat(color, { rough: 0.6 })
    return [plain, plain, plain, plain, side, side] as THREE.Material[]
  }, [name, color])
  return <mesh geometry={unitBox} position={[0, 1.3, 0]} scale={[2.44, 2.6, 6.06]} rotation={[0, 0, 0]} material={m} castShadow receiveShadow />
}

/** 배경 아파트 단지(창 텍스처 공유 + 동 표지는 아틀라스) */
export function Apartment({ p, h, label, rot = 0 }: { p: [number, number]; h: number; label: string; rot?: number }) {
  const geo = boxUV([null, null, null, null, [2.2, h / 26], [2.2, h / 26]])
  const m = useMemo(() => [mat('#EEF1F7'), mat('#EEF1F7'), mat('#E3E7F0'), mat('#EEF1F7'), aptFaceMat(), aptFaceMat()] as THREE.Material[], [])
  return (
    <group position={[p[0], 0, p[1]]} rotation={[0, rot, 0]}>
      <mesh geometry={geo} position={[0, h / 2, 0]} scale={[30, h, 11]} material={m} castShadow receiveShadow />
      <B s={[8, 3.4, 6]} p={[-7, h + 1.7, 0]} c="#F1F3F8" />
      <B s={[30.4, 0.6, 11.4]} p={[0, h + 0.3, 0]} c="#C9D3EA" />
      {/* 지붕 포인트 띠 · 계단실 띠 */}
      <B s={[30.6, 1.2, 0.2]} p={[0, h - 0.6, 5.55]} c={COLORS.brand} />
      <B s={[2.4, h - 2, 0.12]} p={[9, h / 2, 5.56]} c="#DCE2EE" cast={false} />
      {APT_NUMS.includes(Number(label)) && <AtlasSign cell={`lbl-${label}`} w={3.2} h={1.2} p={[11, h - 3, 5.58]} />}
    </group>
  )
}

type IndustrialProps = {
  p: [number, number]; w: number; d: number; h: number; roof?: string; rot?: number
  /** 회사 간판(townAtlas SIGNS), 벽 띠 색, 굴뚝·사일로·지붕 환기구·하역 도크 */
  sign?: string; stripe?: string; chimney?: boolean; silos?: number; vents?: number; docks?: number
}

/** 주변 공장·창고(배경). 골강판 벽은 공유 재질 + boxUV */
export function Industrial({ p, w, d, h, roof = '#B9C6E6', rot = 0, sign, stripe, chimney, silos = 0, vents = 0, docks = 0 }: IndustrialProps) {
  const geo = boxUV([[d / 6, 1], [d / 6, 1], null, null, [w / 6, 1], [w / 6, 1]])
  const m = useMemo(() => [corrugatedMat(), corrugatedMat(), mat(roof), mat(roof), corrugatedMat(), corrugatedMat()] as THREE.Material[], [roof])
  return (
    <group position={[p[0], 0, p[1]]} rotation={[0, rot, 0]}>
      <mesh geometry={geo} position={[0, h / 2, 0]} scale={[w, h, d]} material={m} castShadow receiveShadow />
      <B s={[w + 0.3, 0.4, d + 0.3]} p={[0, h + 0.2, 0]} c={roof} />
      {stripe && <B s={[w + 0.06, 0.9, d + 0.06]} p={[0, h - 1.2, 0]} c={stripe} cast={false} />}
      {sign && <AtlasSign cell={signId(sign)} w={Math.min(12, w * 0.4)} h={Math.min(3, w * 0.1)} p={[-w * 0.22, h - 2.8, d / 2 + 0.06]} lit />}
      {Array.from({ length: vents }, (_, i) => (
        <RB key={`v${i}`} s={[2, 1, 2]} rad={0.1} p={[-w / 2 + 5 + i * ((w - 10) / Math.max(1, vents - 1)), h + 0.8, 0]} c="#F1F3F8" />
      ))}
      {chimney && <Cyl rt={0.7} rb={0.9} h={h * 1.6} p={[w / 2 - 3, h * 0.8, -d / 2 + 3]} c="#C9CFDA" />}
      {chimney && <Cyl rt={0.72} h={1.2} p={[w / 2 - 3, h * 1.5, -d / 2 + 3]} c="#E2453C" />}
      {Array.from({ length: silos }, (_, i) => (
        <group key={`s${i}`} position={[-w / 2 - 3.5, 0, -d / 2 + 4 + i * 6]}>
          <Cyl rt={2.5} h={h * 1.5} p={[0, h * 0.75, 0]} c="#E9ECF4" />
          <mesh geometry={coneGeo(2.5, 1.6, 16)} position={[0, h * 1.5 + 0.8, 0]} material={mat('#C9CFDA')} castShadow />
        </group>
      ))}
      {Array.from({ length: docks }, (_, i) => (
        <group key={`d${i}`} position={[w / 2 - 5 - i * 5, 0, d / 2 + 0.05]}>
          <B s={[3.4, 3.6, 0.1]} p={[0, 1.8, 0]} c="#3B4252" cast={false} />
          <B s={[3.8, 0.3, 1.4]} p={[0, 3.9, 0.6]} c="#DCE2EE" />
        </group>
      ))}
    </group>
  )
}

export function StreetLight({ p, rot = 0 }: { p: [number, number]; rot?: number }) {
  return (
    <group position={[p[0], 0, p[1]]} rotation={[0, rot, 0]}>
      <Cyl rt={0.08} rb={0.12} h={7} p={[0, 3.5, 0]} c="#9AA4B8" />
      <B s={[0.12, 0.12, 1.6]} p={[0, 6.9, 0.75]} c="#9AA4B8" />
      <B s={[0.36, 0.14, 0.7]} p={[0, 6.82, 1.5]} m={lampMaterial(mat('#FFF8E6', { emissive: '#FFE9B8', emissiveIntensity: 0.45 }))} />
    </group>
  )
}

/** 임의 정문(북쪽/남쪽 거점 공용) */
export function GateHouseAt({ gate, label, inRef, outRef }: {
  gate: { x: number; side: 'N' | 'S'; inX: number; outX: number; gateZ: number }
  label: string
  inRef?: (o: THREE.Object3D | null) => void
  outRef?: (o: THREE.Object3D | null) => void
}) {
  const stripe = useMemo(() => new THREE.MeshStandardMaterial({ map: stripeTex(), roughness: 0.5 }), [])
  const n = gate.side === 'N' ? 1 : -1
  const z = gate.gateZ
  // 북쪽 거점: 진입 차로가 x+, 남쪽 거점: 진입 차로가 x-
  const inPost = gate.x + n * 3.7
  const outPost = gate.x - n * 3.7
  return (
    <group>
      <group position={[gate.x + n * 6.6, 0, z + n * 0.5]}>
        <RB s={[3.4, 2.8, 3.0]} rad={0.1} p={[0, 1.4, 0]} c="#F6F8FC" />
        <B s={[3.42, 0.9, 3.02]} p={[0, 1.85, 0]} c={COLORS.glass} cast={false} />
        <B s={[4.4, 0.25, 4.0]} p={[0, 2.95, 0]} c={COLORS.brand} />
      </group>
      {[
        { px: inPost, dir: -n, ref: inRef },
        { px: outPost, dir: n, ref: outRef },
      ].map(({ px, dir, ref }) => (
        <group key={px} position={[px, 0, z]}>
          <B s={[0.45, 1.1, 0.45]} p={[0, 0.55, 0]} c={COLORS.yellow} />
          <B s={[0.47, 0.18, 0.47]} p={[0, 0.85, 0]} c="#2E3442" cast={false} />
          <group position={[0, 1.0, 0]} userData={{ dynamic: true }} ref={ref}>
            <mesh geometry={unitBox} position={[dir * 1.75, 0, 0]} scale={[3.5, 0.14, 0.1]} material={stripe} castShadow />
          </group>
        </group>
      ))}
      <B s={[7, 0.12, 0.5]} p={[gate.x, 0.06, z + n * 3]} c={COLORS.yellow} />
      <B s={[0.25, 2.6, 0.25]} p={[gate.x - n * 5.4, 1.3, z + n * 1.2]} c="#AEB6C6" />
      <group position={[gate.x - n * 5.4, 2.9, z + n * 1.2]} rotation={[0, gate.side === 'N' ? 0 : Math.PI, 0]}>
        <Decal tex={labelTex(label, '#1E3BB3', '#FFFFFF', 640, 110)} w={4.6} h={0.8} p={[0, 0, 0.14]} />
        <B s={[4.7, 0.9, 0.2]} p={[0, 0, 0]} c="#1E3BB3" />
      </group>
    </group>
  )
}

/** 지붕 태양광 패널 줄: [x, z, 폭, 깊이]. 남쪽(+z)으로 기울인다 */
export function SolarPanels({ panels, y, tilt = 0.25 }: { panels: [number, number, number, number][]; y: number; tilt?: number }) {
  const m = useMemo(() => new THREE.MeshStandardMaterial({ map: solarTex(), roughness: 0.25, metalness: 0.3 }), [])
  return (
    <group>
      {panels.map(([x, z, w, d], i) => (
        <group key={i} position={[x, y, z]}>
          <mesh geometry={unitBox} position={[0, 0.45, 0]} rotation={[-tilt, 0, 0]} scale={[w, 0.1, d]} material={m} castShadow />
          {/* 높은 쪽(+z) 받침 */}
          <B s={[w - 0.4, 0.45 + Math.sin(tilt) * d * 0.42, 0.08]} p={[0, (0.45 + Math.sin(tilt) * d * 0.42) / 2, d * 0.42]} c="#8A94A8" cast={false} />
        </group>
      ))}
    </group>
  )
}

let hazard: THREE.MeshStandardMaterial | null = null
/** 노랑·검정 빗금(도크 앞 · 위험 구역 바닥) */
export function hazardMat() {
  hazard ??= new THREE.MeshStandardMaterial({ map: stripeTex('#F2C233', '#262A33'), roughness: 0.9 })
  return hazard
}

let walk: THREE.MeshStandardMaterial | null = null
/** 보행로(초록 바닥 도장) */
export function walkMat() {
  walk ??= new THREE.MeshStandardMaterial({ color: '#3FAE6A', roughness: 0.9 })
  return walk
}
