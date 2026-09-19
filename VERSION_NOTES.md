# v26 검수 및 수정 메모

## 코드 변경

- Static Site → API Web Service CORS 문제 보강
- Render `*.onrender.com` HTTPS origin 허용
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
