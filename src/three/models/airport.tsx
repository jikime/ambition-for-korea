// 인천공항 화물터미널 정적 에셋: 활주로·유도로·주기장 표시, 화물터미널, 관제탑, 격납고, 소방대, 레이더, 풍향계
import { useMemo } from 'react'
import * as THREE from 'three'
import { B, COLORS, Cyl, Flat, RB, cylGeo, mat, sphereGeo, unitBox } from '../kit'
import { FONT, canvasTex, corrugatedTex, labelTex, shutterTex, signTex } from '../textures'
import { L } from '../../i18n'
import { Decal, GroundPaint, SolarPanels } from './structures'
import { lampMaterial, windowMaterial } from '../env/state'
import { AP, AP_DOCK_Z } from '../../sim/airport'

function repeated(tex: THREE.Texture, rx: number, ry: number) {
  const t = tex.clone()
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.repeat.set(rx, ry)
  t.needsUpdate = true
  return t
}

const font = (w: number, px: number) => `${w} ${px}px ${FONT}`

function paint(text: string, w = 256, h = 256, px = 200) {
  return canvasTex(`ap-paint-${text}-${w}x${h}`, w, h, (ctx) => {
    ctx.fillStyle = '#FFFFFF'
    ctx.font = font(800, px)
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(text, w / 2, h / 2 + 8)
  })
}

/** 활주로: 아스팔트·중심선·활주로 끝 표시(피아노 건반)·번호·접지 구역·가장자리 등 */
export function Runway() {
  const { x0, x1, z, w } = AP.runway
  const len = x1 - x0
  const asphalt = useMemo(() => {
    const m = mat('#7D8492', { rough: 0.95 })
    m.userData.snow = 0.3
    return m
  }, [])
  const white = mat('#F4F6FA', { rough: 0.9 })
  return (
    <group>
      <Flat s={[len + 40, w + 24]} p={[(x0 + x1) / 2, z]} c="#C9D3C3" y={0.01} />
      <Flat s={[len, w]} p={[(x0 + x1) / 2, z]} m={asphalt} y={0.02} />
      {/* 가장자리선 */}
      {[-1, 1].map((s) => <Flat key={s} s={[len, 0.9]} p={[(x0 + x1) / 2, z + s * (w / 2 - 1.2)]} m={white} y={0.03} />)}
      {/* 중심선 */}
      {Array.from({ length: Math.floor((len - 120) / 50) }, (_, i) => x0 + 70 + i * 50).map((x) => <Flat key={x} s={[30, 0.9]} p={[x, z]} m={white} y={0.03} />)}
      {/* 활주로 끝 표시 */}
      {[x0 + 8, x1 - 8].map((x) => Array.from({ length: 12 }, (_, i) => -w / 2 + 3 + i * ((w - 6) / 11)).filter((dz) => Math.abs(dz) > 3).map((dz) => <Flat key={`${x}${dz}`} s={[30, 1.6]} p={[x, z + dz]} m={white} y={0.03} />))}
      {/* 접지 구역 · 조준점 */}
      {[x0 + 150, x1 - 150].map((x) => [-1, 1].map((s) => <Flat key={`${x}${s}`} s={[45, 6]} p={[x, z + s * 9]} m={white} y={0.03} />))}
      {[x0 + 220, x0 + 270, x1 - 220, x1 - 270].map((x) => [-1, 1].map((s) => <Flat key={`${x}${s}`} s={[22, 1.6]} p={[x, z + s * 11]} m={white} y={0.03} />))}
      {/* 활주로 번호: 서쪽 끝 09(동쪽으로 착륙), 동쪽 끝 27 */}
      <GroundPaint tex={paint('09')} w={22} h={22} p={[x0 + 50, z]} rot={Math.PI / 2} opacity={0.95} />
      <GroundPaint tex={paint('27')} w={22} h={22} p={[x1 - 50, z]} rot={-Math.PI / 2} opacity={0.95} />
    </group>
  )
}

