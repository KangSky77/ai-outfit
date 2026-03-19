# 📸 AI Outfit Closet (거울 셀카 분석기)
> **2013년형 삼성 구형 데스크탑을 활용한 AI 홈 서버 프로젝트**

## ✨ 프로젝트 소개
사용자가 찍은 거울 셀카를 분석하여, 현재 위치의 날씨와 조화를 이루는지 Gemini AI가 판단해주는 웹 서비스입니다. 구형 하드웨어의 한계를 리눅스 서버 기술로 극복한 개인 포트폴리오 프로젝트입니다.

## 🛠 Tech Stack
- **OS**: Ubuntu 22.04 LTS (Home Server)
- **Backend**: Node.js, Express, Passport.js
- **Frontend**: Vue.js 3, HTML5 Geolocation API
- **AI/API**: Google Gemini Flash Lite, OpenWeatherMap API
- **Infra**: Nginx (Reverse Proxy), Certbot (SSL/HTTPS), PM2, DuckDNS

## 🚀 주요 특징
- **Storage Optimization**: Symbolic Link를 활용해 2번 HDD(458GB)를 메인 저장소로 사용.
- **Security**: Fail2Ban 및 SSH 포트 변경으로 서버 보안 강화.
- **Automation**: PM2 Startup 설정을 통해 서버 부팅 시 서비스 자동 실행.
- **Context-Aware**: 사용자의 실시간 GPS 정보를 기반으로 맞춤형 날씨 조언 제공.

## 🥊 Troubleshooting (5일간의 도전)
- `sudo` 권한 소실 문제를 리커버리 모드에서 `chmod 4755` (SetUID) 설정을 통해 복구.
- Nginx 심볼릭 링크 깨짐 현상을 설정 파일 수동 재작성으로 해결.
