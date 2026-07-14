# KMA 동네예보·카카오맵 운영 설정

이 문서는 Vercel 운영 환경에서 기상청 동네예보와 카카오맵을 활성화하는 관리자 절차입니다. 아래 체크박스는 코드 구현 상태가 아니라 외부 콘솔과 실제 브라우저에서 관리자가 직접 확인해야 하는 항목이므로, 확인 전에는 완료 처리하지 않습니다.

실제 키 값은 Git, 문서, 이슈, 채팅, 스크린샷 또는 API 오류 로그에 기록하지 않습니다.

## 1. 기상청 API허브 단기예보 격자자료

| 항목 | 값 |
|---|---|
| 기본 URL | `https://apihub.kma.go.kr/api/typ01/cgi-bin/url/nph-dfs_shrt_grd` |
| 환경변수 | `KMA_AUTH_KEY` |
| 요청 파라미터 | `tmfc`, `tmef`, `vars`, `authKey` |
| 공급자 | 기상청 API허브만 사용(공공데이터포털 연결 없음) |
| 발표시각 | KST 02·05·08·11·14·17·20·23시 |

날씨 화면은 초단기실황이나 공공데이터포털 `getVilageFcst`를 호출하지 않습니다. APIHub의 단기예보 격자자료에서 현재 이후 가장 가까운 정시의 `TMP`, `SKY`, `PTY`, `POP`, `PCP`, `REH`, `WSD`와 오늘 `TMN`·`TMX`를 변수별로 조회합니다. 최신 발표 직후 자료가 아직 없을 수 있어 앱은 15분 유예를 두고, 자료가 비어 있을 때만 직전 3시간 발표본을 한 번 재조회합니다.

첨부된 동네예보 격자영역 기준은 Lambert Conformal 투영, 5km 간격, 동서 149 × 남북 253(37,697개)입니다. 응답은 좌하단부터 우상단 순으로 저장되므로 위경도를 변환한 `(nx, ny)`의 값은 `(ny - 1) × 149 + (nx - 1)` 인덱스로 선택합니다. 비자료 `-99.0`과 변수별 결측값을 화면 값으로 사용하지 않습니다.

2024년 11월 28일 14시 이후 예보기간은 02~14시 발표가 +4일, 17~23시 발표가 +5일까지 확대됐습니다. 연장 구간의 `PCP`, `SNO`, `WSD`는 정량값이 아닌 정성 코드일 수 있습니다. 현재 화면은 다음 정시 값만 사용하므로 정량 구간에 해당하며, 장기 화면을 추가할 때는 정성 코드 변환을 별도로 적용해야 합니다.

### 키가 정상이어도 403이 발생하는 경우

API허브 마이페이지에서 인증키 상태가 **정상**인 것과 개별 API의 **활용신청 승인**은 별개입니다. 키가 정상이어도 **동네예보 단기예보 격자자료(`nph-dfs_shrt_grd`)** 활용신청이 승인되지 않았으면 HTTP 401/403이 반환될 수 있습니다. 공공데이터포털 키를 추가하지 말고 해당 API의 신청·승인 상태를 확인합니다.

### 관리자 미완료 체크리스트

- [ ] `ADMIN-KMA-001` API허브 마이페이지에서 `KMA_AUTH_KEY` 상태가 정상인지 확인
- [ ] `ADMIN-KMA-002` API허브의 **동네예보 단기예보 격자자료** 활용신청이 승인되었는지 확인
- [ ] `ADMIN-KMA-003` Vercel의 필요한 환경에 `KMA_AUTH_KEY`를 서버 비밀값으로 등록하고 재배포
- [ ] `ADMIN-KMA-004` `/api/weather?lat=37.5665&lng=126.9780`에서 `fallback=false`, `provider=KMA_APIHUB`, 단기예보 기준시각과 기온·습도·하늘·바람을 확인
- [ ] `ADMIN-KMA-005` 서로 다른 두 지역 좌표로 조회해 위치별 격자값이 달라지는지 확인
- [ ] `ADMIN-KMA-006` `/admin` API 수동 테스트의 요청·오류·로그에 `authKey` 값이 노출되지 않는지 확인

