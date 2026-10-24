// 화면 언어(영어 기본 · 한국어 전환). 문구는 쓰는 자리에서 L('한국어', 'English')로 둘 다 적는다.
// 언어는 페이지를 열 때 한 번 정해지고, 바꾸면 페이지를 다시 연다. 고른 언어는 그 탭에서만 유지되고(sessionStorage 'hubtrace.lang'),
// 앱을 새로 열면 늘 영어로 시작한다.
// 시뮬레이션 데이터(고객 메모·현장 보고 등)도 같은 순서·같은 개수의 두 목록을 LL(한국어, 영어)로 골라
// 난수 사용 순서가 언어와 무관하게 같다. Node(헤드리스 점검·실험)는 HUBTRACE_LANG(기본 ko)을 따른다.
export type Lang = 'en' | 'ko'

const KEY = 'hubtrace.lang'
/** 예전 판에서 브라우저에 오래 남기던 언어 값(지금은 지운다) */
const OLD_KEYS = ['hubtrace.lang', 'nuritrack.lang']

/** 브라우저·Node 어디서나 타입 검사가 되도록 globalThis로 읽는다 */
type WebStorage = { getItem(k: string): string | null; setItem(k: string, v: string): void; removeItem(k: string): void }
type Host = { localStorage?: WebStorage; sessionStorage?: WebStorage; location?: { reload(): void }; process?: { env?: Record<string, string | undefined> } }
const host = globalThis as unknown as Host

function readLang(): Lang {
  try {
    if (host.sessionStorage) {
      for (const k of OLD_KEYS) host.localStorage?.removeItem(k)
      return host.sessionStorage.getItem(KEY) === 'ko' ? 'ko' : 'en'
    }
  } catch {
    return 'en'
  }
  // Node: 브라우저 타입만 쓰는 설정이라 globalThis로 읽는다
  const env = host.process?.env?.HUBTRACE_LANG
  return env === 'en' ? 'en' : 'ko'
}

/** 이번 페이지의 언어(바뀌지 않음) */
export const LANG: Lang = readLang()
export const isEn = LANG === 'en'

/** 문구: 한국어와 영어를 함께 적고 지금 언어 쪽을 쓴다 */
export const L = (ko: string, en: string) => (isEn ? en : ko)

/** 값(목록·객체): 두 언어판 가운데 지금 언어 쪽. 데이터 목록은 길이·순서를 맞춘다 */
export function LL<T>(ko: T, en: T): T {
  return isEn ? en : ko
}

/** 언어 바꾸기: 이 탭에 저장하고 페이지를 다시 연다(3D 간판·시뮬레이션 데이터까지 새 언어로) */
export function setLang(l: Lang) {
  if (l === LANG) return
  try {
    host.sessionStorage?.setItem(KEY, l)
  } catch {
    // 저장할 수 없으면 이번만 바꿀 방법이 없다
  }
  host.location?.reload()
}

/** 영어 복수형(1이면 단수) */
export const plural = (n: number, one: string, many = `${one}s`) => (n === 1 ? one : many)
