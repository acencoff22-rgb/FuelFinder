# FuelFinder 정적 프론트 + API 분리 배포

목표는 Render Free Web Service의 sleep/cold-start 화면을 사용자가 보지 않게 하는 것입니다.

## 구조

- `fuelfinder-web`: Render Static Site. FuelFinder 화면을 즉시 표시합니다.
- `fuelfinder`: 기존 Render Web Service. 오피넷/주소검색/카카오 설정 등 API만 담당합니다.

정적 사이트는 CDN에서 제공되므로 Web Service처럼 sleep하지 않습니다.

## 1. GitHub에 코드 반영

이 프로젝트 전체를 기존 `FuelFinder` 저장소에 올립니다.

## 2. Render에서 Static Site 생성

Render Dashboard → **New → Static Site**

- Repository: 기존 FuelFinder 저장소
- Branch: 현재 배포 브랜치
- Root Directory: 비워둠
- Build Command:
  `echo "FuelFinder static frontend ready"`
- Publish Directory:
  `public`
- Service Name:
  `fuelfinder-web`

배포가 끝나면 새 주소가 생깁니다. 예:

`https://fuelfinder-web.onrender.com`

Render가 다른 URL을 부여하면 실제 URL을 사용합니다.

## 3. 기존 API Web Service 환경변수

기존 `fuelfinder` Web Service → Environment에서:

- `OPINET_CERTKEY`: 기존 값 유지
- `KAKAO_JAVASCRIPT_KEY`: 기존 값 유지
- `KAKAO_REST_API_KEY`: 카카오디벨로퍼스 FuelFinder 앱의 REST API 키
- `FRONTEND_ORIGINS`: 새 Static Site URL

예:

`https://fuelfinder-web.onrender.com`

저장 후 기존 API Web Service를 한 번 재배포합니다.

## 4. 카카오 JavaScript SDK 도메인

카카오디벨로퍼스 → FuelFinder 앱 → 플랫폼 → Web 플랫폼에 **새 Static Site URL**을 추가합니다.

예:

`https://fuelfinder-web.onrender.com`

기존 API 주소를 삭제할 필요는 없습니다.

## 5. 실제 사용자에게 알려줄 주소

기존:

`https://fuelfinder-ejo2.onrender.com`

이 주소는 API 서버이므로 사용자용 주소로 쓰지 않습니다.

새 주소:

`https://fuelfinder-web.onrender.com`

이 주소를 FuelFinder 사용자용 주소로 사용합니다.

## 6. 동작 방식

휴대폰에서 새 Static Site에 접속하면 화면은 즉시 표시됩니다.

앱이 처음 열리면 현재 위치를 확인하고 기존 API 서버에 주변 주유소 검색을 요청합니다. 다른 위치가 필요할 때만 설정에서 주소·장소를 검색합니다. API가 잠들어 있어도 사용자는 Render의 기본 로딩 화면이 아니라 FuelFinder 자체의 `주유소 정보를 불러오는 중입니다.` 상태를 보게 됩니다.

## 참고

`public/config.js`의 `apiBaseUrl`은 현재 API 주소인:

`https://fuelfinder-ejo2.onrender.com`

으로 설정되어 있습니다. API 주소를 변경하면 이 파일도 수정해야 합니다.


### 추가 환경변수

Render API Web Service에 `KAKAO_REST_API_KEY`를 등록하세요. 카카오디벨로퍼스 FuelFinder 앱의 REST API 키를 사용합니다. 이 키는 브라우저가 아니라 서버 환경변수에만 넣습니다.


### v26 API 연결 주의
- Static Site에서 API Web Service로 보내는 요청은 CORS가 필요합니다.
- API 서버는 `FRONTEND_ORIGINS`에 명시된 origin만 허용합니다.
- 외부 도메인을 사용하면 `FRONTEND_ORIGINS`에 정확한 origin을 추가하세요.
- `KAKAO_REST_API_KEY`와 `KAKAO_JAVASCRIPT_KEY`는 서로 다른 용도이며, REST 키는 Web Service에만 둡니다.