/** 활주로·유도로 등(인스턴스, 밤에 밝아진다) */
export function AirfieldLights() {
  const meshes = useMemo(() => {
    const { x0, x1, z, w } = AP.runway
    const white: [number, number][] = []
    for (let x = x0; x <= x1; x += 30) {
      white.push([x, z - w / 2 - 0.8])
      white.push([x, z + w / 2 + 0.8])
    }
    const blue: [number, number][] = []
    for (let x = AP.links[0]; x <= AP.links[2] + 10; x += 24) {
      blue.push([x, AP.taxiZ - 12.5])
      blue.push([x, AP.taxiZ + 12.5])
    }
    for (const lx of AP.links) for (let zz = AP.runway.z + w / 2 + 6; zz < AP.taxiZ - 14; zz += 12) { blue.push([lx - 9.5, zz]); blue.push([lx + 9.5, zz]) }
    const green: [number, number][] = Array.from({ length: 12 }, (_, i) => [x0 - 1.5, z - w / 2 + 2 + i * ((w - 4) / 11)])
    const red: [number, number][] = Array.from({ length: 12 }, (_, i) => [x1 + 1.5, z - w / 2 + 2 + i * ((w - 4) / 11)])
    // 진입등: 서쪽 활주로 끝 밖으로 한 줄
    const approach: [number, number][] = []
    for (let x = x0 - 30; x > x0 - 300; x -= 30) for (const dz of [-6, -3, 0, 3, 6]) approach.push([x, z + dz])
    const make = (pts: [number, number][], c: string, s: number, y = 0.35) => {
      const m = new THREE.InstancedMesh(unitBox, lampMaterial(mat(c, { emissive: c, emissiveIntensity: 0.9 })), pts.length)
      const o = new THREE.Object3D()
      pts.forEach(([x, zz], i) => {
        o.position.set(x, y, zz)
        o.scale.set(s, s * 0.8, s)
        o.updateMatrix()
        m.setMatrixAt(i, o.matrix)
      })
      return m
    }
    const poles = new THREE.InstancedMesh(unitBox, mat('#B4BDCD'), approach.length)
    const o = new THREE.Object3D()
    approach.forEach(([x, zz], i) => {
      o.position.set(x, 1, zz)
      o.scale.set(0.12, 2, 0.12)
      o.updateMatrix()
      poles.setMatrixAt(i, o.matrix)
    })
    return [make(white, '#FFF6DE', 0.5), make(blue, '#4C7DFF', 0.45), make(green, '#35D07F', 0.55), make(red, '#FF4B3E', 0.55), make(approach, '#FFF6DE', 0.55, 2.1), poles]
  }, [])
  return <group>{meshes.map((m, i) => <primitive key={i} object={m} />)}</group>
}

/** 유도로·연결 유도로·주기장 포장과 표시 */
export function TaxiwaysApron() {
  const { x0, x1, z0, z1 } = AP.apron
  const asphalt = useMemo(() => {
    const m = mat('#8C93A0', { rough: 0.95 })
    m.userData.snow = 0.3
    return m
  }, [])
  const concrete = useMemo(() => {
    const m = mat('#CDD2DB', { rough: 0.9 })
    m.userData.snow = 0.45
    return m
  }, [])
  const yellow = mat(COLORS.yellow, { rough: 0.9 })
  const tx0 = AP.links[0] - 12
  const tx1 = AP.links[2] + 12
  return (
    <group>
      <Flat s={[tx1 - tx0, 25]} p={[(tx0 + tx1) / 2, AP.taxiZ]} m={asphalt} y={0.02} />
      <Flat s={[tx1 - tx0 - 10, 0.5]} p={[(tx0 + tx1) / 2, AP.taxiZ]} m={yellow} y={0.036} />
      {AP.links.map((x) => (
        <group key={x}>
          <Flat s={[19, AP.taxiZ - AP.runway.z - 18]} p={[x, (AP.taxiZ + AP.runway.z) / 2]} m={asphalt} y={0.016} />
          <Flat s={[0.5, AP.taxiZ - AP.runway.z - 24]} p={[x, (AP.taxiZ + AP.runway.z) / 2]} m={yellow} y={0.036} />
          {/* 활주로 진입 대기선(실선 2 + 점선 2) */}
          {[0, 1].map((k) => <Flat key={k} s={[19, 0.35]} p={[x, AP.runway.z + 38 + k * 0.9]} m={yellow} y={0.036} />)}
          {[0, 1].map((k) => Array.from({ length: 5 }, (_, i) => <Flat key={`${k}${i}`} s={[2.4, 0.35]} p={[x - 8 + i * 4, AP.runway.z + 40 + k * 0.9]} m={yellow} y={0.036} />))}
        </group>
      ))}
      {/* 주기장 */}
      <Flat s={[x1 - x0, z1 - z0]} p={[(x0 + x1) / 2, (z0 + z1) / 2]} m={concrete} y={0.026} />
      <Flat s={[x1 - x0, AP.apron.z0 - AP.taxiZ + 12]} p={[(x0 + x1) / 2, (AP.apron.z0 + AP.taxiZ) / 2 - 3]} m={asphalt} y={0.012} />
      {AP.stands.map((s, i) => (
        <group key={i}>
          {/* 진입 유도선 + 정지선 */}
          <Flat s={[0.45, s.z - AP.taxiZ]} p={[s.x, (s.z + AP.taxiZ) / 2 + 2]} m={yellow} y={0.04} />
          <Flat s={[6, 0.45]} p={[s.x, s.z + 28.5]} m={yellow} y={0.04} />
          {/* 주기장 안전 구역(빨간 선) */}
          <Flat s={[64, 0.3]} p={[s.x, s.z - 34]} c="#E8453C" y={0.04} />
          <Flat s={[0.3, 66]} p={[s.x - 32, s.z]} c="#E8453C" y={0.04} />
          <Flat s={[0.3, 66]} p={[s.x + 32, s.z]} c="#E8453C" y={0.04} />
          <GroundPaint tex={labelTex(`${601 + i}`, '#F2C233', '#1A1F2B', 240, 110)} w={6} h={2.75} p={[s.x, s.z + 31]} />
        </group>
      ))}
    </group>
  )
}

