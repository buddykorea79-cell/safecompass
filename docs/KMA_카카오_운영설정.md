# KMA 동네예보·카카오맵 운영 설정

이 문서는 Vercel 운영 환경에서 기상청 동네예보와 카카오맵을 활성화하는 관리자 절차입니다. 아래 체크박스는 코드 구현 상태가 아니라 외부 콘솔과 실제 브라우저에서 관리자가 직접 확인해야 하는 항목이므로, 확인 전에는 완료 처리하지 않습니다.

실제 키 값은 Git, 문서, 이슈, 채팅, 스크린샷 또는 API 오류 로그에 기록하지 않습니다.

## 1. 기상청 키를 공급자별로 구분

| 공급자 | 기본 URL | 환경변수 | 요청 파라미터 | 분류 | 사용 방식 |
|---|---|---|---|---|---|
| 기상청 API허브 | `https://apihub.kma.go.kr/api/typ02/openApi/VilageFcstInfoService_2.0` | `KMA_AUTH_KEY` | `authKey` | 서버 비밀값 | 동네예보 우선 공급자 |
| 공공데이터포털 | `https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0` | `KMA_SERVICE_KEY` | `serviceKey` | 서버 비밀값 | 별도로 설정했을 때만 선택 fallback |

두 변수는 발급처와 인증 파라미터가 다릅니다. `KMA_AUTH_KEY`를 data.go.kr의 `serviceKey`로 보내거나 `KMA_SERVICE_KEY`를 APIHub의 `authKey`로 보내지 않습니다. 한 키를 두 환경변수에 복사하는 것도 금지합니다.

동작 원칙은 다음과 같습니다.

1. 초단기실황과 단기예보를 독립 조회하며, 각 조회는 API허브를 먼저 호출합니다.
2. API허브 호출이 실패하고 `KMA_SERVICE_KEY`가 별도로 설정되어 있을 때만 공공데이터포털을 fallback으로 호출합니다. 두 공급자의 실패 사유는 공급자별로 구분해 반환합니다.
3. `KMA_SERVICE_KEY`가 비어 있으면 data.go.kr fallback은 비활성입니다.
4. 최신 발표가 아직 비어 있으면 직전 초단기실황·단기예보 발표시각으로 한 번 재조회합니다. 한 종류만 실패하면 정상 자료는 유지하고 단기예보 `TMP/REH/WSD` 등으로 가능한 값을 보완합니다.
5. 현재 이후 가장 가까운 예보를 날짜 경계까지 포함해 선택하며, 오늘 발표본에 없는 최고·최저값은 추정하지 않습니다.
6. 어느 공급자가 응답했는지와 실패한 공급자를 구분하되, 키 값이나 키 일부는 로그에 남기지 않습니다.

### 키가 정상이어도 403이 발생하는 경우

API허브 마이페이지에서 인증키 상태가 **정상**인 것과 개별 API의 **활용신청 승인**은 별개입니다. 키가 정상이어도 **동네예보(초단기실황·초단기예보·단기예보) 조회** API의 활용신청이 승인되지 않았으면 HTTP 403이 반환될 수 있습니다. 이 경우 키를 재발급하거나 양쪽 변수에 같은 값을 넣지 말고, 먼저 해당 API의 신청·승인 상태를 확인합니다.

공공데이터포털 fallback도 `KMA_SERVICE_KEY` 발급만으로 충분하지 않을 수 있습니다. `VilageFcstInfoService_2.0` 이용신청과 운영 상태를 해당 포털에서 별도로 확인합니다.

### 관리자 미완료 체크리스트

- [ ] API허브 마이페이지에서 `KMA_AUTH_KEY` 상태가 정상인지 확인
- [ ] API허브에서 **동네예보(초단기실황·초단기예보·단기예보) 조회** 활용신청이 승인되었는지 확인
- [ ] 선택 fallback을 사용할 경우 공공데이터포털에서 동네예보 서비스 이용승인과 `KMA_SERVICE_KEY`를 별도로 확인
- [ ] Vercel의 필요한 환경(Production, Preview, Development)에 서버 비밀값을 등록하고 재배포
- [ ] 관리자 콘솔을 사용할 환경에는 `ADMIN_PASSWORD`와 충분히 긴 무작위 `ADMIN_SESSION_SECRET`을 모두 등록
- [ ] `/api/weather?lat=37.5665&lng=126.9780` 응답에서 `fallback`이 `false`이고 `provider`, 기온·습도·하늘상태, 실황·단기예보 기준시각이 존재하는지 확인
- [ ] 서로 다른 두 지역 좌표로 조회해 위치별 값과 기상청 격자가 달라지는지 확인
- [ ] `/admin`의 API 수동 테스트에서 성공 공급자와 오류 메시지를 확인하되 키 값이 노출되지 않는지 확인

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

참고: [카카오맵 시작하기](https://developers.kakao.com/docs/ko/kakaomap/common), [JavaScript SDK 도메인 등록](https://developers.kakao.com/docs/ko/javascript/getting-started)

### 관리자 미완료 체크리스트

- [ ] 사용할 카카오 앱에서 카카오맵 사용 설정이 `ON`인지 확인
- [ ] `NEXT_PUBLIC_KAKAO_JS_KEY`가 해당 앱의 JavaScript 키인지 확인(REST API 키 사용 금지)
- [ ] JavaScript SDK 도메인에 `http://localhost:3000` 등록
- [ ] JavaScript SDK 도메인에 주소창과 정확히 일치하는 운영 출처 등록
- [ ] `KAKAO_REST_API_KEY`를 Vercel 서버 환경에 비밀값으로 별도 등록
- [ ] `NEXT_PUBLIC_KAKAO_JS_KEY` 변경 후 Vercel 재배포 완료
- [ ] 데스크톱과 모바일 실제 브라우저에서 첫 화면 및 `/map`에 지도 타일이 표시되는지 확인
- [ ] 지도 조회 기준 위치·하단 원문 발생지역과 인근 대피소 마커가 서로 구분되고 선택 위치에 맞는지 확인
- [ ] 마커 선택, 지도 이동, “이 지역 재검색”, 목록 fallback이 함께 동작하는지 확인
- [ ] 브라우저 개발자 도구에서 SDK 도메인·앱 키 오류가 없고 서버 응답이나 로그에 REST 키가 노출되지 않는지 확인

## 3. 배포 후 판정

환경변수가 “설정됨”으로 보이는 것만으로 완료하지 않습니다. Vercel 재배포 뒤 실제 운영 URL의 브라우저에서 다음 조건을 모두 만족해야 합니다.

- 날씨: HTTP 401/403 없이 실제 동네예보 값과 기준시각을 표시
- 지도: 카카오 지도 타일을 초기 화면부터 표시
- 안전정보: 조회 기준 위치·원문 발생지역과 인근 대피소를 같은 지도에서 구분해 확인 가능하며, 근거 없는 위험 반경·발생 좌표를 표시하지 않음
- 비밀보호: `KMA_AUTH_KEY`, `KMA_SERVICE_KEY`, `KAKAO_REST_API_KEY`가 HTML·클라이언트 번들·로그에 노출되지 않음
- 공개키 제한: `NEXT_PUBLIC_KAKAO_JS_KEY`는 공개되지만 등록하지 않은 도메인에서는 사용할 수 없도록 카카오 콘솔이 제한

위 조건을 운영자가 확인하고 증적을 첨부하기 전에는 관련 관리자 항목을 완료 처리하지 않습니다.
