# 안전나침판 (Safety Compass)

내 위치 기준으로 재난 상황 판단, 국민행동요령, 안전지도(대피소·병원·약국), 공식 재난알림을 한 화면에서 확인하는 모바일 우선 웹앱입니다. `docs/안전나침판_시스템설계서.md`를 기반으로 구현했습니다.

## 현재 구현 범위

- **DB 없음**: Supabase는 아직 연동하지 않았습니다. 57종 국민행동요령은 정적 JSON(`src/data/disasterGuide.json`)으로 제공하고, 날씨/특보/재난문자/대피소/병원·약국은 요청마다 외부 API를 직접 호출합니다(캐싱 없음).
- **키 없이도 동작**: 기상청 API 허브, 재난안전데이터포털, 카카오맵, bizrouter(LLM) 키가 하나도 없어도 앱은 에러 없이 "설정 필요/정보 없음" 상태로 우아하게 동작합니다. 이후 Vercel 환경변수에 키를 등록하면 코드 변경 없이 실제 데이터로 전환됩니다.
- **관리자 콘솔** (`/admin`): Supabase Auth 대신 `ADMIN_PASSWORD` 환경변수 + 서명 쿠키 기반 간단 로그인. 대시보드, 마스터데이터 뷰어(읽기전용), API 상태 확인, API 수동 테스트 도구 제공.

## 환경변수

`.env.example` 참고. Vercel 프로젝트 설정 → Environment Variables에 아래 키들을 등록하세요.

| 키 | 용도 |
|---|---|
| `KMA_AUTH_KEY` | 기상청 API 허브(단기예보/초단기실황) 인증키 |
| `SAFETYDATA_SERVICE_KEY` | 재난안전데이터포털(재난문자/대피소) 서비스키 |
| `KAKAO_REST_API_KEY` | 카카오 로컬 API(병원·약국 검색, 좌표→행정동) — 서버 전용 |
| `NEXT_PUBLIC_KAKAO_JS_KEY` | 카카오맵 JS SDK(지도 렌더링) — 브라우저 노출 |
| `BIZROUTER_BASE_URL` / `BIZROUTER_API_KEY` | OpenAI 호환 LLM 게이트웨이(2차 판정, 챗봇, 임베딩, STT) |
| `ADMIN_PASSWORD` | 관리자 콘솔 로그인 비밀번호 |
| `ADMIN_SESSION_SECRET` | 관리자 세션 쿠키 서명용 비밀키(운영 배포 시 반드시 변경) |

## 알려진 한계 / 검증 필요 사항

- **지역 코드**: `src/lib/regions.ts`의 `region_code`는 행정안전부 공식 법정동코드가 아닌 앱 내부 슬러그입니다. 전국 시군구는 대표 좌표로 시드했고, 세종시만 읍면동 단위까지 세분화했습니다.
- **기상특보(주의보/경보)**: 참고 문서에 전용 엔드포인트 설명이 없어 `wrn_now_data.php`를 best-effort로 사용했습니다. 실제 키 등록 후 응답 컬럼 순서를 검증/보정하세요 (`src/lib/kma.ts`의 `getWeatherAlerts`).
- **재난문자/대피소(safetydata.go.kr)**: 공개된 표준 REST 패턴으로 구현했으나 실제 필드명은 키 발급 후 검증이 필요합니다 (`src/lib/safetydata.ts`).
- **재난 5단계 판정**: `docs/재난유형별_단계구분_기준.md`에 따르면 재난유형별로 실제 수치 기준이 각각 다릅니다. 현재는 기상특보/재난문자 유형을 5단계로 단순 매핑한 근사치이며(`src/data/levelCriteria.ts`), bizrouter가 설정된 경우 LLM이 규칙기반 판정보다 상향(escalate)만 할 수 있습니다.

## 개발

```bash
npm install
npm run dev
```

## 배포

Vercel에 연결 후 위 환경변수를 등록하면 별도 설정 없이 배포됩니다.
