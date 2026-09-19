# FuelFinder

주유소의 표시가격만 비교하지 않고 **차량 연비, 왕복 이동비, 할인**을 반영해 실질 주유비를 계산하는 모바일 전용 웹앱입니다.

> 현재 기준 버전: **v26**

## 먼저 읽을 문서

- **`PROJECT_RULES.md`**: 현재 구조, UX 기준, 인증키, API 한도, 수정 규칙. AI/Claude가 작업할 때 가장 먼저 읽습니다.
- **`CHANGELOG.md`**: v1 이후 주요 변경 의도와 회귀 방지 기록
- **`VERSION_NOTES.md`**: 직전 버전의 구체적인 변경 기록
- **`DEPLOY-STATIC.md`**: Render 배포 절차

README를 읽었다면 반드시 `PROJECT_RULES.md`까지 확인해야 현재 구조를 오해하지 않습니다.

## 현재 구조

```text
사용자 휴대폰
  ↓
Render Static Site: fuelfinder-web
  ↓ API 호출
Render Web Service: fuelfinder
  ├─ Opinet
  ├─ Kakao Local REST
  └─ OpenStreetMap Nominatim fallback
```

GitHub 저장소는 하나만 사용합니다. Render Project도 하나이며, 그 안에 Static Site와 Web Service가 함께 있습니다.

### 서비스 역할

**Static Site**
- `public/` 정적 화면 제공
- 사용자용 주소
- Render Web Service의 sleep 화면을 직접 노출하지 않음

**Web Service**
- `/api/nearby-stations`
- `/api/geocode`
- `/api/reverse-geocode`
- `/api/config`
- `/health`
- Opinet/Kakao 서버 API 호출
- CORS 처리

## 핵심 기능

- 현재 위치 자동 검색
- 주소/장소명 검색
- 보통휘발유 / 고급휘발유 / 자동차용경유
- 3km / 5km / 10km 검색
- 차량 주유량/연비 반영
- 왕복 이동비 반영
- 할인 계산
- 강릉페이 공식 목록 기반 매칭
- 실질비용순 / 주유가격순 / 거리순 정렬
- 강릉페이만 보기
- 3일 이상 지난 가격 제외
- 가격 기준일 표시
- 최근 위치
- 네이버 길찾기 / 카카오내비

## 현재 UX 원칙

- 모바일 전용
- 첫 진입 시 현재 위치 자동 검색
- 검색창은 자동으로 현재 위치 주소를 채우지 않음
- 검색 아이콘은 검색창 옆 한 줄
- 위치/반경/필터/차량 설정은 설정창
- 메인 화면은 주유소 카드가 중심
- 별도 베스트 카드 없음
- 도착 위치 확인 기능 없음
- 주유소 카드의 `길찾기` 또는 카드 탭으로 네이버/카카오내비 선택
- 실질가격을 카드에서 가장 크게 표시
- 총 부담액/주유비/이동비/할인은 필요한 경우 상세 계산에서 확인

## 계산 기준

실질 주유비는 다음을 사용합니다.

```text
주유비 = 가격/L × 주유량
왕복거리 = 편도거리 × 2
이동연료량 = 왕복거리 ÷ 연비
이동비 = 이동연료량 × 주유소 가격
실질총비용 = 할인 적용 주유비 + 이동비
실질가격 = 실질총비용 ÷ 주유량
```

계산의 단일 진실 공급원은 `public/shared/calc.js`입니다.

## Opinet 사용 주의

- `aroundAll.do`의 단일 조회 반경은 최대 5km
- 앱의 10km 검색은 여러 기준점 조회 결과를 합침
- 일반 API는 하루 300회 수준의 호출 한도
- 앱 내부 안전 한도 기본값은 280회
- 주변검색은 10분 캐시
- 상세정보는 `UNI_ID` 기준 24시간 캐시
- 상세조회는 필요한 후보만 수행

**중요:** Opinet API 오류/한도초과와 실제 주변 주유소 0곳은 반드시 구분해야 합니다.

## 가격 최신성

`aroundAll.do`에는 가격 기준일이 없기 때문에 `detailById.do`의 `TRADE_DT`/`TRADE_TM`을 사용합니다.

- 기본: 3일 이상 지난 가격 제외
- 설정에서 해제 가능
- 기준일 확인 불가 주유소는 별도로 표시

## 주소/현재 위치

### 검색

1. Kakao Local REST
2. 결과가 없거나 사용할 수 없으면 OpenStreetMap Nominatim fallback

### 현재 위치 주소

1. Kakao 좌표→주소
2. Kakao 좌표→행정동/법정동
3. OpenStreetMap fallback

주소 확인이 실패해도 **GPS 좌표를 확보했다면 주유소 검색은 계속**합니다.

## 환경변수

### Render Web Service

```text
OPINET_CERTKEY=...
KAKAO_REST_API_KEY=...
KAKAO_JAVASCRIPT_KEY=...
FRONTEND_ORIGINS=https://fuelfinder-web.onrender.com
```

- `OPINET_CERTKEY`: 서버 전용
- `KAKAO_REST_API_KEY`: 서버 전용, 브라우저에 노출 금지
- `KAKAO_JAVASCRIPT_KEY`: 웹 SDK용 클라이언트 키, `/api/config`로 전달
- `FRONTEND_ORIGINS`: CORS 명시 origin

카카오 로그인 리다이렉트 URI는 사용하지 않습니다.

## 로컬 실행

```powershell
npm.cmd install
npm.cmd start
```

기본 주소:

`http://localhost:3000`

## 기본 검증

```powershell
node --check src/server.js
npm.cmd run test:localpay-match
```

`src/*.js`와 `public/index.html`의 module script 전체 문법 검사도 수행합니다.

실제 Opinet/Kakao 연동은 해당 키와 네트워크가 있는 환경에서 별도로 검증합니다.

## 배포

상세 절차는 `DEPLOY-STATIC.md`를 따릅니다.

사용자에게 제공하는 주소는 Static Site입니다. API Web Service 주소를 사용자에게 직접 사용시키지 않습니다.

## 파일 제외

다음 파일은 커밋/배포하지 않습니다.

```text
node_modules/
.env
__pycache__/
*.pyc
data/opinet-station-details.json
```

## 변경할 때

1. `PROJECT_RULES.md` 확인
2. 변경 전 기존 함수/DOM ID/API 응답 확인
3. 전체 기능이 유지되는지 검증
4. 문법 검사
5. `VERSION_NOTES.md` 및 `CHANGELOG.md` 갱신
6. 새 버전 ZIP 체크포인트 생성
