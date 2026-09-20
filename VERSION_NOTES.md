# v27 검수 및 개선 메모

## 검수 기준

`PROJECT_RULES.md` → `README.md` → `VERSION_NOTES.md` 순서로 기준을 확인한 뒤 v26 코드를 대상으로 재검수했습니다.

## 이번에 발견한 개선점

### 1. 10km 확장 검색에 실제 기하학적 공백 가능성

v26은 중앙 1개 + 반경 8km 외곽 7개 중심점을 사용했습니다. 이 배치에서는 10km 원 경계와 5km 검색원의 사이에 약 5km를 넘는 빈 구간이 생길 수 있었습니다.

v27은 외곽 중심점을 7km로 조정했습니다. 중앙 1개 + 외곽 7개, 각 5km 검색원의 조합으로 10km 경계의 최대 최근접 거리를 테스트했고 5km 이하임을 확인했습니다.

### 2. Opinet 캐시 사용 시 거리 재계산

25m 단위로 위치를 캐시하더라도, 캐시된 raw 결과의 `DISTANCE`가 이전 요청 중심점 기준일 수 있었습니다. v27은 Opinet 결과를 앱 데이터로 변환한 뒤 현재 요청의 KATEC 좌표를 기준으로 거리/거리(km)를 다시 계산합니다.

### 3. Kakao Local 401/403 반복 호출

권한 오류가 발생한 상태에서 현재 위치 역지오코딩마다 `coord2address` → `coord2regioncode`를 반복 호출하면 지연과 로그 노이즈가 커집니다. v27은 Kakao Local이 401/403을 반환하면 5분간 회로 차단하고 OSM fallback을 우선 사용합니다.

### 4. CORS 범위 축소

v26의 `*.onrender.com` 전체 허용은 다른 Render 서비스가 브라우저에서 공개 API를 호출해 Opinet 쿼터를 소모할 가능성이 있어 v27에서 제거했습니다. 기본값은 `fuelfinder-web.onrender.com`과 localhost를 포함한 명시된 `FRONTEND_ORIGINS`만 허용합니다.

## 테스트

- `node --check`로 `src/*.js`, `public/config.js`, `public/shared/calc.js`, `index.html` module script 검사: PASS
- `npm run test:localpay-match`: PASS
- `npm run test:search-geometry`: PASS
- 실제 Opinet/Kakao/Nominatim 외부 API 호출: 이 환경에서는 미수행

## 실제 외부 연동 관련 주의

Kakao Local REST 403은 코드상 권한 오류를 별도 처리하지만, 실제 앱의 Local API 권한 활성화 여부는 카카오디벨로퍼스 설정에서 확인해야 합니다.

# v26 검수 및 수정 메모

## 코드 변경

- Static Site → API Web Service CORS 문제 보강
- 명시된 `FRONTEND_ORIGINS`만 CORS 허용
- 주변 주유소 API fetch 1회 자동 재시도
- CORS preflight `Access-Control-Max-Age` 600초
- 연결 실패 메시지 개선
- 기존 API/계산/UI 구조 유지

## 현재 중요한 외부 연동 상태

- Opinet 주변검색은 정상 응답 사례가 확인됨.
- Kakao Local REST에서 HTTP 403이 발생한 사례가 있음.
- Kakao 403은 Opinet 문제와 별개이며, Kakao Local 사용 권한/앱 설정을 확인해야 함.
- 주소 변환은 Kakao → OSM fallback 구조.
- Kakao Navi는 JavaScript SDK를 실제 버튼 클릭 때 초기화.

## 현재 사용자 UX

- 모바일 전용
- 첫 진입 현재 위치 자동검색
- 검색창은 빈 상태
- 위치/반경/필터/차량 설정은 설정창
- 검색 버튼은 검색창 옆 돋보기
- 메인 결과에는 별도 베스트 카드 없음
- 주유소 카드의 실질가격이 핵심
- 카드의 길찾기 또는 카드 탭으로 네이버/카카오내비 선택
- 도착 위치 확인 기능 없음
- 가격 기준일 3일 이상 지난 가격은 기본 제외

