import { CARRIERS, type CarrierKey, type ItemKey } from '../sim/data'

/** 허브트레이스 심볼(육각 큐브) */
export function LogoMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
      <path d="M16 2 28.1 9v14L16 30 3.9 23V9z" fill="#2F55E6" />
      <path d="M16 2 28.1 9 16 16 3.9 9z" fill="#7290FF" />
      <path d="M16 16v14l12.1-7V9z" fill="#1E3BB3" />
      <path d="M10 12.5 16 16l6-3.5" stroke="#fff" strokeOpacity=".55" strokeWidth="1.2" fill="none" />
    </svg>
  )
}

export function CarrierMark({ carrier, size = 20 }: { carrier: CarrierKey; size?: number }) {
  const c = CARRIERS[carrier]
  if (carrier === 'daon') return <LogoMark size={size} />
  if (carrier === 'baro') {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
        <path d="M4 4h4l6 8-6 8H4l6-8z" fill={c.color} />
        <path d="M11 4h4l6 8-6 8h-4l6-8z" fill={c.dark} />
      </svg>
    )
  }
  if (carrier === 'donghae') {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
        <circle cx="12" cy="12" r="11" fill={c.color} />
        <path d="M5 11c3-3 5 2 8-1s4-1 6 0M5 15c3-3 5 2 8-1s4-1 6 0" stroke="#fff" strokeWidth="1.8" fill="none" strokeLinecap="round" />
      </svg>
    )
  }
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <rect x="1" y="1" width="22" height="22" rx="5" fill={c.color} />
      <path d="M11 5h2l.6 14h-3.2zM6 11.2h12v1.8H6z" fill="#fff" />
    </svg>
  )
}

/** 운영 매니저 아바타 */
export function Avatar({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden>
      <defs>
        <clipPath id="av-clip">
          <circle cx="20" cy="20" r="20" />
        </clipPath>
      </defs>
      <g clipPath="url(#av-clip)">
        <rect width="40" height="40" fill="#DCE5FF" />
        <path d="M6 40c1-8 7-12 14-12s13 4 14 12z" fill="#2F55E6" />
        <path d="M16 28h8l-4 6z" fill="#fff" />
        <rect x="17" y="22" width="6" height="7" rx="2" fill="#E9B894" />
        <ellipse cx="20" cy="17" rx="7.2" ry="8" fill="#F2C7A3" />
        <path d="M12.6 16.5c-.6-6 3.4-9.6 7.6-9.6 4.6 0 8.2 3.2 7.2 9.8-1-3-3.4-4.6-6.6-5-2.6-.4-5.2.8-8.2 4.8z" fill="#2B2F3D" />
        <circle cx="17.2" cy="17.8" r=".9" fill="#2B2F3D" />
        <circle cx="22.8" cy="17.8" r=".9" fill="#2B2F3D" />
        <path d="M18.2 21.4c1.1.8 2.5.8 3.6 0" stroke="#C47F5C" strokeWidth="1" fill="none" strokeLinecap="round" />
      </g>
    </svg>
  )
}

/** 품목 아이콘 */
export function ItemIcon({ item, size = 22 }: { item: ItemKey; size?: number }) {
  const body = (() => {
    switch (item) {
      case 'water':
        return (
          <>
            <rect x="8" y="2" width="6" height="3" rx="1" fill="#2F55E6" />
            <path d="M7 6h8l1.5 3v11a2 2 0 0 1-2 2h-7a2 2 0 0 1-2-2V9z" fill="#9CC0FF" />
            <rect x="5.5" y="12" width="11" height="4" fill="#2F55E6" />
          </>
        )
      case 'rice':
        return (
          <>
            <path d="M5 11a6 6 0 0 1 12 0z" fill="#FFFFFF" stroke="#E0E4EE" />
            <path d="M3 11h16a8 8 0 0 1-16 0z" fill="#3B4461" />
            <rect x="7" y="20" width="8" height="2" rx="1" fill="#3B4461" />
          </>
        )
      case 'ramen':
        return (
          <>
            <rect x="3" y="5" width="16" height="14" rx="3" fill="#F25C3D" />
            <path d="M6 10c2 2 4-2 5 0s4-2 5 0M6 13c2 2 4-2 5 0s4-2 5 0" stroke="#FFE9A8" strokeWidth="1.4" fill="none" />
          </>
        )
      case 'tissue':
        return (
          <>
            <rect x="4" y="6" width="14" height="13" rx="2" fill="#F4F6FB" stroke="#D5DBEA" />
            <circle cx="11" cy="12.5" r="3.5" fill="#C9D6F5" />
            <circle cx="11" cy="12.5" r="1.4" fill="#fff" />
            <rect x="4" y="16" width="14" height="2" fill="#2F55E6" />
          </>
        )
      case 'detergent':
        return (
          <>
            <path d="M8 3h5v3h-5z" fill="#0C7A73" />
            <path d="M6 7h10l1 3v9a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-9z" fill="#13A39A" />
            <path d="M15 8h2.5a1.5 1.5 0 0 1 0 6H16" stroke="#0C7A73" strokeWidth="1.5" fill="none" />
            <rect x="7" y="12" width="7" height="4" rx="1" fill="#fff" />
          </>
        )
      case 'petfood':
        return (
          <>
            <path d="M5 5h12l1 15H4z" fill="#C98A4B" />
            <rect x="5" y="4" width="12" height="2" fill="#A86C33" />
            <circle cx="11" cy="14" r="2" fill="#fff" />
            <circle cx="8.6" cy="11" r="1" fill="#fff" />
            <circle cx="13.4" cy="11" r="1" fill="#fff" />
            <circle cx="11" cy="10" r="1" fill="#fff" />
          </>
        )
      case 'helmet':
        return (
          <>
            <path d="M4 15a7 7 0 0 1 14 0z" fill="#F3B414" />
            <rect x="2" y="15" width="18" height="3" rx="1.5" fill="#E2A50D" />
            <rect x="10" y="6" width="2" height="9" fill="#FFD866" />
          </>
        )
      default:
        return (
          <>
            <path d="M3 8 11 4l8 4v9l-8 4-8-4z" fill="#D9A86A" />
            <path d="M3 8l8 4 8-4M11 12v9" stroke="#B9844A" strokeWidth="1.2" fill="none" />
            <path d="m7 6 8 4" stroke="#F3D9B4" strokeWidth="1.6" />
          </>
        )
    }
  })()
  return (
    <svg width={size} height={size} viewBox="0 0 22 24" aria-hidden>
      {body}
    </svg>
  )
}

