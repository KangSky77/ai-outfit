🗓️ 5일간의 'AI 옷장' 서버 구축 대장정 요약
날짜	주요 진행 상황	핵심 이슈 및 해결
1일차	프로젝트 설계 및 기초 공사	'우리 집 냉장고' 앱에서 **'거울 셀카 분석기'**로 아이디어 확장. Node.js 환경 구축.
2일차	하드웨어 확장 (2013년형 삼성 PC)	부족한 SSD 용량을 해결하기 위해 **2번 하드디스크(458GB)**를 심볼릭 링크로 연결하여 저장소 확보.
3일차	지능형 기능 결합 (AI & 날씨)	Gemini 1.5 Flash API 연동. 브라우저 GPS와 OpenWeather API를 결합해 '상황 맞춤형' 코디 조언 구현.
4일차	보안 및 인증 (Google Login)	Google OAuth 2.0 연동. Passport.js를 이용한 안전한 사용자 인증 시스템 구축.
5일차	'운명의 권한 전쟁' & 배포	chown 실수로 발생한 Sudo 권한 상실 위기를 리커버리 모드에서 SetUID(s) 비트 복구로 해결. Nginx(HTTPS) 및 PM2(자동 부팅) 적용 완료.

이 코드는 고생하며 완성한 모든 기능(OAuth, Gemini, Weather, SQLite, Symlink Storage)이 집약된 결정체입니다.

# 📸 AI Outfit Closet (거울 셀카 분석기)
> **2013년형 삼성 구형 데스크탑을 활용한 AI 홈 서버 프로젝트**

## ✨ 프로젝트 소개
사용자가 찍은 거울 셀카를 분석하여, 현재 위치의 날씨와 조화를 이루는지 Gemini AI가 판단해주는 웹 서비스입니다. 구형 하드웨어의 한계를 리눅스 서버 기술로 극복한 개인 포트폴리오 프로젝트입니다.

## 🛠 Tech Stack
- **OS**: Ubuntu 22.04 LTS (Home Server)
- **Backend**: Node.js, Express, Passport.js
- **Frontend**: Vue.js 3, HTML5 Geolocation API
- **AI/API**: Google Gemini 1.5 Flash, OpenWeatherMap API
- **Infra**: Nginx (Reverse Proxy), Certbot (SSL/HTTPS), PM2, DuckDNS

## 🚀 주요 특징
- **Storage Optimization**: Symbolic Link를 활용해 2번 HDD(458GB)를 메인 저장소로 사용.
- **Security**: Fail2Ban 및 SSH 포트 변경(20477)으로 서버 보안 강화.
- **Automation**: PM2 Startup 설정을 통해 서버 부팅 시 서비스 자동 실행.
- **Context-Aware**: 사용자의 실시간 GPS 정보를 기반으로 맞춤형 날씨 조언 제공.

## 🥊 Troubleshooting (5일간의 도전)
- `sudo` 권한 소실 문제를 리커버리 모드에서 `chmod 4755` (SetUID) 설정을 통해 복구.
- Nginx 심볼릭 링크 깨짐 현상을 설정 파일 수동 재작성으로 해결.
