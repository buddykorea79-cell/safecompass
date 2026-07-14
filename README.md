# 안전나침판 (Safety Compass)

내 위치 기준으로 재난 상황 판단, 국민행동요령, 안전지도(대피소·병원·약국), 공식 재난알림을 한 화면에서 확인하는 모바일 우선 웹앱입니다. `docs/안전나침판_시스템설계서.md`를 기반으로 구현했습니다.

## 현재 구현 범위

- **DB 없음**: Supabase는 아직 연동하지 않았습니다. 57종 국민행동요령은 정적 JSON(`src/data/disasterGuide.json`)으로 제공하고, 통합대피소는 관리자가 저장한 Vercel Blob JSON(로컬은 `data/runtime`)에서 조회합니다. 날씨/특보/재난문자/병원·약국은 외부 API를 호출합니다.
- **키 없이도 동작**: 기상청 API허브, 재난안전데이터공유플랫폼, 카카오맵, bizrouter(LLM) 키가 없어도 앱은 "설정 필요/정보 없음" 상태로 동작합니다. 운영 키와 통합대피소 JSON을 준비하면 실제 데이터로 전환됩니다.
- **관리자 콘솔** (`/admin`): 외부 인증 서비스 없이 고정 접근코드 `21002100`과 12시간 HttpOnly 쿠키를 사용합니다. API 상태·수동 테스트와 통합대피소 전체 JSON 저장 도구를 제공합니다. 공개 저장소의 고정 코드는 강한 보안 수단이 아닙니다.
- **모바일 정보 순서**: 공용 헤더에서 위치를 선택하고, 홈은 현재 상황 5단계 → 내 주변 안전지도 → 날씨 순으로 표시합니다. 하단 내비게이션과 중복되던 상단 메뉴·퀵 아이콘은 제거했습니다.
- **알림·행동요령**: 공식 알림은 재난문자와 기상특보를 최신순으로 합쳐 페이지당 10건을 표시합니다. 행동요령 상단은 재난문자·기상특보·날씨를 조합해 하루 1회 가장 가까운 유형을 추천합니다.

## 환경변수

`.env.example` 참고. Vercel 프로젝트 설정 → Environment Variables에 아래 키들을 등록하세요.

| 키 | 용도 |
|---|---|
| `KMA_AUTH_KEY` | 기상청 API허브 `nph-dfs_shrt_grd` 단기예보 격자자료와 기상특보용 `authKey`. 서버 비밀값 |
| `SAFETYDATA_SERVICE10748_KEY` | 재난안전데이터공유플랫폼 재난문자(속보) DSSP-IF-10748 서비스키 |
| `SAFETYDATA_SERVICE00247_KEY` | 재난안전데이터공유플랫폼 긴급재난문자 DSSP-IF-00247 서비스키 |
| `SAFETYDATA_SERVICE10941_KEY` | 통합대피소 DSSP-IF-10941 전용 `serviceKey`. 다른 API 키와 교차 사용하지 않는 서버 비밀값 |
| `BLOB_READ_WRITE_TOKEN` | 관리자가 내려받은 통합대피소 JSON을 영속 저장·조회하는 Vercel Blob 서버 비밀 토큰 |
| `KAKAO_REST_API_KEY` | 카카오 로컬 API(병원·약국 검색, 좌표→행정동) — 서버 전용 |
| `NEXT_PUBLIC_KAKAO_JS_KEY` | 카카오맵 JavaScript 키. 브라우저에 공개되는 값이며 카카오 콘솔의 허용 도메인으로 통제 |
| `BIZROUTER_BASE_URL` / `BIZROUTER_API_KEY` | OpenAI 호환 LLM 게이트웨이(2차 판정, 챗봇, 임베딩, STT) |

날씨는 공공데이터포털을 사용하지 않고 `KMA_AUTH_KEY`로 기상청 API허브의 단기예보 격자자료만 조회합니다. `SAFETYDATA_SERVICE10941_KEY`도 통합대피소 전용이며 재난문자 키를 대신하지 않습니다. 상세 등록·검증 절차는 [`docs/KMA_카카오_운영설정.md`](docs/KMA_카카오_운영설정.md)와 [`docs/재난안전데이터_통합대피소_운영설정.md`](docs/재난안전데이터_통합대피소_운영설정.md)를 따릅니다.

## 알려진 한계 / 검증 필요 사항

