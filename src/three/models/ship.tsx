// 컨테이너선(선미 거주구형). 위에서 본 선체 윤곽을 뽑아 유선형 뱃머리를 만들고,
// 흘수선 띠·갑판·선수루·래싱 브리지·거주구·연돌·계류줄을 붙인다. 원점 = 선체 중심, 뱃머리 = -x
import { useMemo } from 'react'
import * as THREE from 'three'
import { B, Cyl, cylGeo, mat } from '../kit'
import { FONT, canvasTex } from '../textures'
import { Decal } from './structures'
import { lampMaterial, windowMaterial } from '../env/state'

function hullShape(len: number, beam: number, inset = 0) {
  const L = len / 2
  const b = beam / 2 - inset
  const s = new THREE.Shape()
  s.moveTo(L - inset, b)
  s.lineTo(-L + 34, b)
  // 뱃머리: 넓은 어깨에서 뾰족한 선수로
  s.bezierCurveTo(-L + 12, b, -L - 6 + inset, b * 0.45, -L - 12 + inset * 2, 0)
  s.bezierCurveTo(-L - 6 + inset, -b * 0.45, -L + 12, -b, -L + 34, -b)
  s.lineTo(L - inset, -b)
  // 선미: 살짝 둥근 트랜섬
  s.quadraticCurveTo(L + 3 - inset, 0, L - inset, b)
  return s
}

/** 선수루: 뱃머리 곡선 부분만 */
function foreShape(len: number, beam: number) {
  const L = len / 2
  const b = beam / 2
  const s = new THREE.Shape()
  s.moveTo(-L + 30, b)
  s.lineTo(-L + 34, b)
  s.bezierCurveTo(-L + 12, b, -L - 6, b * 0.45, -L - 12, 0)
  s.bezierCurveTo(-L - 6, -b * 0.45, -L + 12, -b, -L + 34, -b)
  s.lineTo(-L + 30, -b)
  s.closePath()
  return s
}

function hullGeo(len: number, beam: number, h: number, inset = 0) {
  const g = new THREE.ExtrudeGeometry(hullShape(len, beam, inset), { depth: h, bevelEnabled: false, curveSegments: 18 })
  g.rotateX(-Math.PI / 2)
  return g
}

function nameTex(text: string, sub: string) {
  return canvasTex(`ship-name-${text}`, 1024, 160, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h)
    ctx.fillStyle = '#FFFFFF'
    ctx.font = `900 96px ${FONT}`
    ctx.textBaseline = 'middle'
    ctx.fillText(text, 10, h * 0.42)
    ctx.font = `700 40px ${FONT}`
    ctx.fillText(sub, 14, h * 0.86)
  })
}

function funnelTex() {
  return canvasTex('ship-funnel', 256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#1E3BB3'
    ctx.fillRect(0, 0, w, h)
    ctx.fillStyle = '#FFFFFF'
    ctx.fillRect(0, h * 0.32, w, h * 0.3)
    ctx.fillStyle = '#2F55E6'
    ctx.beginPath()
    ctx.arc(w / 2, h * 0.47, h * 0.11, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#1A1F2B'
    ctx.fillRect(0, 0, w, h * 0.1)
  })
}

