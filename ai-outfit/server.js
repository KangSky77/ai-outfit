require("dotenv").config();
const express = require("express");
const multer = require("multer");
const { GoogleGenerativeAI } = require('@google/generative-ai');
const path = require("path");
const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();
const session = require('express-session');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const sharp = require('sharp');                 // 이미지 리사이즈/압축
const helmet = require('helmet');               // 보안 HTTP 헤더
const rateLimit = require('express-rate-limit'); // 요청 빈도 제한
const SQLiteStore = require('connect-sqlite3')(session); // 세션을 파일 DB에 저장
const crypto = require('crypto'); // 무작위 파일명 생성

const app = express();
// Nginx(HTTPS) 리버스 프록시 뒤에서 동작한다. X-Forwarded-Proto 를 신뢰해야
// secure 쿠키가 정상적으로 발급된다.
app.set('trust proxy', 1);
const port = process.env.PORT || 7704;
// 운영(프로덕션, HTTPS)인지 여부 — 쿠키 secure 설정에 사용
const isProd = process.env.NODE_ENV === 'production';

// ─────────────────────────────────────────────
// 0. 필수 환경변수 검사 (서버가 "왜 안 켜지는지" 명확히 알려주기)
//    .env 가 없으면 passport 가 알 수 없는 스택트레이스를 뱉으며 죽는다.
//    그 전에 사람이 읽을 수 있는 메시지로 바로 알려주고 종료한다.
// ─────────────────────────────────────────────
const REQUIRED_ENV = ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GEMINI_API_KEY', 'SESSION_SECRET'];
const missing = REQUIRED_ENV.filter((k) => !process.env[k]);
if (missing.length > 0) {
    console.error('\n❌ 서버를 시작할 수 없습니다. 다음 환경변수가 .env 에 없습니다:');
    missing.forEach((k) => console.error(`   - ${k}`));
    console.error('\n👉 프로젝트 루트에 .env 파일을 만들고 키를 채워주세요. (.env.example 참고)\n');
    process.exit(1);
}

// ─────────────────────────────────────────────
// 1. DB — 초기화(스키마/마이그레이션/인덱스) + Promise 헬퍼
//    sqlite3 는 콜백 기반이라 그대로 쓰면 라우트가 중첩 콜백으로 깊어진다.
//    아래 세 헬퍼로 감싸서 모든 라우트를 async/await 로 평탄하게 쓴다.
//    (Express 5 는 async 라우트의 예외를 자동으로 에러 핸들러에 전달한다)
// ─────────────────────────────────────────────
const db = new sqlite3.Database('./closet.db');

const dbGet = (sql, params = []) => new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => (err ? reject(err) : resolve(row)));
});
const dbAll = (sql, params = []) => new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows)));
});
// resolve 값: { lastID, changes } — INSERT 한 행의 id 나 영향받은 행 수가 필요할 때 사용
const dbRun = (sql, params = []) => new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
        if (err) return reject(err);
        resolve({ lastID: this.lastID, changes: this.changes });
    });
});

