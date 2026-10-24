// 상단 바 글자 라벨(회사 태그 · 프로필 이름 · 물류관리원 · 계절/시간)이 보이는 화면 폭. 영어 라벨이 길어 더 넓을 때부터 보인다.
// Tailwind가 소스에서 찾을 수 있게 클래스 이름을 통째로 적는다.
import { isEn } from '../i18n'

export const LABELS_INLINE = isEn ? 'min-[2000px]:inline' : 'min-[1780px]:inline'
export const LABELS_BLOCK = isEn ? 'min-[2000px]:block' : 'min-[1780px]:block'
export const LABELS_PR = isEn ? 'min-[2000px]:pr-2.5' : 'min-[1780px]:pr-2.5'
