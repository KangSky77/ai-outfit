# 📸 AI Closet — 스마트 스타일 가이드

거울 셀카를 올리면 **현재 위치의 날씨**와 **시즌 트렌드**를 반영해 **Gemini AI**가 오늘의 코디를 분석·추천해주는 웹 서비스입니다.
2013년형 구형 데스크탑을 리눅스 홈서버로 개조해 직접 배포했습니다.

## 🛠 기술 스택
- **Frontend**: React 18, Vite, HTML5 Geolocation, PWA(서비스워커)
- **Backend**: Node.js, Express 5, Passport(Google OAuth)
- **DB**: SQLite3 (코디 기록 / 좋아요 / 세션)
- **AI / API**: Google Gemini (이미지 분석), OpenWeatherMap (날씨)
- **이미지**: sharp (EXIF 회전 보정·리사이즈·압축)
- **Infra**: Nginx(리버스 프록시), Certbot(HTTPS), PM2, DuckDNS

## ✨ 주요 기능
- 구글 로그인(OAuth)
- 셀카 업로드 → 날씨·시즌 반영 AI 코디 분석(섹션 구조화 결과)
- 나의 기록 / 커뮤니티 공개 갤러리 / 좋아요(중복 방지) / 삭제
- 기록 상세 모달, 기록 검색, 결과 공유(Web Share)
- 다크모드, 한/영 자동 전환, 홈 화면 앱 설치(PWA)

## 🚀 실행 방법
```bash
npm install
cp .env.example .env   # 키 입력 (아래 환경변수)

# 개발 (Vite 5173 + Express 7704 동시, API 프록시)
npm run dev

# 배포 (React 빌드 후 Express가 dist 서빙)
npm run build
npm start              # 또는: pm2 start server.js --name ai-outfit
```

## 🔑 환경변수 (.env)
| 키 | 설명 |
|---|---|
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | 구글 OAuth (필수) |
| `GOOGLE_CALLBACK_URL` | 콜백 URL (HTTPS, 구글 콘솔 등록값과 일치) |
| `GEMINI_API_KEY` | Google Gemini (필수) |
| `WEATHER_API_KEY` | OpenWeatherMap (선택) |
| `SESSION_SECRET` | 세션 암호화 키 (필수) |
| `NODE_ENV` | `production` 시 secure 쿠키 |

> ⚠️ `GOOGLE_CLIENT_ID` · `GOOGLE_CLIENT_SECRET` · `GEMINI_API_KEY` · `SESSION_SECRET` 가 없으면 서버가 시작되지 않습니다.

## 📁 구조
```
server.js              # Express API (인증/분석/DB)
src/                   # React (App → Login / MainApp → 탭 컴포넌트)
  components/ api.js i18n.js theme.js
static/                # 빌드 시 dist로 복사 (아이콘/manifest/sw)
dist/                  # 빌드 결과 (Express가 서빙)
```

## 🔒 보안
- 서버 측 인증 미들웨어(`requireAuth`)로 개인 기록·분석·삭제 API 보호
- HTTPS(Nginx) + secure/sameSite 쿠키 + `trust proxy`
- helmet 보안 헤더, AI 분석 레이트리밋, 업로드 타입·크기 제한
- sharp 재인코딩으로 EXIF(GPS) 자동 제거, 무작위 파일명
- node는 루프백(127.0.0.1/::1)에만 바인딩 → 외부 직접접속 차단