db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS outfits (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT,       -- 구글 로그인 유저의 고유 ID 또는 익명 세션 ID(anon:uuid)
        image_path TEXT,    -- 사진이 저장된 경로
        analysis TEXT,      -- 제미나이가 분석해준 내용
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);

    // 기존 DB에 컬럼이 없으면 추가 (마이그레이션).
    // 이미 컬럼이 있으면 "duplicate column name" 에러가 나는데 무시한다.
    const addColumn = (ddl) => db.run(ddl, (err) => {
        if (err && !/duplicate column/i.test(err.message)) {
            console.error('컬럼 추가 실패:', err.message);
        }
    });
    addColumn(`ALTER TABLE outfits ADD COLUMN is_public INTEGER DEFAULT 0`); // 커뮤니티 공개
    addColumn(`ALTER TABLE outfits ADD COLUMN likes INTEGER DEFAULT 0`);     // 좋아요 수

    // 좋아요 중복 방지: 유저-코디 쌍을 기록 (PRIMARY KEY로 같은 사람이 같은 글 두 번 못 누름)
    db.run(`CREATE TABLE IF NOT EXISTS outfit_likes (
        user_id TEXT,
        outfit_id INTEGER,
        PRIMARY KEY (user_id, outfit_id)
    )`);

    // 인덱스 — 데이터가 많아져도 조회가 빠르도록 (자주 쓰는 WHERE 컬럼에 생성)
    db.run(`CREATE INDEX IF NOT EXISTS idx_outfits_user ON outfits(user_id)`);          // 내 기록 조회
    db.run(`CREATE INDEX IF NOT EXISTS idx_outfits_public ON outfits(is_public, created_at)`); // 공개 갤러리
    db.run(`CREATE INDEX IF NOT EXISTS idx_outfits_image ON outfits(image_path)`);      // 이미지 접근 제어 조회
    db.run(`CREATE INDEX IF NOT EXISTS idx_likes_outfit ON outfit_likes(outfit_id)`);   // 좋아요 집계
});

// ─────────────────────────────────────────────
// 2. 보안 헤더 + 남용 방지 가드
// ─────────────────────────────────────────────

// CSP(콘텐츠 보안 정책)로 XSS 심층 방어. 이 앱이 실제로 쓰는 출처만 허용한다:
//  - 스크립트: 자기 자신만 (Vite 빌드는 외부 모듈 스크립트, 인라인 스크립트 없음)
//  - 스타일/폰트: Pretendard(jsdelivr) + Material Symbols(google fonts)
//  - 이미지: 자기 자신 + data:/blob: (파비콘·캔버스 등)
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net", "https://fonts.googleapis.com"],
            fontSrc: ["'self'", "https://cdn.jsdelivr.net", "https://fonts.gstatic.com"],
            imgSrc: ["'self'", "data:", "blob:"],
            connectSrc: ["'self'"],
            manifestSrc: ["'self'"],
            workerSrc: ["'self'"],
            objectSrc: ["'none'"],
            frameAncestors: ["'self'"],
        },
    },
}));

// AI 분석은 비용이 드는 외부 호출이라 남용 방지용 레이트리밋.
// 로그인 없이 누구나 호출할 수 있으므로 IP당 분당 한도를 두되,
// 익명(비로그인)은 더 엄격하게 제한한다.
const analyzeLimiter = rateLimit({
    windowMs: 60 * 1000, // 1분
    max: (req) => (req.user ? 15 : 5), // 로그인 15회/분, 익명 5회/분
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.' },
});

// 전체(글로벌) 일일 분석 상한 — IP를 우회해도 하루 총 호출 수를 막아
// Gemini API 비용/디스크 폭증을 방지한다. (자정 기준 자동 리셋, 재시작 시도 리셋)
const DAILY_ANALYSIS_CAP = Number(process.env.DAILY_ANALYSIS_CAP) || 300;
let dailyCounter = { day: new Date().toDateString(), count: 0 };
const underDailyCap = () => {
    const today = new Date().toDateString();
    if (dailyCounter.day !== today) dailyCounter = { day: today, count: 0 };
    return dailyCounter.count < DAILY_ANALYSIS_CAP;
};
// 일일 상한을 넘으면 무거운 업로드/AI 처리 전에 차단한다.
const dailyCapGuard = (req, res, next) => {
    if (!underDailyCap()) {
        return res.status(429).json({ error: '오늘 분석 한도가 가득 찼어요. 내일 다시 시도해주세요.' });
    }
    next();
};