공식 참고: [기상청 API허브 동네예보 격자자료](https://apihub.kma.go.kr/apiList.do?apiMov=4.+%EB%8F%99%EB%84%A4%EC%98%88%EB%B3%B4%28%EC%B4%88%EB%8B%A8%EA%B8%B0%EC%8B%A4%ED%99%A9%C2%B7%EC%B4%88%EB%8B%A8%EA%B8%B0%EC%98%88%EB%B3%B4%C2%B7%EB%8B%A8%EA%B8%B0%EC%98%88%EB%B3%B4%29+%EC%A1%B0%ED%9A%8C&seqApi=10&seqApiSub=286)

## 2. 카카오맵 키와 도메인

| 환경변수 | 사용 위치 | 비밀 여부 | 운영 통제 |
|---|---|---|---|
| `NEXT_PUBLIC_KAKAO_JS_KEY` | 브라우저의 카카오맵 JavaScript SDK | 공개값 | JavaScript SDK 허용 도메인과 카카오맵 사용 설정 |
| `KAKAO_REST_API_KEY` | 서버의 병원·약국 검색과 좌표 변환 | 서버 비밀값 | Vercel 비밀 저장소, 클라이언트 미노출 |

`NEXT_PUBLIC_KAKAO_JS_KEY`는 `NEXT_PUBLIC_` 변수이므로 브라우저 번들 및 SDK 요청에서 보입니다. 비밀값으로 취급해 숨기는 키가 아니라, 카카오디벨로퍼스에서 허용한 웹 출처만 사용할 수 있도록 도메인 제한으로 통제하는 플랫폼 키입니다. 반대로 `KAKAO_REST_API_KEY`에는 `NEXT_PUBLIC_` 접두사를 붙이지 않습니다.

카카오 공식 설정 기준:

1. 카카오디벨로퍼스 앱을 생성하고 플랫폼 키에서 **JavaScript 키**와 **REST API 키**를 구분합니다.
2. 앱 관리의 **카카오맵 > 사용 설정**에서 상태를 `ON`으로 설정합니다. JavaScript SDK에 REST API 키를 사용하지 않습니다.
3. **앱 > 플랫폼 키 > JavaScript 키 > JavaScript SDK 도메인**에 `http://localhost:3000`과 실제 운영 출처(예: `https://safecompass.example.com`)를 각각 등록합니다.
4. `NEXT_PUBLIC_KAKAO_JS_KEY`는 Next.js 빌드 시 클라이언트 번들에 포함되므로 Vercel에서 값을 추가·수정한 뒤 반드시 새로 배포합니다.

참고: [카카오맵 시작하기](https://developers.kakao.com/docs/ko/kakaomap/common), [카카오맵 동적 SDK 로딩](https://apis.map.kakao.com/web/documentation/), [JavaScript 키·SDK 도메인 설정](https://developers.kakao.com/docs/ko/app-setting/app)

### `window.kakao=window.kakao||{}`로 시작하는 응답의 의미

`https://dapi.kakao.com/v2/maps/sdk.js` 요청에서 `window.kakao=window.kakao||{}`로 시작하는 압축 JavaScript가 반환되는 것은 오류가 아니라 정상적인 **SDK 부트스트랩 응답**입니다. 이 부트스트랩이 `t1.daumcdn.net`의 지도 본체를 이어서 내려받고 `kakao.maps.load()` 콜백을 실행해야 실제 지도를 만들 수 있습니다.

앱은 이 긴 응답 본문을 오류 메시지로 출력하지 않습니다. 지도 본체가 준비되지 않으면 다음 순서로 원인을 확인할 수 있는 짧은 메시지를 표시합니다.

| 화면 메시지 | 확인할 항목 |
|---|---|
| JavaScript 키 미설정 | Vercel에 `NEXT_PUBLIC_KAKAO_JS_KEY` 등록 후 새 배포 여부 |
| SDK 부트스트랩 다운로드 실패 | `dapi.kakao.com` 네트워크·콘텐츠 차단 여부 |
| SDK 본체 다운로드 실패 | `t1.daumcdn.net` 네트워크·광고 차단·브라우저 확장 기능 여부 |
| SDK 초기화 시간 초과 | JavaScript 키 종류, JavaScript SDK 도메인, 카카오맵 사용 설정 `ON` 여부 |
| 지도 생성 실패 | 브라우저 콘솔의 카카오 인증 오류와 등록한 운영 출처 일치 여부 |

Vercel Preview 배포에서도 지도를 시험하려면 실제 Preview 출처를 JavaScript SDK 도메인에 등록합니다. 와일드카드 서브도메인을 사용할 때는 카카오의 현재 도메인 등록 규칙에 맞는지 관리자 콘솔에서 확인합니다.

### 관리자 미완료 체크리스트

- [ ] `ADMIN-KAKAO-001` 사용할 카카오 앱에서 카카오맵 사용 설정이 `ON`인지 확인
- [ ] `ADMIN-KAKAO-002` `NEXT_PUBLIC_KAKAO_JS_KEY`가 해당 앱의 JavaScript 키인지 확인(REST API 키 사용 금지)
- [ ] `ADMIN-KAKAO-003` JavaScript SDK 도메인에 `http://localhost:3000` 등록
- [ ] `ADMIN-KAKAO-004` JavaScript SDK 도메인에 주소창과 정확히 일치하는 운영 출처 등록
- [ ] `ADMIN-KAKAO-005` Preview 배포에서 시험한다면 해당 Preview 출처도 등록
- [ ] `ADMIN-KAKAO-006` `KAKAO_REST_API_KEY`를 Vercel 서버 환경에 비밀값으로 별도 등록
- [ ] `ADMIN-KAKAO-007` `NEXT_PUBLIC_KAKAO_JS_KEY` 변경 후 Vercel 재배포 완료
- [ ] `ADMIN-KAKAO-008` 데스크톱과 모바일 실제 브라우저에서 첫 화면 및 `/map`에 지도 타일이 표시되는지 확인
- [ ] `ADMIN-KAKAO-009` 지도 조회 기준 위치·하단 원문 발생지역과 인근 대피소 마커가 서로 구분되고 선택 위치에 맞는지 확인
- [ ] `ADMIN-KAKAO-010` 마커 선택, 지도 이동, “이 지역 재검색”, 목록 fallback이 함께 동작하는지 확인
- [ ] `ADMIN-KAKAO-011` 브라우저 개발자 도구에서 SDK 도메인·앱 키 오류가 없고 서버 응답이나 로그에 REST 키가 노출되지 않는지 확인

## 3. 통합대피소 연동

재난안전데이터공유플랫폼 통합대피소 DSSP-IF-10941의 키 등록, 전체 JSON 저장, 유형 코드와 관리자 검증 절차는 [`재난안전데이터_통합대피소_운영설정.md`](재난안전데이터_통합대피소_운영설정.md)를 따릅니다. `SAFETYDATA_SERVICE10941_KEY`는 서버 비밀값이며 재난문자 서비스 키와 교차 사용하지 않습니다.

## 4. 배포 후 판정

환경변수가 “설정됨”으로 보이는 것만으로 완료하지 않습니다. Vercel 재배포 뒤 실제 운영 URL의 브라우저에서 다음 조건을 모두 만족해야 합니다.

- 날씨: HTTP 401/403 없이 실제 동네예보 값과 기준시각을 표시
- 지도: 카카오 지도 타일을 초기 화면부터 표시
- 안전정보: 조회 기준 위치·원문 발생지역과 인근 대피소를 같은 지도에서 구분해 확인 가능하며, 근거 없는 위험 반경·발생 좌표를 표시하지 않음
- 비밀보호: `KMA_AUTH_KEY`, `SAFETYDATA_SERVICE10941_KEY`, `BLOB_READ_WRITE_TOKEN`, `KAKAO_REST_API_KEY`가 HTML·클라이언트 번들·로그에 노출되지 않음
- 공개키 제한: `NEXT_PUBLIC_KAKAO_JS_KEY`는 공개되지만 등록하지 않은 도메인에서는 사용할 수 없도록 카카오 콘솔이 제한

위 조건을 운영자가 확인하고 증적을 첨부하기 전에는 관련 관리자 항목을 완료 처리하지 않습니다.
