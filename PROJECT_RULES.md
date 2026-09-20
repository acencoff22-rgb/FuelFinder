# FuelFinder 프로젝트 규칙 / AI 협업 기준

> 이 파일은 FuelFinder를 수정하는 모든 작업자(AI, Claude, 사람)가 먼저 읽어야 하는 **최우선 프로젝트 기준 문서**입니다.
> README는 사용자/개발자용 설명이고, 이 문서는 **현재 구조와 변경 금지사항, 작업 절차**를 정의합니다.

## 1. 현재 기준 버전

- 기준 버전: **v27**
- 저장소: 기존 `FuelFinder` GitHub 저장소 하나만 사용
- Render Project: 기존 FuelFinder Project 하나만 사용
- 서비스:
  - `fuelfinder-web`: Static Site, 사용자 화면
  - `fuelfinder`: Web Service, API 서버
- 사용자용 주소: Static Site 주소
- API 주소: `https://fuelfinder-ejo2.onrender.com`
- 현재 `public/config.js`의 API 주소가 실제 API 주소의 기준입니다.

버전을 바꿀 때는 이 파일의 기준 버전과 `VERSION_NOTES.md`를 같이 갱신합니다.

---

## 2. 절대 유지해야 하는 전체 구조

FuelFinder는 **프론트와 API가 분리된 모바일 전용 웹앱**입니다.

```text
휴대폰
  ↓
fuelfinder-web (Render Static Site)
  ↓ fetch
fuelfinder (Render Web Service)
  ├─ Opinet
  ├─ Kakao Local
  └─ OpenStreetMap Nominatim fallback
```

### 절대 임의로 바꾸지 말 것

- Static Site + API Web Service 분리 구조를 하나의 Web Service로 합치지 않습니다.
- 기존 Render Project를 새로 만들지 않습니다.
- 새 GitHub 저장소를 만들지 않습니다.
- 브라우저에서 Opinet REST API를 직접 호출하지 않습니다.
- 브라우저에서 Kakao REST API를 직접 호출하지 않습니다.
- `KAKAO_REST_API_KEY`를 `public/` 파일에 넣지 않습니다.
- 사용자에게 API Web Service 주소를 직접 사용하도록 안내하지 않습니다.
- 모바일 전용 정책을 임의로 PC 지원 구조로 되돌리지 않습니다.

---

## 3. 인증키 역할과 위치

### `OPINET_CERTKEY`
- 용도: Opinet API
- 위치: **Render Web Service 환경변수만**
- 브라우저에 노출 금지

### `KAKAO_REST_API_KEY`
- 용도: Kakao Local 주소/장소 검색, 좌표→주소/행정구역 변환
- 위치: **Render Web Service 환경변수만**
- 브라우저/Static Site에 절대 노출 금지
- 카카오 Local 권한이 활성화되지 않으면 HTTP 403이 발생할 수 있습니다.

### `KAKAO_JAVASCRIPT_KEY`
- 용도: 모바일 Kakao.Navi JavaScript SDK
- 저장: Render Web Service 환경변수
- `/api/config`를 통해 브라우저에 전달됨
- JavaScript 키 자체는 웹 SDK용 공개 클라이언트 키이므로 REST 키와 취급을 구분합니다.
- 카카오 로그인 리다이렉트 URI는 FuelFinder에 필요하지 않습니다.

### `FRONTEND_ORIGINS`
- 용도: API 서버 CORS 명시 허용 origin
- 현재 API는 `FRONTEND_ORIGINS`에 명시된 프론트 origin만 CORS 허용합니다.
- 커스텀 도메인을 붙이면 실제 프론트 origin을 `FRONTEND_ORIGINS`에 추가합니다.

---

## 4. 현재 사용자 경험(UX) 기준

아래는 이미 합의된 현재 UX입니다. 기능을 수정할 때 이 원칙을 유지합니다.

### 첫 진입

1. 모바일에서 페이지가 열림
2. 현재 위치를 자동 요청
3. 위치 좌표를 확보하면 주변 주유소 자동 검색
4. 검색창은 **빈칸**으로 유지
5. 현재 위치 주소는 GPS 좌표와 독립적으로 표시
6. 주소 확인에 실패해도 **주유소 검색은 계속 진행**

### 메인 화면

- 제목 + 설정 아이콘
- 메인 검색창은 필요 시 위치 검색에 사용
- 검색 아이콘은 검색창 **옆 한 줄**에 둡니다.
- 큰 베스트 카드 없음
- 큰 필터 패널 없음
- 메인에서 중요한 것은 **주유소 카드 목록**
- 결과 헤더는 `주변 주유소` 중심으로 작게 표시
- 표시 개수/반경/강릉페이 여부 같은 보조 정보는 작은 텍스트로 처리

### 설정창에 둘 것