// ─────────────────────────────────────────────
// 3. 세션 / 로그인(passport) / 신원 미들웨어
// ─────────────────────────────────────────────
app.use(session({
    // 세션을 메모리가 아닌 파일 DB(sessions.db)에 저장 → 서버 재시작해도 로그인 유지
    store: new SQLiteStore({ db: 'sessions.db', dir: __dirname }),
    secret: process.env.SESSION_SECRET, // 필수 env 검사로 보장됨 (기본값 없음)
    resave: false,
    saveUninitialized: false,
    proxy: true,
    cookie: {
        // 운영(HTTPS)에서는 secure 쿠키. 로컬 http 테스트에서는 꺼서 세션이 유지되게 한다.
        secure: isProd,
        sameSite: 'lax', // 구글 OAuth 콜백은 top-level GET 이라 lax 로 충분
        maxAge: 1000 * 60 * 60 * 24, // 24시간
    },
}));
app.use(passport.initialize());
app.use(passport.session());

// 신원 부여 미들웨어 — 로그인 없이도 기능을 쓸 수 있게 한다.
//  - 로그인 유저: 구글 프로필 ID (예: "10934...")
//  - 비로그인 유저: 세션에 1회 발급한 익명 ID (예: "anon:uuid")
// 익명 ID는 세션 쿠키에 묶이므로, 같은 브라우저에서는 자기 기록만 격리되어 보인다.
// (쿠키를 지우면 익명 기록 접근은 잃는다 — 익명 사용자에겐 자연스러운 동작)
const attachUserId = (req, res, next) => {
    if (req.user) {
        req.appUserId = req.user.id;
    } else {
        if (!req.session.anonId) req.session.anonId = `anon:${crypto.randomUUID()}`;
        req.appUserId = req.session.anonId;
    }
    next();
};

// 신원을 "조회만" 한다 (새 익명 ID를 발급하지 않음).
// 이미지 접근 제어처럼, 신원이 없으면 그냥 권한 없음으로 처리하면 되는 곳에서 사용.
// (공개 이미지를 불러올 때마다 불필요하게 세션을 굽지 않도록)
const peekUserId = (req) => (req.user ? req.user.id : (req.session && req.session.anonId) || null);

passport.use(new GoogleStrategy({
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        // 실서비스는 Nginx HTTPS(443) 뒤에서 동작 → 콜백도 https, 포트 없음.
        // 구글 클라우드 콘솔의 승인된 리디렉션 URI 와 정확히 일치해야 한다.
        callbackURL: process.env.GOOGLE_CALLBACK_URL
            || "https://ai-outfit.duckdns.org/auth/google/callback",
    }, (accessToken, refreshToken, profile, done) => done(null, profile)));

// 세션 굽기/읽기 — 프로필 전체 대신 꼭 필요한 정보만 저장
passport.serializeUser((user, done) => done(null, {
    id: user.id,
    displayName: user.displayName,
}));
passport.deserializeUser((user, done) => done(null, user));

// ─────────────────────────────────────────────
// 4. 업로드(multer + sharp) / 정적 파일 / 이미지 접근 제어
// ─────────────────────────────────────────────

// 이미지 업로드 저장 폴더.
// 기본은 로컬 public/uploads 지만, .env 의 UPLOAD_DIR 로 외장 HDD/NAS 경로를
// 지정하면 시스템 디스크 대신 그쪽에 저장한다 (대용량 + 시스템디스크 보호).
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, 'public', 'uploads');
// 업로드 폴더 확보. HDD가 마운트되지 않았으면 생성에 실패할 수 있는데,
// 이때 서버 전체가 죽지 않도록 경고만 남기고 계속 진행한다.
try {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
    console.log(`📁 업로드 저장 폴더: ${UPLOAD_DIR}`);
} catch (e) {
    console.warn(`⚠️ 업로드 폴더를 준비하지 못했습니다 (${UPLOAD_DIR}): ${e.message}`);
    console.warn('   외장 HDD 마운트 상태를 확인하세요. 업로드는 실패할 수 있지만 서버는 계속 동작합니다.');
}

// 메모리에 받아서 sharp로 리사이즈/압축한 뒤 디스크에 저장한다.
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 }, // 업로드 원본 10MB 제한
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) return cb(null, true);
        cb(new Error('이미지 파일만 업로드할 수 있습니다.'));
    },
});
// multer 에러(용량 초과·형식 오류)를 500이 아닌 깔끔한 400 JSON 으로 변환한다.
const uploadSingle = (req, res, next) => upload.single('selfie')(req, res, (err) => {
    if (err) {
        const msg = err.code === 'LIMIT_FILE_SIZE'
            ? '이미지가 너무 커요 (최대 10MB).'
            : (err.message || '업로드 중 오류가 발생했습니다.');
        return res.status(400).json({ error: msg });
    }
    next();
});