/** 정보 패널 머리의 대상 그림 */
export type GlyphKind = 'site' | 'wing' | 'box' | 'van' | 'forklift' | 'pallet' | 'charger' | 'dock' | 'sorter' | 'reefer' | 'trailer' | 'crane' | 'story' | 'locker'

export function Glyph({ kind, color = '#2F55E6', size = 40 }: { kind: GlyphKind; color?: string; size?: number }) {
  const g = (() => {
    switch (kind) {
      case 'site':
        return (
          <>
            <path d="M4 18 20 9l16 9v14H4z" fill="#DCE5FF" />
            <path d="M4 18 20 9l16 9-16 2z" fill={color} />
            <rect x="9" y="22" width="6" height="10" fill="#7A8FD8" />
            <rect x="17" y="22" width="6" height="10" fill="#7A8FD8" />
            <rect x="25" y="22" width="6" height="10" fill="#7A8FD8" />
          </>
        )
      case 'reefer':
        return (
          <>
            <rect x="3" y="12" width="23" height="15" rx="1.5" fill="#F4F6FB" stroke="#CBD3E6" />
            <rect x="3" y="22" width="23" height="5" fill={color} />
            <rect x="20" y="8" width="7" height="4" rx="1" fill="#CBD3E6" />
            <path d="M12 15v6M9.4 16.5l5.2 3M14.6 16.5l-5.2 3" stroke={color} strokeWidth="1.4" />
            <path d="M27 16h6l4 5v6H27z" fill="#F8F9FC" stroke="#CBD3E6" />
            <circle cx="10" cy="29" r="3" fill="#2A2E39" />
            <circle cx="31" cy="29" r="3" fill="#2A2E39" />
          </>
        )
      case 'trailer':
        return (
          <>
            <rect x="2" y="11" width="25" height="13" fill="#1F9C9A" />
            {[6, 10, 14, 18, 22].map((x) => <rect key={x} x={x} y="11" width="1.2" height="13" fill="#167B79" />)}
            <rect x="2" y="24" width="25" height="2" fill="#3A4152" />
            <path d="M28 14h5l4 5v7h-9z" fill="#F8F9FC" stroke="#CBD3E6" />
            <rect x="29.5" y="15.5" width="3" height="3" fill="#2B3654" />
            <circle cx="7" cy="28" r="2.6" fill="#2A2E39" />
            <circle cx="13" cy="28" r="2.6" fill="#2A2E39" />
            <circle cx="33" cy="28" r="2.6" fill="#2A2E39" />
          </>
        )
      case 'crane':
        return (
          <>
            <rect x="9" y="12" width="2.4" height="22" fill={color} />
            <rect x="21" y="12" width="2.4" height="22" fill={color} />
            <rect x="4" y="9" width="32" height="3.4" fill="#F4F6FB" stroke="#CBD3E6" />
            <rect x="24" y="13" width="2" height="7" fill="#3A4152" />
            <rect x="20" y="20" width="12" height="5" fill="#E07A35" />
            <rect x="2" y="34" width="36" height="2" fill="#9DB8EE" />
          </>
        )
      case 'story':
        return (
          <>
            <path d="M7 15 20 8l13 7v13l-13 7-13-7z" fill="#F3C08C" />
            <path d="M7 15l13 7 13-7M20 22v13" stroke="#C47F3C" strokeWidth="1.4" fill="none" />
            <path d="m13 11.5 13 7" stroke="#FFE3C4" strokeWidth="2" />
            <circle cx="31" cy="10" r="5" fill={color} />
            <circle cx="31" cy="10" r="2" fill="#fff" />
          </>
        )
      case 'locker':
        return (
          <>
            <rect x="6" y="7" width="28" height="26" rx="2" fill={color} />
            {[0, 1, 2].flatMap((c) => [0, 1, 2].map((r) => <rect key={`${c}${r}`} x={9 + c * 8.4} y={10 + r * 7.4} width="7" height="6" rx="1" fill={c === 1 && r === 0 ? '#16203A' : '#E6ECFF'} />))}
          </>
        )
      case 'wing':
      case 'box':
        return (
          <>
            <rect x="3" y="12" width="23" height="15" rx="1.5" fill="#F4F6FB" stroke="#CBD3E6" />
            <rect x="3" y="22" width="23" height="5" fill={color} />
            <path d="M27 16h6l4 5v6H27z" fill="#F8F9FC" stroke="#CBD3E6" />
            <path d="M29 17.5h3.5l2.5 3.5H29z" fill="#2B3654" />
            {kind === 'wing' && <path d="M3 12 14 6l12 6" stroke={color} strokeWidth="1.6" fill="none" />}
            <circle cx="10" cy="29" r="3" fill="#2A2E39" />
            <circle cx="31" cy="29" r="3" fill="#2A2E39" />
          </>
        )
      case 'van':
        return (
          <>
            <rect x="5" y="11" width="19" height="15" rx="1.5" fill="#F4F6FB" stroke="#CBD3E6" />
            <rect x="5" y="20" width="19" height="6" fill={color} />
            <path d="M25 15h5l4 5v6h-9z" fill="#F8F9FC" stroke="#CBD3E6" />
            <path d="M26.5 16.5h3l2.6 3.5h-5.6z" fill="#2B3654" />
            <circle cx="11" cy="28" r="3" fill="#2A2E39" />
            <circle cx="29" cy="28" r="3" fill="#2A2E39" />
          </>
        )
      case 'forklift':
        return (
          <>
            <path d="M8 18h14v9H8z" fill="#F3B414" />
            <rect x="6" y="20" width="4" height="8" rx="1" fill="#3D4454" />
            <path d="M12 9h9v9" stroke="#262B36" strokeWidth="2" fill="none" />
            <rect x="25" y="7" width="2.4" height="22" fill="#353B48" />
            <rect x="27" y="25" width="9" height="2" fill="#4A5162" />
            <circle cx="11" cy="29" r="3" fill="#2A2E39" />
            <circle cx="21" cy="29" r="3" fill="#2A2E39" />
          </>
        )
      case 'pallet':
        return (
          <>
            <rect x="8" y="9" width="24" height="17" rx="1" fill="#D6A76C" />
            <path d="M20 9v17M8 17.5h24" stroke="#B9844A" strokeWidth="1.2" />
            <rect x="6" y="27" width="28" height="3" fill="#C99D6B" />
            <rect x="8" y="30" width="5" height="3" fill="#8A6844" />
            <rect x="17.5" y="30" width="5" height="3" fill="#8A6844" />
            <rect x="27" y="30" width="5" height="3" fill="#8A6844" />
          </>
        )
      case 'charger':
        return (
          <>
            <rect x="11" y="6" width="16" height="27" rx="3" fill="#F4F6FB" stroke="#CBD3E6" />
            <rect x="11" y="6" width="16" height="5" rx="2" fill={color} />
            <path d="m20 14-4 7h4l-2 6 6-9h-4l2-4z" fill="#35B56A" />
          </>
        )
      case 'dock':
        return (
          <>
            <rect x="5" y="7" width="30" height="26" rx="2" fill="#DCE5FF" />
            <rect x="10" y="12" width="20" height="21" fill="#2A2F3B" />
            {[14, 18, 22, 26].map((y) => <rect key={y} x="10" y={y} width="20" height="1.4" fill="#5A6274" />)}
            <rect x="10" y="10" width="20" height="2" fill={color} />
          </>
        )
      default:
        return (
          <>
            <rect x="3" y="19" width="34" height="5" rx="1" fill="#3B4252" />
            {[7, 13, 19, 25, 31].map((x) => <rect key={x} x={x} y="13" width="5" height="5" rx="1" fill="#D6A76C" />)}
            <rect x="5" y="24" width="2" height="8" fill="#8C96AA" />
            <rect x="33" y="24" width="2" height="8" fill="#8C96AA" />
            <rect x="15" y="6" width="10" height="3" rx="1" fill={color} />
          </>
        )
    }
  })()
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden>
      {g}
    </svg>
  )
}