- **지역 코드**: `src/lib/regions.ts`의 `region_code`는 행정안전부 공식 법정동코드가 아닌 앱 내부 슬러그입니다. 전국 시군구는 대표 좌표로 시드했고, 세종시만 읍면동 단위까지 세분화했습니다.
- **기상청 키 상태와 API 활용승인은 별개**: API허브 마이페이지에서 `KMA_AUTH_KEY`가 "정상"이어도 **동네예보 단기예보 격자자료(`nph-dfs_shrt_grd`)** 활용신청이 승인되지 않았으면 HTTP 401/403이 반환될 수 있습니다. 요청은 `tmfc`, `tmef`, `vars`, `authKey`만 사용합니다.
- **기상특보(주의보/경보)**: `wrn_now_data.php`를 API 허브 문서의 컬럼 순서(REG_UP, REG_UP_KO, REG_ID, REG_KO, TM_FC, TM_EF, WRN, LVL, CMD, ED_TM)로 파싱하고 WRN/LVL 코드를 한글로 변환합니다. 실제 키 등록 후 응답 샘플로 재검증을 권장합니다 (`src/lib/kma.ts`의 `getWeatherAlerts`).
- **카카오맵 키 구분**: `NEXT_PUBLIC_KAKAO_JS_KEY`는 지도 렌더링용 공개 JavaScript 키이고 `KAKAO_REST_API_KEY`는 서버 전용 비밀키입니다. 신규 카카오 앱은 카카오맵 사용 설정을 켜고 JavaScript SDK 도메인에 로컬·운영 출처를 등록해야 합니다. 공개 키를 Vercel에서 바꾸면 새 빌드에 포함되도록 재배포해야 합니다.
- **카카오 SDK 응답 판별**: `window.kakao=window.kakao||{}`로 시작하는 압축 JavaScript는 오류가 아니라 정상 부트스트랩입니다. 지도가 표시되지 않으면 그 다음 지도 본체 CDN 로딩, JavaScript 키 종류, JavaScript SDK 도메인, 카카오맵 사용 설정을 확인합니다. 앱은 긴 스크립트 원문 대신 단계별 짧은 오류를 표시합니다.
- **상황발생 지역 geometry**: 외부 재난 원문은 행정구역명만 제공하고 정확한 폴리곤·반경은 제공하지 않습니다. 지도에는 임의의 위험 반경·발생 좌표를 만들지 않고 조회 기준 위치와 원문 발생지역 텍스트를 구분해 표시합니다.
- **재난문자(safetydata.go.kr)**: 재난문자(속보) DSSP-IF-10748과 긴급재난문자 DSSP-IF-00247을 서비스별 키로 각각 호출해 병합합니다. 최근 3일치(`crtDt`)만 조회하며, 응답 필드명은 키 발급 후 관리자 콘솔의 API 테스트로 검증하세요 (`src/lib/safetydata.ts`).
- **통합대피소(safetydata.go.kr)**: `/admin/api-test`의 **통합대피소 JSON 저장**에서 DSSP-IF-10941 네 유형의 전체 페이지를 한 번에 내려받아 검증 후 Vercel Blob JSON으로 저장합니다. 공개 지도 API는 원본 플랫폼을 재호출하지 않고 저장본에서 실제 거리 3km 안의 가까운 30곳을 표시합니다.
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
- [ ] 재난안전데이터공유플랫폼에서 통합대피소 DSSP-IF-10941 이용신청이 승인되었는지 확인
- [ ] Vercel에 `SAFETYDATA_SERVICE10941_KEY`를 서버 비밀값으로 등록
- [ ] Vercel Blob 스토어를 프로젝트에 연결해 `BLOB_READ_WRITE_TOKEN`을 생성하고 재배포
- [ ] `/admin/login`에서 접근코드 `21002100`으로 접속한 뒤 API 테스트와 통합대피소 JSON 저장을 실행
- [ ] 운영 `/api/shelters?lat=37.5665&lng=126.9780`과 초기 안전지도에서 인근 통합대피소 마커·4개 유형을 확인
- [ ] 카카오디벨로퍼스 앱의 카카오맵 사용 설정을 `ON`으로 활성화
- [ ] JavaScript SDK 도메인에 `http://localhost:3000`과 실제 운영 도메인을 각각 등록
- [ ] Vercel Preview에서 시험한다면 해당 Preview 출처도 JavaScript SDK 도메인에 등록
- [ ] Vercel 환경변수 변경 후 재배포하고 실제 브라우저에서 날씨와 지도를 검증

키 값은 이슈·문서·스크린샷·로그에 남기지 않습니다. 운영 검증의 세부 판정 기준은 [`docs/KMA_카카오_운영설정.md`](docs/KMA_카카오_운영설정.md)와 [`docs/재난안전데이터_통합대피소_운영설정.md`](docs/재난안전데이터_통합대피소_운영설정.md)에 정리되어 있습니다.