// 업로드 원본을 웹 서빙용으로 최적화해서 UPLOAD_DIR 에 저장한다.
//  - EXIF 회전 보정(폰 사진 방향) + 1080px 리사이즈 + JPEG 80% 압축
//  - 재인코딩 과정에서 EXIF(GPS 포함)가 제거되고, 이미지로 위장한 악성 파일도 걸러진다
// 반환: { filename, filePath, buffer } — buffer 는 Gemini 전송에 재사용
async function optimizeAndSave(originalBuffer) {
    const filename = `${crypto.randomUUID()}.jpg`; // 충돌·추측 방지용 무작위 파일명
    const buffer = await sharp(originalBuffer)
        .rotate()
        .resize({ width: 1080, withoutEnlargement: true })
        .jpeg({ quality: 80 })
        .toBuffer();
    const filePath = path.join(UPLOAD_DIR, filename);
    fs.writeFileSync(filePath, buffer);
    return { filename, filePath, buffer };
}

// 빌드된 React 앱(dist) 서빙
app.use(express.static(path.join(__dirname, 'dist')));

// 업로드 이미지 서빙 — 접근 제어를 건다.
//  - 공개(is_public=1) 코디 이미지: 누구나 접근 가능 (커뮤니티 갤러리용)
//  - 비공개 이미지: 소유자(로그인 또는 같은 익명 세션)만 접근 가능
//  - 그 외에는 404 (존재 여부도 노출하지 않음)
// 이렇게 해서 "임의 이미지를 우리 도메인에 올려 무단 호스팅"하는 악용을 막는다.
app.get('/uploads/:filename', async (req, res) => {
    const filename = path.basename(req.params.filename); // 경로 조작 방지
    const row = await dbGet(`SELECT user_id, is_public FROM outfits WHERE image_path = ?`, [`/uploads/${filename}`]);
    const allowed = row && (row.is_public === 1 || row.user_id === peekUserId(req));
    if (!allowed) return res.status(404).end(); // 권한 없으면 "없음"으로 응답
    res.sendFile(path.join(UPLOAD_DIR, filename), {
        headers: { 'Cache-Control': 'private, max-age=86400' },
    }, (e) => { if (e && !res.headersSent) res.status(404).end(); });
});

// ─────────────────────────────────────────────
// 5. AI 분석 재료 — 계절 / 날씨 / 프롬프트
// ─────────────────────────────────────────────
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// 서버 날짜 기준 현재 계절 (시즌 트렌드 추천에 사용)
function getSeason(lang) {
    const month = new Date().getMonth() + 1;
    const idx = month >= 3 && month <= 5 ? 0 : month >= 6 && month <= 8 ? 1 : month >= 9 && month <= 11 ? 2 : 3;
    return (lang === 'English'
        ? ['spring', 'summer', 'autumn', 'winter']
        : ['봄', '여름', '가을', '겨울'])[idx];
}

// OpenWeather 에서 현재 날씨를 가져온다. 좌표가 있으면 그 위치, 없으면 인천 기본.
// 키가 없거나 호출이 실패해도 분석은 계속 가야 하므로 절대 throw 하지 않는다.
// 반환: { location, weather }
async function fetchWeather(coords) {
    const apiKey = process.env.WEATHER_API_KEY;
    let location = coords ? '사용자 현재 위치' : '인천';
    let weather = '날씨 정보 없음';
    if (!apiKey) return { location, weather };

    const query = coords ? `lat=${coords.lat}&lon=${coords.lon}` : 'q=Incheon';
    const url = `https://api.openweathermap.org/data/2.5/weather?${query}&appid=${apiKey}&units=metric&lang=kr`;

    // 날씨 API가 응답하지 않을 때 무한 대기하지 않도록 5초 타임아웃
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    try {
        const res = await fetch(url, { signal: controller.signal });
        const data = await res.json();
        if (res.ok) {
            weather = `온도: ${Math.round(data.main.temp)}도, 상태: ${data.weather[0].description}`;
            if (coords) location = data.name; // API가 알려주는 지역 이름으로 업데이트
        }
    } catch (err) {
        console.error('날씨 호출 실패:', err.message);
    } finally {
        clearTimeout(timer);
    }
    return { location, weather };
}

