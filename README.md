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
| `KMA_AUTH_KEY` | 기상청 API허브 동네예보 인증키. APIHub 요청의 `authKey`에만 사용하며 서버 비밀값으로 보관 |
| `KMA_SERVICE_KEY` | 공공데이터포털 동네예보 서비스키. data.go.kr 요청의 `serviceKey`에만 사용하는 선택 fallback 서버 비밀값 |
| `SAFETYDATA_SERVICE10748_KEY` | 재난안전데이터포털 재난문자(속보) DSSP-IF-10748 서비스키 |
| `SAFETYDATA_SERVICE00247_KEY` | 재난안전데이터포털 긴급재난문자 DSSP-IF-00247 서비스키 |
| `SAFETYDATA_SERVICE_KEY` | 재난안전데이터포털 공용 키(대피소 등) — 위 두 키가 없을 때 폴백으로도 사용 |
| `KAKAO_REST_API_KEY` | 카카오 로컬 API(병원·약국 검색, 좌표→행정동) — 서버 전용 |
| `NEXT_PUBLIC_KAKAO_JS_KEY` | 카카오맵 JavaScript 키. 브라우저에 공개되는 값이며 카카오 콘솔의 허용 도메인으로 통제 |
| `BIZROUTER_BASE_URL` / `BIZROUTER_API_KEY` | OpenAI 호환 LLM 게이트웨이(2차 판정, 챗봇, 임베딩, STT) |
| `ADMIN_PASSWORD` | 관리자 콘솔 로그인 비밀번호. 미설정 시 관리자 인증 비활성화 |
| `ADMIN_SESSION_SECRET` | 관리자 세션 쿠키 서명용 비밀키. 두 관리자 변수가 모두 있어야 콘솔 활성화 |

`KMA_AUTH_KEY`와 `KMA_SERVICE_KEY`는 서로 다른 발급처와 요청 파라미터를 사용하는 별도 키입니다. 한 키를 두 변수에 복사하지 마세요. API허브를 우선 사용하고, 별도로 설정된 `KMA_SERVICE_KEY`가 있을 때만 공공데이터포털을 선택 fallback으로 사용합니다. 상세 등록·검증 절차는 [`docs/KMA_카카오_운영설정.md`](docs/KMA_카카오_운영설정.md)를 따릅니다.

## 알려진 한계 / 검증 필요 사항

- **지역 코드**: `src/lib/regions.ts`의 `region_code`는 행정안전부 공식 법정동코드가 아닌 앱 내부 슬러그입니다. 전국 시군구는 대표 좌표로 시드했고, 세종시만 읍면동 단위까지 세분화했습니다.
- **기상청 키 상태와 API 활용승인은 별개**: API허브 마이페이지에서 `KMA_AUTH_KEY`가 "정상"이어도 **동네예보(초단기실황·초단기예보·단기예보) 조회** 활용신청이 승인되지 않았으면 HTTP 403이 반환될 수 있습니다. 공공데이터포털 fallback도 해당 서비스의 별도 키와 이용승인이 필요합니다. `KMA_AUTH_KEY`는 APIHub의 `authKey`, `KMA_SERVICE_KEY`는 data.go.kr의 `serviceKey`로만 보냅니다.
- **기상특보(주의보/경보)**: `wrn_now_data.php`를 API 허브 문서의 컬럼 순서(REG_UP, REG_UP_KO, REG_ID, REG_KO, TM_FC, TM_EF, WRN, LVL, CMD, ED_TM)로 파싱하고 WRN/LVL 코드를 한글로 변환합니다. 실제 키 등록 후 응답 샘플로 재검증을 권장합니다 (`src/lib/kma.ts`의 `getWeatherAlerts`).
- **카카오맵 키 구분**: `NEXT_PUBLIC_KAKAO_JS_KEY`는 지도 렌더링용 공개 JavaScript 키이고 `KAKAO_REST_API_KEY`는 서버 전용 비밀키입니다. 신규 카카오 앱은 카카오맵 사용 설정을 켜고 JavaScript SDK 도메인에 로컬·운영 출처를 등록해야 합니다. 공개 키를 Vercel에서 바꾸면 새 빌드에 포함되도록 재배포해야 합니다.
- **상황발생 지역 geometry**: 외부 재난 원문은 행정구역명만 제공하고 정확한 폴리곤·반경은 제공하지 않습니다. 지도에는 임의의 위험 반경·발생 좌표를 만들지 않고 조회 기준 위치와 원문 발생지역 텍스트를 구분해 표시합니다.
- **재난문자/대피소(safetydata.go.kr)**: 재난문자(속보) DSSP-IF-10748과 긴급재난문자 DSSP-IF-00247을 서비스별 키로 각각 호출해 병합합니다. 최근 3일치(`crtDt`)만 조회하며, 응답 필드명은 키 발급 후 관리자 콘솔의 API 테스트로 검증하세요 (`src/lib/safetydata.ts`).
- **재난 5단계 판정**: `docs/재난유형별_단계구분_기준.md`에 따르면 재난유형별로 실제 수치 기준이 각각 다릅니다. 현재는 기상특보/재난문자 유형을 5단계로 단순 매핑한 근사치이며(`src/data/levelCriteria.ts`), bizrouter가 설정된 경우 LLM이 규칙기반 판정보다 상향(escalate)만 할 수 있습니다.

## 개발

Node.js 20.19 이상을 사용합니다.

```bash
npm install
npm run dev
npm test
npm run typecheck
```

## 배포

Vercel에 연결한 뒤 환경변수를 등록하고 새 배포를 실행합니다. 다음 항목은 코드 변경으로 완료할 수 없는 운영자 확인 사항이며, 실제 운영 환경에서 검증하기 전까지 미완료로 유지합니다.

- [ ] 기상청 API허브에서 동네예보 조회 API 활용신청이 승인되었는지 확인
- [ ] 카카오디벨로퍼스 앱의 카카오맵 사용 설정을 `ON`으로 활성화
- [ ] JavaScript SDK 도메인에 `http://localhost:3000`과 실제 운영 도메인을 각각 등록
- [ ] Vercel 환경변수 변경 후 재배포하고 실제 브라우저에서 날씨와 지도를 검증
- [ ] `ADMIN_PASSWORD`와 충분히 긴 무작위 `ADMIN_SESSION_SECRET`을 모두 설정하고 관리자 로그인을 검증

키 값은 이슈·문서·스크린샷·로그에 남기지 않습니다. 운영 검증의 세부 판정 기준은 [`docs/KMA_카카오_운영설정.md`](docs/KMA_카카오_운영설정.md)에 정리되어 있습니다.
