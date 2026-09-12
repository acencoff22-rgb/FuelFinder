# FuelFinder

주유소 표시가격뿐 아니라 차량 연비와 이동비를 반영해 실질 주유비를 비교하는 Node.js 웹 앱입니다.

## 현재 기능

- 오피넷 주변 주유소 검색
- 보통휘발유 / 고급휘발유 / 자동차용경유
- 차량 주유량 및 연비 반영
- 왕복 이동비 반영
- 일반 할인 계산
- 강릉페이 공식 주유소 목록 기반 매칭
- 상호명과 주소를 이용한 주유소 식별
- 오피넷 상세정보 선택 조회
- `UNI_ID` 기준 7일 로컬 캐시
- 실질가격순 정렬

## 로컬 실행

```powershell
npm.cmd install
npm.cmd start
```

브라우저: `http://localhost:3000`

## 환경변수

`.env.example`을 참고해 `.env`를 만들고 다음 값을 설정합니다.

```text
OPINET_CERTKEY=...
LOCALPAY_SERVICE_KEY=...
```

`.env`는 GitHub에 올리지 않습니다.

## Render

이 저장소는 Render Web Service 기준으로 구성되어 있습니다. `render.yaml`을 사용할 수 있습니다.

- Build Command: `npm ci`
- Start Command: `npm start`
- Health Check Path: `/health`

Render 환경변수에 `OPINET_CERTKEY`, `LOCALPAY_SERVICE_KEY`를 등록합니다. Render Web Service는 `PORT` 환경변수를 제공하며 서버는 이를 사용합니다.

## 캐시

오피넷 상세정보는 `UNI_ID` 기준으로 최대 7일간 로컬 캐시합니다. Render의 일반 로컬 파일은 영구 저장소가 아니므로 캐시는 재배포나 인스턴스 교체 후 사라질 수 있습니다.

## 주의

강릉페이 10% 캐시백 정책의 적용 여부와 기간은 별도로 관리해야 합니다. 현재 저장소의 `src/gangneungPayStations.js`는 제공받은 공식 사용 주유소 목록을 기준으로 합니다.
