// 인천공항 화물터미널 정적 장면(활주로·유도로·주기장·터미널·관제탑·격납고·소방대·육측 도로·주차장)
import { useMemo } from 'react'
import { Flat, mat, COLORS } from '../kit'
import { Merge } from '../merge'
import { AirfieldLights, CargoTerminal, ControlTowerAP, FireStation, Hangar, RadarTower, Runway, TaxiwaysApron, UldYard, Windsock } from '../models/airport'
import { LightTower } from '../models/sites'
import { CarModel } from '../models/vehicles'
import { Fence } from './Vegetation'
import { GlowPools, StreetLamps, type LampSpec } from './Roadside'
import { AP } from '../../sim/airport'
import { GATES } from '../../sim/world'

const CAR_COLORS = ['#F4F6FA', '#2D3445', '#B8C2D6', '#E45B4B', '#5D79E8', '#F4F6FA', '#8A94A8']

export function AirportStatic() {
  const g = GATES.AP
  const road = useMemo(() => {
    const m = mat(COLORS.road, { rough: 0.95 })
    m.userData.snow = 0.35
    return m
  }, [])
  const lamps = useMemo<LampSpec[]>(() => {
    const out: LampSpec[] = []
    for (let x = -1000; x < -700; x += 30) out.push([x, AP.landOut + 4.6, Math.PI])
    for (let z = -2; z < 30; z += 28) out.push([g.x + 5.6, z, -Math.PI / 2])
    return out
  }, [g.x])
  const cars = useMemo(() => {
    const out: { x: number; z: number; c: string; r: number }[] = []
    for (let i = 0; i < 16; i++) out.push({ x: -995 + i * 3.2, z: 6, c: CAR_COLORS[i % CAR_COLORS.length], r: Math.PI })
    for (let i = 0; i < 12; i++) if (i % 4 !== 2) out.push({ x: -995 + i * 3.2, z: 14, c: CAR_COLORS[(i + 3) % CAR_COLORS.length], r: 0 })
    return out
  }, [])
  const { x0, x1, z0 } = AP.site
  return (
    <group>
      <Merge>
        {/* 공항 부지(잔디) */}
        <Flat s={[x1 - x0, AP.terminal.z0 - z0 - 4]} p={[(x0 + x1) / 2, (z0 + AP.terminal.z0 - 4) / 2]} c="#D6E3CF" y={0.005} />
        <Runway />
        <TaxiwaysApron />
        <CargoTerminal />
        <group position={[AP.tower.x, 0, AP.tower.z]}>
          <ControlTowerAP />
        </group>
        <group position={[-735, 0, -140]}>
          <Hangar />
        </group>
        <group position={[-1066, 0, -150]}>
          <FireStation />
        </group>
        <group position={[-1160, 0, -60]}>
          <RadarTower />
        </group>
        <group position={[-1140, 0, -305]}>
          <Windsock />
        </group>
        <group position={[-1006, 0, -97]}>
          <UldYard />
        </group>
        {[[-1012, -92], [-900, -92], [-776, -92]].map(([x, z], i) => (
          <group key={i} position={[x, 0, z]}>
            <LightTower h={30} />
          </group>
        ))}
        {/* 육측 도로: 정문 → 북쪽 → 서쪽(터미널 도크 앞) */}
        <Flat s={[7, 34 - AP.landIn + 4]} p={[g.x, (34 + AP.landIn - 4) / 2]} m={road} y={0.016} />
        <Flat s={[g.x - AP.terminal.x0 + 12, 12]} p={[(g.x + AP.terminal.x0 - 12) / 2 + 3.5, (AP.landIn + AP.landOut) / 2]} m={road} y={0.016} />
        <Flat s={[g.x - AP.terminal.x0, 0.16]} p={[(g.x + AP.terminal.x0) / 2, (AP.landIn + AP.landOut) / 2]} c={COLORS.yellow} y={0.03} />
        {/* 주차장 */}
        <Flat s={[56, 18]} p={[-972, 10]} c="#DCE1EA" y={0.014} />
        {Array.from({ length: 17 }, (_, i) => <Flat key={i} s={[0.12, 4.6]} p={[-996.6 + i * 3.2, 6]} c="#FFFFFF" y={0.03} />)}
        {Array.from({ length: 13 }, (_, i) => <Flat key={`b${i}`} s={[0.12, 4.6]} p={[-996.6 + i * 3.2, 14]} c="#FFFFFF" y={0.03} />)}
        {cars.map((c, i) => (
          <group key={i} position={[c.x, 0, c.z]} rotation={[0, c.r, 0]}>
            <CarModel color={c.c} kind={i % 3 === 0 ? 'suv' : 'sedan'} />
          </group>
        ))}
        <Fence x0={x0} x1={x1} z0={z0} z1={AP.terminal.z1 - 2} open={["S"]} />
      </Merge>
      <AirfieldLights />
      <StreetLamps spots={lamps} />
      <GlowPools spots={[[-1012, -112, 60], [-900, -112, 60], [-776, -112, 60]]} />
    </group>
  )
}