// Gemini 에게 보낼 스타일리스트 프롬프트.
// 결과를 프런트(AnalysisResult.jsx)가 섹션 단위로 파싱하므로 형식을 강제한다.
function buildPrompt({ location, weather, season, lang }) {
    return `
너는 전문 패션 스타일리스트야. 첨부된 이미지는 사용자의 오늘 옷차림 거울 셀카야.
현재 위치는 ${location}, 날씨는 [${weather}], 지금은 ${season} 시즌이야.

반드시 아래 형식 그대로 답변해줘. 각 섹션 사이에는 빈 줄(개행 2번)을 넣어.
- 섹션 제목 줄은 "이모지 + 제목"만 쓰고, 내용은 다음 줄부터 써.
- "추천 아이템"은 반드시 "- " 로 시작하는 목록으로 써.
- 각 내용은 친절하고 센스 있는 말투로 간결하게.

👕 스타일 분석
(색상 조화, 핏, 전체적인 인상을 2~3문장으로)

🌤 날씨 평가
(이 날씨에 이 옷차림이 적절한지 1~2문장으로)

👟 추천 아이템
- (보완하면 좋을 아이템 1)
- (보완하면 좋을 아이템 2)
- (보완하면 좋을 아이템 3)

🌟 시즌 트렌드
(요즘 ${season} 시즌에 유행하는 스타일을 반영해, 추가로 시도해보면 좋을 아이템이나 포인트 한 가지)

💡 한 줄 요약
(오늘 코디의 핵심을 한 문장으로)

IMPORTANT: 위 형식과 이모지는 그대로 두되, 모든 글(제목·내용)은 ${lang} 로 작성해줘.
`;
}

// ─────────────────────────────────────────────
// 6. 라우트
// ─────────────────────────────────────────────

// 유저가 "구글 로그인" 버튼을 누르면 이 주소로 옵니다.
app.get('/auth/google', passport.authenticate('google', { scope: ['profile', 'email'] }));
// 구글에서 로그인이 끝나면 다시 우리 서버로 돌아오는 주소입니다.
app.get('/auth/google/callback',
    passport.authenticate('google', { failureRedirect: '/' }), (req, res) => res.redirect('/'));
// 프론트엔드에서 "나 지금 로그인 되어있나?" 확인할 때 쓸 API
app.get('/api/user', (req, res) => res.json(req.user || null));

// 내 기록 조회 (로그인 유저 또는 익명 세션 본인 것만)
// liked: 현재 유저가 이 코디에 좋아요를 눌렀는지 (0/1)
app.get('/api/history', attachUserId, async (req, res) => {
    const rows = await dbAll(
        `SELECT o.*,
            EXISTS(SELECT 1 FROM outfit_likes l WHERE l.outfit_id = o.id AND l.user_id = ?) AS liked
         FROM outfits o WHERE o.user_id = ? ORDER BY o.created_at DESC`,
        [req.appUserId, req.appUserId]);
    res.json(rows);
});

// 커뮤니티에 공개된 코디들 (모든 유저 공통, likes 포함)
app.get('/api/public-gallery', attachUserId, async (req, res) => {
    const rows = await dbAll(
        `SELECT o.id, o.image_path, o.analysis, o.likes, o.created_at,
            EXISTS(SELECT 1 FROM outfit_likes l WHERE l.outfit_id = o.id AND l.user_id = ?) AS liked
         FROM outfits o WHERE o.is_public = 1 ORDER BY o.created_at DESC LIMIT 50`,
        [req.appUserId]);
    res.json(rows);
});

