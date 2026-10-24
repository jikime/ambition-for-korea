// 화면 언어 전환(EN · KO). 바꾸면 페이지를 다시 연다(src/i18n.ts).
import { L, LANG, setLang, type Lang } from '../i18n'

export function LangSwitch() {
  return (
    <div className="flex h-8 items-center rounded-full bg-line-2 p-0.5" role="group" aria-label={L('화면 언어', 'Display language')} title={L('화면 언어(바꾸면 화면을 다시 엽니다)', 'Display language (switching reloads the page)')}>
      {(['en', 'ko'] as Lang[]).map((l) => (
        <button
          key={l}
          type="button"
          aria-pressed={LANG === l}
          onClick={() => setLang(l)}
          className={`h-7 rounded-full px-2 text-[11px] font-semibold ${LANG === l ? 'bg-white text-ink shadow-sm' : 'text-muted hover:text-ink'}`}
        >
          {l === 'en' ? 'EN' : 'KO'}
        </button>
      ))}
    </div>
  )
}
