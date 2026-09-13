# legacy/

이 폴더의 파일은 **현재 운영 서버(`src/server.js`)가 사용하지 않는 이전 구현**입니다.
실수로 다시 import되는 것을 막기 위해 `src/` 최상위에서 분리해 두었습니다.

## 무엇이고 왜 남겨뒀는가

- `localpay.js` — 한국조폐공사 지역화폐 가맹점 **실시간 조회 API** 클라이언트
- `localpayMapper.js` — 위 API 응답을 정규화하고 매칭하던 초기 매칭 엔진
- `location.js`, `distance.js` — 초기 버전에서 쓰던 위치 유틸리티 (Haversine 거리 계산 등). 어디서도 참조되지 않음
- `testLocalpay.js`, `testLocalpayGasStations.js`, `testCompareLocalPay.js` — 위 파일들을 테스트하던 스크립트

## 현재는 무엇으로 대체되었는가

- 강릉페이 매칭: `src/gangneungPayStations.js`(수동 관리 고정 명단) + `src/localpayMatcher.js`(이름·주소 기반 매칭 엔진)
- 이 조합이 `server.js`에서 실제로 사용되는 구현입니다.

## 앞으로

- 한국조폐공사 API를 다시 붙여 명단을 자동 갱신할 계획이 생기면 이 폴더의 `localpay.js`를 참고용으로 재활용할 수 있습니다.
- 그런 계획이 없다면 이 폴더는 통째로 삭제해도 운영에는 영향이 없습니다.
- `render.yaml` / `.env`에 등록된 `LOCALPAY_SERVICE_KEY`는 이 폴더의 코드에서만 사용되며, 운영 서버는 사용하지 않습니다.