// 좋아요 토글 (유저/익명 세션당 1회, 다시 누르면 취소) → { likes, liked }
app.post('/api/outfits/:id/like', attachUserId, async (req, res) => {
    const outfitId = req.params.id;
    const userId = req.appUserId;

    const already = await dbGet(`SELECT 1 FROM outfit_likes WHERE user_id = ? AND outfit_id = ?`, [userId, outfitId]);
    if (already) {
        // 이미 눌렀음 → 취소
        await dbRun(`DELETE FROM outfit_likes WHERE user_id = ? AND outfit_id = ?`, [userId, outfitId]);
        await dbRun(`UPDATE outfits SET likes = MAX(likes - 1, 0) WHERE id = ?`, [outfitId]);
    } else {
        // 처음 누름 → 좋아요
        await dbRun(`INSERT INTO outfit_likes (user_id, outfit_id) VALUES (?, ?)`, [userId, outfitId]);
        await dbRun(`UPDATE outfits SET likes = likes + 1 WHERE id = ?`, [outfitId]);
    }
    const row = await dbGet(`SELECT likes FROM outfits WHERE id = ?`, [outfitId]);
    if (!row) return res.status(404).json({ error: '데이터 없음' });
    res.json({ likes: row.likes, liked: !already });
});

// 내 코디 삭제 (본인 것만 — 로그인/익명 모두 자기 것만). 업로드 파일도 같이 지운다.
app.delete('/api/outfits/:id', attachUserId, async (req, res) => {
    const { id } = req.params;
    const userId = req.appUserId;

    const row = await dbGet(`SELECT image_path FROM outfits WHERE id = ? AND user_id = ?`, [id, userId]);
    if (!row) return res.status(404).json({ error: '기록 없음' });

    // image_path 는 "/uploads/파일명" → 실제 저장 폴더(UPLOAD_DIR) 기준으로 변환
    const realPath = path.join(UPLOAD_DIR, path.basename(row.image_path));
    try { if (fs.existsSync(realPath)) fs.unlinkSync(realPath); } catch (e) { /* 파일 없어도 무시 */ }

    await dbRun(`DELETE FROM outfits WHERE id = ? AND user_id = ?`, [id, userId]);
    await dbRun(`DELETE FROM outfit_likes WHERE outfit_id = ?`, [id]); // 좋아요 기록도 정리 (고아 데이터 방지)
    res.json({ message: '삭제 완료' });
});