/** 화물터미널: 북쪽은 주기장(대형 문), 남쪽은 트럭 도크 */
export function CargoTerminal() {
  const { x0, x1, z0, z1, h } = AP.terminal
  const W = x1 - x0
  const D = z1 - z0
  const cx = (x0 + x1) / 2
  const cz = (z0 + z1) / 2
  const mats = useMemo(() => {
    const corr = corrugatedTex('#EEF2F8', '#D3DAE6')
    const front = new THREE.MeshStandardMaterial({ map: repeated(corr, W / 6, 1), roughness: 0.8 })
    const side = new THREE.MeshStandardMaterial({ map: repeated(corr, D / 6, 1), roughness: 0.8 })
    const roof = mat('#C9D3E6')
    return [side, side, roof, roof, front, front] as THREE.Material[]
  }, [W, D])
  const shutter = useMemo(() => new THREE.MeshStandardMaterial({ map: shutterTex('#DCE2EE'), roughness: 0.6 }), [])
  const glass = useMemo(() => windowMaterial(new THREE.MeshStandardMaterial({ color: '#9DB2E8', roughness: 0.2, metalness: 0.1 }), 'office'), [])
  const sign = useMemo(() => signTex(L('다온항공 화물터미널', 'Daon Air Cargo'), L('DAON AIR CARGO TERMINAL · AP-06', 'Freight Terminal · AP-06')), [])
  return (
    <group>
      <mesh geometry={unitBox} position={[cx, h / 2, cz]} scale={[W, h, D]} material={mats} castShadow receiveShadow />
      <B s={[W + 0.6, 0.6, D + 0.6]} p={[cx, h + 0.3, cz]} c="#3A9BD9" />
      {/* 지붕 태양광 */}
      <SolarPanels y={h + 0.6} panels={Array.from({ length: 13 }, (_, i) => x0 + 14 + i * 15.5).flatMap((x) => [[x, cz - 14, 13, 7], [x, cz + 12, 13, 7]] as [number, number, number, number][])} />
      {/* 지붕 설비 */}
      {[-80, -30, 20, 70].map((dx) => (
        <RB key={dx} s={[6, 1.4, 3]} rad={0.15} p={[cx + dx, h + 1.3, cz]} c="#F3F5FA" />
      ))}
      {/* 주기장 쪽(북) 대형 문과 간판 */}
      {Array.from({ length: 9 }, (_, i) => x0 + 14 + i * ((W - 28) / 8)).map((x) => (
        <group key={x} position={[x, 0, z0 - 0.01]}>
          <B s={[8.4, 7.2, 0.3]} p={[0, 3.6, -0.12]} c="#3A9BD9" />
          <mesh geometry={unitBox} position={[0, 3.4, -0.3]} scale={[7.6, 6.8, 0.06]} material={shutter} />
        </group>
      ))}
      <Decal tex={sign} w={30} h={7.5} p={[cx, h - 2.6, z0 - 0.4]} r={[0, Math.PI, 0]} />
      {/* 육측(남) 트럭 도크 */}
      {AP.docks.map((x, i) => (
        <group key={x} position={[x, 0, z1 + 0.01]}>
          <B s={[3.9, 3.9, 0.5]} p={[0, 2.95, 0.25]} c="#2A2F3B" />
          <B s={[3.0, 3.2, 0.06]} p={[0, 2.8, 0.52]} c="#11151F" cast={false} />
          <B s={[3.7, 1.2, 0.4]} p={[0, 0.6, 0.2]} c="#C4CBDA" />
          <Decal tex={labelTex(L(`항공 ${i + 1}`, `Air ${i + 1}`), '#3A9BD9')} w={1.9} h={0.72} p={[0, 5.3, 0.55]} />
        </group>
      ))}
      <B s={[W - 20, 0.3, 3.2]} p={[cx - 40, 6.1, z1 + 1.6]} c="#F4F6FB" />
      {/* 사무동(유리) */}
      <mesh geometry={unitBox} position={[x1 - 18, h / 2 + 1, z1 + 0.4]} scale={[30, h - 2, 1]} material={glass} />
      <Decal tex={labelTex(L('수출입 통관 · 보안검색', 'Customs & Security'), '#1E3BB3', '#FFFFFF', 520, 96)} w={8} h={1.5} p={[x1 - 18, h - 1, z1 + 1]} />
      {/* 도크 앞 유도선 */}
      {AP.docks.map((x) => [-1.7, 1.7].map((dx) => <Flat key={`${x}${dx}`} s={[0.16, 12]} p={[x + dx, AP_DOCK_Z + 1]} c={COLORS.yellow} y={0.04} />))}
    </group>
  )
}