export function ContainerShip({ len = 162, beam = 30, deckY = 4, bays = [] as number[], name = 'DAON OCEAN', hull: hullColor = '#1F2D4A' }: { len?: number; beam?: number; deckY?: number; bays?: number[]; name?: string; /** 선체 색 */ hull?: string }) {
  const m = useMemo(() => {
    const hull = mat(hullColor, { rough: 0.55 })
    hull.userData.snow = 0.2
    const deck = mat('#5D6B66', { rough: 0.8 })
    deck.userData.snow = 0.5
    return { hull, deck, red: mat('#B8443F', { rough: 0.6 }), white: mat('#F2F4F8', { rough: 0.55 }) }
  }, [hullColor])
  const geo = useMemo(() => ({
    hull: hullGeo(len, beam, deckY + 0.4),
    boot: hullGeo(len + 0.3, beam + 0.3, 1.4),
    deck: new THREE.ShapeGeometry(hullShape(len, beam, 0.8), 18).rotateX(-Math.PI / 2),
    fore: new THREE.ExtrudeGeometry(foreShape(len, beam), { depth: 2.6, bevelEnabled: false, curveSegments: 18 }).rotateX(-Math.PI / 2),
  }), [len, beam, deckY])
  const name1 = useMemo(() => nameTex(name, 'BUSAN · IMO 9876543'), [name])
  const funnel = useMemo(() => new THREE.MeshStandardMaterial({ map: funnelTex(), roughness: 0.5 }), [])
  const bridgeWin = useMemo(() => windowMaterial(new THREE.MeshStandardMaterial({ color: '#2B3654', roughness: 0.15, metalness: 0.3 }), 'office'), [])
  const L = len / 2
  const dhX = L - 16
  // 래싱 브리지: 베이 사이 철골 통로
  const lash = bays.slice(0, -1).map((x, i) => (x + bays[i + 1]) / 2)
  return (
    <group>
      <mesh geometry={geo.hull} position={[0, -0.4, 0]} material={m.hull} castShadow receiveShadow />
      <mesh geometry={geo.boot} position={[0, -0.6, 0]} material={m.red} />
      <mesh geometry={geo.deck} position={[0, deckY + 0.015, 0]} material={m.deck} receiveShadow />
      {/* 선수루(뱃머리 높은 갑판) */}
      <mesh geometry={geo.fore} position={[0, deckY - 0.2, 0]} material={m.hull} castShadow />
      <B s={[6, 0.6, 3]} p={[-L + 6, deckY + 2.5, 0]} c="#5A6274" />
      {/* 뱃머리 이름 · 선미 선적항 */}
      {[1, -1].map((s) => (
        <Decal key={s} tex={name1} w={22} h={3.4} p={[-L + 50, deckY - 1.4, s * (beam / 2 + 0.05)]} r={[0, s > 0 ? 0 : Math.PI, 0]} />
      ))}
      {/* 흘수 표시(선수) */}
      {[0.6, 1.6, 2.6].map((y) => <B key={y} s={[0.8, 0.12, 0.04]} p={[-L - 4, y, beam / 2 - 3.6]} c="#FFFFFF" cast={false} />)}
      {/* 해치 커버 */}
      {bays.map((x) => <B key={x} s={[11.6, 0.3, beam - 3]} p={[x, deckY - 0.12, 0]} c="#3E4A47" cast={false} />)}
      {/* 래싱 브리지 */}
      {lash.map((x) => (
        <group key={x} position={[x, deckY, 0]}>
          {[-beam / 2 + 2, -beam / 6, beam / 6, beam / 2 - 2].map((z) => <B key={z} s={[0.25, 2.8, 0.25]} p={[0, 1.4, z]} c="#C9CED8" />)}
          <B s={[0.9, 0.12, beam - 3]} p={[0, 2.8, 0]} c="#C9CED8" />
          <B s={[0.08, 0.08, beam - 3]} p={[0.4, 3.6, 0]} c="#E3B341" cast={false} />
        </group>
      ))}
      {/* 난간 */}
      {[1, -1].map((s) => <B key={s} s={[len - 40, 0.06, 0.06]} p={[0, deckY + 1.1, s * (beam / 2 - 0.4)]} c="#C9CED8" cast={false} />)}
      {/* 선미 거주구 + 선교(양쪽 윙) */}
      <group position={[dhX, deckY, 0]}>
        <B s={[12, 13, beam - 6]} p={[0, 6.5, 0]} m={m.white} />
        {[2.6, 5.2, 7.8, 10.4].map((y) => (
          <mesh key={y} position={[-6.03, y, 0]} rotation={[0, -Math.PI / 2, 0]} material={bridgeWin}>
            <planeGeometry args={[beam - 8, 1.1]} />
          </mesh>
        ))}
        {/* 옆면 · 뒷면 창 */}
        {[2.6, 5.2, 7.8, 10.4].flatMap((y) => [
          ...[1, -1].map((sd) => (
            <mesh key={`${y}${sd}`} position={[0, y, sd * ((beam - 6) / 2 + 0.03)]} rotation={[0, sd > 0 ? 0 : Math.PI, 0]} material={bridgeWin}>
              <planeGeometry args={[9, 0.9]} />
            </mesh>
          )),
          <mesh key={`${y}a`} position={[6.03, y, 0]} rotation={[0, Math.PI / 2, 0]} material={bridgeWin}>
            <planeGeometry args={[beam - 10, 0.9]} />
          </mesh>,
        ])}
        <B s={[11, 3, beam + 4]} p={[-0.5, 14.5, 0]} m={m.white} />
        <mesh position={[-6.05, 14.6, 0]} rotation={[0, -Math.PI / 2, 0]} material={bridgeWin}>
          <planeGeometry args={[beam + 3.6, 1.6]} />
        </mesh>
        <B s={[11.2, 0.3, beam + 4.2]} p={[-0.5, 16.1, 0]} c="#C9CED8" />
        {/* 마스트 · 레이더 */}
        <Cyl rt={0.18} h={7} p={[0, 19.6, 0]} c="#E3E7F0" />
        <B s={[0.2, 0.2, 4]} p={[0, 21.6, 0]} c="#E3E7F0" />
        <B s={[0.6, 0.15, 2.6]} p={[0.4, 18.6, 3]} c="#2D3445" />
        <mesh geometry={cylGeo(0.5, 0.5, 0.4, 12)} position={[0, 23.2, 0]} material={mat('#F4F6FB')} />
        <mesh geometry={cylGeo(0.12, 0.12, 0.3, 8)} position={[0, 23.6, 0]} material={lampMaterial(mat('#FFFFFF', { emissive: '#FFFFFF', emissiveIntensity: 1 }))} />
        {/* 연돌 */}
        <mesh geometry={cylGeo(2.2, 2.6, 8, 4)} rotation={[0, Math.PI / 4, 0]} position={[6.5, 16, 0]} scale={[1, 1, 1.4]} material={funnel} castShadow />
        <B s={[3.6, 0.5, 4.6]} p={[6.5, 20.2, 0]} c="#1A1F2B" />
        {/* 구명정 */}
        {[1, -1].map((s) => <B key={s} s={[6, 1.6, 2]} p={[2, 4.2, s * (beam / 2 - 1.5)]} c="#FF7A1F" />)}
      </group>
      {/* 항해등: 좌현(빨강, +z 쪽이 아님에 주의: 뱃머리 -x 기준 좌현은 +z) */}
      <mesh geometry={cylGeo(0.2, 0.2, 0.3, 8)} position={[dhX - 6, deckY + 15.4, beam / 2 + 2]} material={lampMaterial(mat('#FF3B30', { emissive: '#FF3B30', emissiveIntensity: 1.2 }))} />
      <mesh geometry={cylGeo(0.2, 0.2, 0.3, 8)} position={[dhX - 6, deckY + 15.4, -beam / 2 - 2]} material={lampMaterial(mat('#2BD96B', { emissive: '#2BD96B', emissiveIntensity: 1.2 }))} />
      {/* 방현재(펜더) · 계류줄: 안벽(-z 쪽)에 붙어 있다 */}
      {[-L + 30, -L + 70, L - 70, L - 30].map((x) => (
        <mesh key={x} geometry={cylGeo(1.1, 1.1, 2.6, 12)} rotation={[Math.PI / 2, 0, 0]} position={[x, 0.9, -beam / 2 - 0.9]} material={mat('#23262E')} />
      ))}
      {[[-L + 8, -16], [-L + 18, -6], [L - 18, 6], [L - 8, 16]].map(([x, dx], i) => {
        const from = new THREE.Vector3(x, deckY + 0.6, -beam / 2 + 0.3)
        const to = new THREE.Vector3(x + dx, 0.9, -beam / 2 - 3.5)
        const mid = from.clone().add(to).multiplyScalar(0.5)
        const lenL = from.distanceTo(to)
        const dir = to.clone().sub(from).normalize()
        const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir)
        return (
          <group key={i}>
            <mesh geometry={cylGeo(0.08, 0.08, 1, 6)} position={mid} quaternion={q} scale={[1, lenL, 1]} material={mat('#E8D9A8')} />
            <Cyl rt={0.35} h={0.9} p={[to.x, 0.45, to.z]} c="#2D3445" />
          </group>
        )
      })}
    </group>
  )
}