- 검색 위치
- 최근 위치
- 검색 반경: 3km / 5km / 10km
- 강릉페이만 보기
- 3일 이상 지난 가격 제외
- 유종
- 주유량
- 차량 연비
- 할인 설정
- 정렬 기준

### 설정창에 두지 않을 것

- `현재 위치 다시 사용` 버튼
  - 첫 진입 시 자동 확인하고, 다시 필요하면 새로고침으로 재실행하는 정책

### 주유소 카드

- 주유소 이름
- 실질가격을 가장 눈에 띄게 표시
- 주유가격 / 거리 / 가격 기준일 / 강릉페이 상태 등 보조 정보
- 작은 `길찾기` 버튼을 카드에 직접 표시
- 카드 탭 또는 길찾기 버튼 → 네이버 길찾기 / 카카오내비 선택창
- `도착 위치만 확인` 기능은 **없음**
- 큰 베스트 카드 없음
- 카드에서 `탭하면 내비 선택 가능` 같은 안내 문구를 반복하지 않음
- 총 부담액 / 주유비 / 이동비 / 할인은 기본 화면에서 억지로 크게 배치하지 않고 상세 계산 영역에서 필요할 때 확인

### 가격 최신성

- 기본: **3일 이상 지난 가격 제외**
- 설정에서 해제 가능
- 가격 기준일 확인 불가 주유소는 자동으로 오래된 가격으로 간주하지 않습니다.
- `aroundAll`만으로는 가격 업데이트 날짜가 없으므로 `detailById`에서 `TRADE_DT`/`TRADE_TM`을 확인합니다.

### 모바일 전용

- PC용 지도/길찾기 UX를 억지로 추가하지 않습니다.
- 네이버 길찾기와 카카오내비는 모바일 앱 연결을 기준으로 합니다.

---

## 5. 핵심 API 역할

### Opinet

주유소 검색/가격의 원본입니다.

- `aroundAll.do`: 주변 주유소 검색
- `detailById.do`: 상세정보 및 가격 기준일 확인
- 일반 API 공식 한도는 1일 300회 수준
- 내부 안전 한도는 기본 280회(`OPINET_DAILY_LIMIT`)
- `aroundAll`의 한 번의 반경은 최대 5km
- 앱의 10km 검색은 여러 기준점 조회 결과를 합치는 방식

**중요:** Opinet 결과가 0개라고 해서 항상 실제로 주유소가 없는 것은 아닙니다. API 오류/한도/일시 장애는 반드시 구분해야 합니다.

### Kakao Local

서버에서 주소/장소 검색과 역지오코딩을 담당합니다.

- 도로명 주소
- 지번 주소
- 장소명/키워드
- 좌표→주소
- 좌표→행정동/법정동

Kakao Local REST 403이 발생하면 Opinet 주유소 검색과 별개 문제로 처리합니다.

### OpenStreetMap Nominatim

Kakao Local의 보조 검색/주소 변환용입니다.

- 브라우저 직접 호출 금지
- API 서버에서 호출
- 캐시/최소 요청 간격 유지
- 공개 서비스이므로 호출량을 과도하게 늘리지 않습니다.

---

## 6. 계산 로직 단일 진실 공급원

**계산 공식은 `public/shared/calc.js` 하나가 기준입니다.**

계산식:

1. 주유비 = 리터당 가격 × 주유량
2. 왕복거리 = 편도거리 × 2
3. 이동 연료량 = 왕복거리 ÷ 차량 연비
4. 이동비 = 이동 연료량 × 해당 주유소 가격
5. 할인 = 결제 조건에 따른 할인액
6. 실질 총비용 = 할인 적용 후 주유비 + 이동비
7. 실질가격 = 실질 총비용 ÷ 주유량

서버/브라우저에 같은 계산식을 별도로 만들지 않습니다.

---

## 7. 핵심 파일 책임

| 파일 | 책임 |
|---|---|
| `public/index.html` | 모바일 UI, 설정, 검색 흐름, 카드 렌더링, 클라이언트 상태 |
| `public/config.js` | API Web Service 주소 |
| `public/shared/calc.js` | 실질비용/할인 계산 단일 진실 공급원 |
| `src/server.js` | HTTP 서버, CORS, API 라우팅, 주소/주유소 orchestration |
| `src/opinet.js` | Opinet 호출, 호출량 안전장치, 상세조회 |
| `src/opinetCache.js` | 상세조회 캐시 |
| `src/opinetMapper.js` | Opinet 원본 → 앱 데이터 변환 |
| `src/coordinate.js` | WGS84 ↔ KATEC 변환 |
| `src/calculator.js` | 서버 쪽 공유 계산 wrapper |
| `src/discount.js` | 할인 계산 wrapper |
| `src/gangneungPayStations.js` | 공식 강릉페이 일반 주유소 고정 목록 |
| `src/localpayMatcher.js` | 오피넷 주유소 ↔ 강릉페이 공식 목록 매칭 |
| `src/gangneungPayStatus.js` | 강릉페이 표시 상태 생성 |
| `src/searchGeometry.js` | 10km 확장 검색 중심점/거리 계산 |
| `src/testLocalpayMatcher.js` | 강릉페이 매칭 로컬 테스트 |
| `README.md` | 사람용 프로젝트 설명 |
| `PROJECT_RULES.md` | AI/Claude/개발자 작업 기준 |
| `VERSION_NOTES.md` | 현재 버전의 구체적인 변경 기록 |