/** 관제탑 */
export function ControlTowerAP() {
  const glass = useMemo(() => {
    const m = new THREE.MeshStandardMaterial({ color: '#2B3E66', roughness: 0.1, metalness: 0.4, emissive: '#7FB4FF', emissiveIntensity: 0.15 })
    return lampMaterial(m)
  }, [])
  const H = 44
  return (
    <group>
      <B s={[18, 6, 14]} p={[0, 3, 0]} c="#E9EDF5" />
      <B s={[18.2, 0.5, 14.2]} p={[0, 6.1, 0]} c="#3A9BD9" />
      <mesh geometry={cylGeo(2.6, 3.4, H, 20)} position={[0, H / 2, 0]} material={mat('#EEF1F7')} castShadow />
      {/* 전망대(관제실): 위로 넓어지는 팔각 유리 */}
      <mesh geometry={cylGeo(6.2, 4.8, 1.6, 8)} position={[0, H + 0.8, 0]} material={mat('#DDE3EE')} castShadow />
      <mesh geometry={cylGeo(6.6, 5.6, 4.2, 8, )} position={[0, H + 3.7, 0]} material={glass} castShadow />
      <mesh geometry={cylGeo(7.2, 6.6, 1.0, 8)} position={[0, H + 6.3, 0]} material={mat('#F4F6FB')} castShadow />
      <mesh geometry={cylGeo(0.12, 0.12, 6, 6)} position={[1.5, H + 9.8, 0]} material={mat('#9AA4B8')} />
      <mesh geometry={sphereGeo(0.35, 8, 6)} position={[1.5, H + 12.9, 0]} material={lampMaterial(mat('#FF2D2D', { emissive: '#FF2D2D', emissiveIntensity: 1.2 }))} />
      <mesh geometry={sphereGeo(1.2, 16, 10)} position={[-2.6, H + 7.6, 1.2]} material={mat('#F4F6FB')} />
      <Decal tex={labelTex(L('관제탑', 'Control Tower'), '#1E3BB3', '#FFFFFF', 220, 90)} w={4.4} h={1.8} p={[0, 4.4, 7.05]} />
    </group>
  )
}

