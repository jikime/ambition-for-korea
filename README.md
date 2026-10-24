# 허브트레이스 (HubTrace)

한국 택배·물류 다거점 네트워크를 3D로 보여 주는 관제 대시보드입니다. 가상의 물류 회사 "누리로지스"의 이천 풀필먼트센터, 곤지암 메가허브, 대전 중부허브, 인천 서브터미널, 누리마을 배송구역, 부산신항, 인천공항 화물터미널을 간선도로로 잇고, 차량·지게차·크레인·분류기·화물기가 실제처럼 움직입니다. 화물차는 2시간 연속 운전하면 간선의 누리휴게소에 들러 쉬었다가 다시 출발합니다. 거리에는 주민과 작업자, 배달 오토바이·배송 로봇·드론이 오가고, 계절·시간대·날씨는 이 컴퓨터의 날짜와 현재 시각(상단 LIVE)에 따라 자동으로 바뀝니다(직접 고를 수도 있음). 택배 상자·수입 컨테이너·항공 수출 화물·반품 상자가 트럭·배·비행기로 옮겨지는 과정을 단계별로 따라갈 수 있습니다. 상단 시계 아이콘을 누르면 아래에 **재생 막대**가 열려 지난 60분을 끌어서 되감고 다시 재생할 수 있습니다("20분 전 부산 게이트 막혔을 때로 돌려 줘"처럼 말로도 됩니다). 왼쪽 **현장 흐름** 패널은 거점의 작업 단계(정문 → 하차 → 검수 → 적치 → 출고)를 실시간 수치로 보여 주고, **투어 재생**을 누르면 단계를 차례로 돌며 카메라가 따라갑니다. 다가가면 지붕과 앞벽이 녹아 창고 안(고층 랙·리치트럭·검수·분류기)이 보이고, 밤에는 화면 패널도 어두워집니다. 상단 **운영 센터**에서 관제 브리핑(간선 도착 약속·위험 원인·승인 대기), 고객 문의("내 택배 어디쯤?"), 반품 회수, 새벽배송 콜드체인 온도, 통관 HS 분류, 주소 정정, 명절 물량 시나리오, 배송 경로 최적화, 탄소 배출, 화물차 운전 시간을 봅니다. 사람이 쓴 문장(관제 명령, 배송 메모, 현장 보고, 송장, 적하목록, 교통 정보, 항공 수출 신고, 고객 문의, 반품 사유, 냉동탑차 기사 메시지, 수입 신고 품명, 흐트러진 주소, 물량 공지, 입고 검수 메모, 기사 메시지, 선사 지연 통보)은 Claude API(Claude Opus 5.5)가 읽고(기본 꺼짐, 상단 AI 스위치로 켬), 결과를 쓰는 정책은 코드가 정합니다.

- React 19 · React Three Fiber · three.js · zustand · Tailwind CSS · Vite
- 3D 모델과 텍스처는 모두 코드로 직접 만들었습니다(`?view=assets`에서 모아 보기).
- 브랜드, 사람, 주소, 화물 정보는 모두 가상입니다.

## 실행

```bash
npm install
npm run dev        # http://localhost:5188
```

화면은 **영어가 기본**이고, 상단 **EN · KO** 버튼으로 한국어로 바꿉니다(3D 간판·시뮬레이션 데이터까지, [docs/i18n.md](docs/i18n.md)).

AI는 서버에 키가 있으면 **기본으로 켜집니다**. 상단 ✦ AI 스위치로 끌 수 있습니다.

- 키: 프로젝트 루트의 `.env`에 `ANTHROPIC_API_KEY=sk-ant-…`를 넣습니다(`.env.example` 참고, `.env`는 git에 올리지 않음). 서버만 이 키를 읽고 브라우저로는 보내지 않습니다. 배포할 때는 플랫폼 환경 변수로 넣습니다.
- 꺼져 있으면(또는 키가 없으면) 모든 판단을 기본 규칙으로 처리합니다.
- 서버를 외부에 공개하면 누구나 이 키로 AI를 부를 수 있으니, 접근 제한이나 사용량 한도를 함께 두세요.

| 명령 | 설명 |
|---|---|
| `npm run build` | 타입 검사 후 빌드 |
| `npm run preview` | 빌드 결과 미리보기(http://localhost:5189) |
| `npm run simcheck` | 화면 없이 20분 분량 시뮬레이션 점검 |
| `npm run ailab` / `ailab2` / `ailab3` / `ailab4` | AI 정확도·지연·비용 실험(`.env`의 키로 실제 Claude API 호출·비용 발생, lab4는 운영 센터 질문) |
| `npm run ops` | 운영 센터 기능 헤드리스 점검(문의·반품·콜드체인·통관·주소·경로·탄소·대전 허브) |
| `npm run rest` | 휴게소·기사 교대·연속 운전 점검 |
| `npm run promise` | 간선 도착 약속 점검(정시·위험·지연 비율과 원인, 헤드리스 1시간) |
| `npm run overlap -- on\|off [스텝]` | 충돌 회피 켬/끔 비교(겹친 차량 쌍·처리량·비용) |
| `npm run journeys` | 해상·항공 여정 단계 점검(헤드리스) |

## 문서

- [docs/overview.md](docs/overview.md) — 개요, 거점, 택배 여정, 화면 기능
- [docs/architecture.md](docs/architecture.md) — 구조와 렌더링
- [docs/sites.md](docs/sites.md) — 거점별 현장과 구현
- [docs/environment.md](docs/environment.md) — 계절·날씨, 도로변, 거리의 사람들과 배송 수단
- [docs/journeys.md](docs/journeys.md) — 여정 따라가기(육로·해상·항공)와 단계별로 일어나는 일
- [docs/operations.md](docs/operations.md) — 운영 센터 아홉 탭: 고객 문의·반품·콜드체인·통관·주소 정정·명절 시나리오·경로 최적화·탄소·운전 시간
- [docs/rest-areas.md](docs/rest-areas.md) — 고속도로 휴게소와 화물차 운전 시간(2시간/15분)
- [docs/video-analysis.md](docs/video-analysis.md) — 참고 영상(WareTrack 새 버전) 분석, 적용할 항목 23개와 적용 결과
- [docs/route-video-analysis.md](docs/route-video-analysis.md) — 트럭 경로 관리 영상 분석과 적용 결과(도착 약속·승인·기사 메시지)
- [docs/video3-analysis.md](docs/video3-analysis.md) — 항만 관제 영상 분석(장면 밀도·바다·이름표)
- [docs/collision.md](docs/collision.md) — 충돌 회피(왜 코드로 푸는지, 규칙, 교착 처리, 측정값)
- [docs/flicker.md](docs/flicker.md) — 유리·바다·활주로 깜빡임 원인과 개선, 성능 점검
- [docs/ai.md](docs/ai.md) — AI를 어디에, 어떻게 쓰는지
- [docs/ai-analysis.md](docs/ai-analysis.md) — AI 적용 지점 분석과 출처
- [docs/testing.md](docs/testing.md) — 검증 방법과 결과
- [docs/changelog.md](docs/changelog.md) — 작업 이력
- [promo/README.md](promo/README.md) — X 홍보 영상(5분 본편·2분 11초 줄임본) 만드는 방법