---

## 8. 가장 위험한 변경 패턴

### 하지 말 것

- `public/index.html` 마지막에 CSS/JS override를 무조건 계속 덧붙이기
- 이전 버전의 함수 이름을 추측해서 호출하기
- 함수를 다른 함수 내부에 넣어 스코프를 깨뜨리기
- 이벤트 리스너 대상 DOM ID를 변경하고 코드의 참조를 함께 바꾸지 않기
- 프론트 코드만 수정하고 API 응답 형식을 확인하지 않기
- API 키를 HTML/JS에 직접 하드코딩하기
- Opinet 상세조회를 모든 주유소에 일괄 적용하기
- API 실패를 정상적인 `0개` 결과로 변환하기
- 사용자 UX를 바꾸면서 README/VERSION_NOTES를 업데이트하지 않기

### 특히 `public/index.html` 수정 시

현재 파일은 CSS와 JavaScript가 많이 누적된 모놀리식 파일입니다.

따라서 수정자는 반드시:

1. 기존 DOM ID 확인
2. 기존 함수 정의 위치 확인
3. 기존 이벤트 연결 확인
4. 동일 기능의 이전 구현이 이미 있는지 확인
5. 수정 후 전체 파일 기준으로 문법 검사
6. 초기화 함수에서 오류가 발생해 전체 UI가 죽지 않는지 확인

순으로 작업합니다.

---

## 9. 작업 전 확인 순서

모든 수정 작업은 아래 순서를 따릅니다.

1. `PROJECT_RULES.md` 읽기
2. `README.md` 읽기
3. `VERSION_NOTES.md` 읽기
4. 현재 Git/ZIP의 실제 파일을 기준으로 수정
5. 기존 기능을 제거하거나 이름을 바꾸기 전에 이 문서의 UX 기준과 대조
6. 변경 후 테스트
7. `VERSION_NOTES.md`에 변경점 기록
8. 최종 ZIP에는 `node_modules`, `.env`, `__pycache__`, `*.pyc`를 포함하지 않기

---

## 10. 테스트 최소 기준

### 항상 실행

```powershell
node --check src/server.js
```

그리고 `src/*.js`, `public/index.html`의 module script를 전부 문법 검사합니다.

### 강릉페이 매칭

```powershell
npm run test:localpay-match
```

### 10km 확장 검색 기하

```powershell
npm run test:search-geometry
```

### ZIP 배포본 검사

```powershell
unzip -t FuelFinder-reviewed-vXX.zip
```

### 실제 API 런타임 테스트

오피넷/카카오 키와 네트워크가 있는 환경에서만 수행할 수 있습니다.
이 환경에서 실행하지 못했다면 결과를 **검증 완료라고 주장하지 않습니다.**

---

## 11. 현재 알려진 외부 의존성 문제

### Kakao REST API 403

현재 v26 로그에서 다음 현상이 관찰되었습니다.

```text
[카카오 역지오코딩 실패] Kakao REST API HTTP 403
```

이것은 Opinet 주유소 검색과 별개입니다.
REST API 키 자체가 존재해도 Kakao Local 관련 API 사용 권한/설정이 맞지 않으면 403이 날 수 있습니다.

주소 표시 기능은 가능하면 OSM fallback을 사용하되, 정상적인 도로명 주소 품질을 위해 Kakao Local이 정상이어야 합니다.

### Opinet 호출 한도

내부 안전 한도는 기본 280회이며 프로세스 메모리 기준입니다.
Render 재시작 시 내부 카운터는 초기화되므로 **이 카운터만으로 실제 Opinet 계정의 일일 사용량을 보장할 수 없습니다.**

---

## 12. 변경 이력 규칙

버전마다 최소한 다음을 기록합니다.

```text
버전
변경 파일
사용자에게 보이는 변경
API/데이터 구조 변경
주의사항
테스트 결과
실제 API 테스트 여부
```

특히 큰 UI 변경이나 API 구조 변경이 있으면 **이전 버전으로 되돌릴 수 있는 ZIP 체크포인트를 반드시 남깁니다.**

---

## 13. 한 문장 요약

> **FuelFinder는 모바일 전용 Static Site + API Web Service 구조이며, Opinet을 가격 원본으로 사용하고, 현재 위치 자동검색과 설정형 검색을 제공하며, 실질비용 계산과 지도 길찾기를 주유소 카드 중심으로 제공하는 앱이다.**