/** 정비 격납고(아치 지붕) */
export function Hangar() {
  const roof = useMemo(() => {
    const g = new THREE.CylinderGeometry(24, 24, 60, 24, 1, true, -Math.PI / 2, Math.PI)
    g.rotateZ(Math.PI / 2)
    return g
  }, [])
  return (
    <group>
      <mesh geometry={roof} position={[0, 6, 0]} scale={[1, 0.55, 1]} rotation={[0, Math.PI / 2, 0]} material={mat('#D9DEE8', { side: THREE.DoubleSide })} castShadow receiveShadow />
      <B s={[48, 6, 60]} p={[0, 3, 0]} c="#E9EDF5" />
      <B s={[44, 14, 0.4]} p={[0, 7, -30.1]} c="#B9C3D6" />
      <Decal tex={labelTex(L('정비 격납고 H1', 'Maintenance Hangar H1'), '#1E3BB3', '#FFFFFF', 420, 96)} w={10} h={2.3} p={[0, 15, -30.4]} r={[0, Math.PI, 0]} />
    </group>
  )
}

/** 공항 소방대 */
export function FireStation() {
  return (
    <group>
      <B s={[26, 7, 14]} p={[0, 3.5, 0]} c="#F2F4F8" />
      <B s={[26.2, 0.6, 14.2]} p={[0, 7.1, 0]} c="#E2463C" />
      {[-8, 0, 8].map((x) => <B key={x} s={[6.4, 5, 0.1]} p={[x, 2.5, -7.05]} c="#E2463C" />)}
      <Decal tex={labelTex(L('공항 소방대', 'Airport Fire Station'), '#E2463C', '#FFFFFF', 300, 90)} w={6} h={1.8} p={[0, 6, -7.15]} r={[0, Math.PI, 0]} />
      {/* 소방차 */}
      {[-8, 8].map((x) => (
        <group key={x} position={[x, 0, -13]}>
          <RB s={[3, 2.8, 9]} rad={0.3} p={[0, 1.9, 0]} c="#E2463C" />
          <B s={[2.9, 0.8, 2.4]} p={[0, 2.7, 3.4]} c="#2B3654" />
          {[-3, 0, 3].flatMap((z) => [-1.4, 1.4].map((dx) => <mesh key={`${z}${dx}`} geometry={cylGeo(0.7, 0.7, 0.5, 14)} rotation={[0, 0, Math.PI / 2]} position={[dx, 0.7, z]} material={mat('#23262E')} />))}
          <B s={[1.6, 0.25, 0.4]} p={[0, 3.4, 3.2]} m={lampMaterial(mat('#FF2D2D', { emissive: '#FF2D2D', emissiveIntensity: 0.6 }))} />
        </group>
      ))}
    </group>
  )
}

/** 레이더(회전 안테나는 동적) · 풍향계 */
export function RadarTower() {
  return (
    <group>
      <B s={[5, 18, 5]} p={[0, 9, 0]} c="#E9EDF5" />
      <mesh geometry={sphereGeo(4.2, 20, 14)} position={[0, 21, 0]} material={mat('#F4F6FB')} castShadow />
    </group>
  )
}

export function Windsock() {
  const sock = useMemo(() => canvasTex('windsock', 128, 32, (ctx, w, h) => {
    for (let i = 0; i < 5; i++) {
      ctx.fillStyle = i % 2 ? '#FFFFFF' : '#FF6A1F'
      ctx.fillRect((i * w) / 5, 0, w / 5, h)
    }
  }), [])
  return (
    <group>
      <Cyl rt={0.1} h={7} p={[0, 3.5, 0]} c="#9AA4B8" />
      <mesh geometry={cylGeo(0.6, 0.3, 4, 12, )} rotation={[0, 0, Math.PI / 2]} position={[2.1, 6.8, 0]} material={new THREE.MeshStandardMaterial({ map: sock, side: THREE.DoubleSide })} />
    </group>
  )
}

/** ULD 보관대 + 돌리(정적) */
export function UldYard() {
  return (
    <group>
      {Array.from({ length: 6 }, (_, i) => (
        <group key={i} position={[i * 3.6, 0, 0]}>
          <B s={[3.2, 0.25, 2.6]} p={[0, 0.5, 0]} c="#6B7383" />
          {[0, 1].map((k) => <RB key={k} s={[1.5, 1.55, 1.5]} rad={0.06} p={[k * 1.6 - 0.8, 1.42, 0]} c={k ? '#C9CED8' : '#B8BFCC'} />)}
        </group>
      ))}
    </group>
  )
}