## 문서화 작업

이번 버전 기준으로 다음 협업 문서를 추가/정비함:

- `PROJECT_RULES.md`
- `CHANGELOG.md`
- `README.md`

목적은 Claude와 다른 AI/개발자가 서로 다른 가정을 가지고 코드를 덮어쓰는 일을 방지하고, 현재 UX/API 구조를 단일 기준으로 유지하는 것입니다.

---

## v26 추가 검수 (Claude, 문서 확인 후 진행)

`PROJECT_RULES.md` → `README.md` → `VERSION_NOTES.md` 순서로 읽은 뒤 아래 순서로 확인했습니다.

### 확인 절차와 결과

- `node --check`: `src/*.js`, `src/legacy/*.js`, `public/shared/calc.js`, `public/config.js`, `public/index.html`의 `<script type="module">` 전체 — 전부 통과
- `npm run test:localpay-match` — 실행 결과 아래 참고
- 실제 Opinet/Kakao/Nominatim API 호출 테스트는 이 환경에서 네트워크 접근이 불가능해 **수행하지 못했습니다.** (`실제 API 테스트 여부: 미수행`)

### 변경 파일

- `src/testLocalpayMatcher.js`

### 발견 사항 및 조치

**"홍길동주유소" 테스트의 판정 기준이 매처의 실제 설계와 어긋나 있었습니다.**

- `src/localpayMatcher.js`는 주소/전화 정보가 전혀 없고 이름만 유일하게 일치하는 경우, 코드 주석에 명시된 대로 "자동 할인 적용은 하지 않는다"는 원칙에 따라 의도적으로 `needs_confirmation`을 반환합니다 (다른 이름-일치 분기에서도 동일한 원칙 반복 확인됨).
- 그런데 `testLocalpayMatcher.js`의 판정 코드는 이 케이스에서 `matchStatus === "matched"`를 기대하고 있어, 매처가 설계대로 정확히 동작해도 항상 FAIL이 출력되는 상태였습니다.
- **코드(매칭 로직)는 건드리지 않았습니다.** 이름만으로 자동 확정하도록 완화하면 실제로는 다른 지점의 동명 주유소에 강릉페이 할인이 잘못 적용될 위험이 있어, 안전장치 자체는 그대로 두는 것이 맞다고 판단했습니다.
- 대신 테스트의 판정 기준을 "확정은 보류(`needs_confirmation`)하되, 사람이 검토할 정확한 후보(홍길동주유소)를 짚어냈는가"로 수정했습니다. 재실행 결과 PASS.

### 재확인만 하고 코드는 변경하지 않은 항목

- **Kakao REST API 403** (`PROJECT_RULES.md` 11절에 기록된 기존 이슈): `fetchKakaoRestJson`의 인증 헤더(`Authorization: KakaoAK {key}`)와 호출 경로는 카카오 Local API v2 규격과 일치하며, 403 발생 시 원인(코드 -3 = 앱에서 Local API 미허용 등)을 구분해 로그를 남기도록 이미 구현돼 있습니다. 실패 시 Kakao 지역 역지오코딩 → OSM Nominatim 순으로 정상적으로 폴백되는 것도 코드상 확인했습니다. 정적 분석 기준으로는 코드 문제가 아니라 카카오 디벨로퍼스 앱 설정(권한 미허용) 쪽 문제로 보이며, 이 환경에서는 실제 호출로 재현/검증하지 못했습니다.
- **CORS의 `*.onrender.com` 허용**: 쿠키/세션 인증이 없는 공개 API라는 점, `OPINET_DAILY_LIMIT`로 하루 호출량이 이미 방어되어 있다는 점에서 현재 설계가 합리적이라고 판단해 그대로 두었습니다.
- `public/shared/calc.js`(7단계 계산식), `src/calculator.js`/`src/discount.js`(재수출 래퍼), Opinet 재시도 로직(`noRetry` 플래그로 키/한도 오류는 재시도 제외) — 모두 문서화된 대로 정상 동작 확인.