// 분석 및 저장 API (로그인 없이도 사용 가능 — 익명은 세션에 격리 저장)
// 흐름: 입력 검증 → 이미지 최적화·저장 → 날씨 조회 → Gemini 분석 → DB 저장
app.post('/analyze-outfit', attachUserId, analyzeLimiter, dailyCapGuard, uploadSingle, async (req, res) => {
    console.log("분석 요청 수신! 위치 정보 확인중...");

    let savedFilePath = null; // 실패 시 정리할 업로드 파일 경로
    try {
        if (!req.file) return res.status(400).json({ error: '이미지 업로드 실패.' });

        // 입력 정리 — 좌표는 숫자 + 유효 범위(위도 ±90, 경도 ±180)일 때만 사용
        const lat = Number(req.body.lat);
        const lon = Number(req.body.lon);
        const coords = (Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180)
            ? { lat, lon } : null;
        const lang = req.body.lang === 'English' ? 'English' : 'Korean'; // 답변 언어
        // 커뮤니티 공개는 로그인 사용자만 허용 (익명 공개 사진은 책임 추적이 안 되므로 차단).
        // 프런트가 보내더라도 서버에서 한 번 더 강제한다.
        const isPublic = (req.user && req.body.isPublic === 'true') ? 1 : 0;

        // 이미지 최적화 후 저장 (buffer 는 Gemini 전송에 재사용)
        const { filename, filePath, buffer } = await optimizeAndSave(req.file.buffer);
        savedFilePath = filePath;

        // 날씨 + 계절 → 프롬프트 구성
        const { location, weather } = await fetchWeather(coords);
        const prompt = buildPrompt({ location, weather, season: getSeason(lang), lang });

        // Gemini 멀티모달 분석
        dailyCounter.count += 1; // 실제 Gemini 호출 직전에 일일 카운터 증가
        const model = genAI.getGenerativeModel({ model: 'gemini-flash-lite-latest' });
        const result = await model.generateContent([
            prompt,
            { inlineData: { data: buffer.toString('base64'), mimeType: 'image/jpeg' } },
        ]);
        const analysis = result.response.text();

        // DB 저장 완료를 기다린 뒤 응답 (실패하면 catch 로)
        const { lastID: newId } = await dbRun(
            `INSERT INTO outfits (user_id, image_path, analysis, is_public) VALUES (?, ?, ?, ?)`,
            [req.appUserId, `/uploads/${filename}`, analysis, isPublic]);
        console.log(`${newId}번 코디(위치: ${location}, 공개: ${isPublic}) 저장 완료!`);

        res.json({ analysis, id: newId });

    } catch (error) {
        console.error('분석 중 에러 발생:', error);
        // 분석/저장이 실패하면 이미 저장된 이미지가 고아가 되므로 정리한다.
        if (savedFilePath) {
            try { fs.unlinkSync(savedFilePath); } catch (_) { /* 무시 */ }
        }
        res.status(500).json({ error: 'AI 분석 중 오류가 발생했습니다.' });
    }
});

app.get('/logout', (req, res, next) => {
    req.logout((err) => {
        if (err) return next(err);
        res.redirect('/'); // 로그아웃하면 다시 메인으로!
    });
});

// ─────────────────────────────────────────────
// 7. 에러 핸들러 / 서버 기동 / 안전한 종료
// ─────────────────────────────────────────────

// 최후의 에러 핸들러 — 처리되지 않은 에러(async 라우트의 reject 포함)가 와도
// 스택을 노출하지 않고 깔끔한 JSON 으로 응답한다. (4개 인자라 Express 가 에러 핸들러로 인식)
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
    console.error('처리되지 않은 에러:', err);
    if (res.headersSent) return;
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
});

// 보안: 외부에서 7704로 직접 접속하지 못하도록 루프백(localhost)에만 바인딩한다.
// 단, nginx의 proxy_pass(localhost)가 환경에 따라 IPv6(::1)로 풀릴 수 있어
// IPv4(127.0.0.1)와 IPv6(::1) 두 루프백 모두에 바인딩해야 502가 안 난다.
// (개발 등 외부 접근이 필요하면 HOST 환경변수로 0.0.0.0 지정 가능)
const http = require('http');
const servers = [];
const startOn = (addr) => {
    const server = http.createServer(app)
        .listen(port, addr, () => {
            const shown = addr.includes(':') ? `[${addr}]` : addr;
            console.log(`서버가 http://${shown}:${port} 에서 실행 중입니다.`);
        })
        .on('error', (e) => console.warn(`${addr} 바인딩 생략: ${e.code}`));
    servers.push(server);
};

if (process.env.HOST) {
    startOn(process.env.HOST);
} else {
    startOn('127.0.0.1'); // IPv4 루프백
    startOn('::1');        // IPv6 루프백 (nginx가 localhost→::1 로 오는 경우)
}

// 안전한 종료(graceful shutdown) — PM2 재시작/종료 시 진행 중 요청을 끝내고
// DB를 정상적으로 닫아 데이터 손상을 막는다.
let shuttingDown = false;
const shutdown = (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`\n${signal} 수신 — 안전하게 종료합니다...`);
    servers.forEach((s) => s.close());
    db.close((err) => {
        if (err) console.error('DB 종료 중 에러:', err.message);
        process.exit(0);
    });
    // 5초 안에 안 끝나면 강제 종료
    setTimeout(() => process.exit(0), 5000).unref();
};
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
