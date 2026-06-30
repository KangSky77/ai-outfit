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

// 0. 필수 환경변수 검사 (서버가 "왜 안 켜지는지" 명확히 알려주기)
//    .env 가 없으면 passport 가 알 수 없는 스택트레이스를 뱉으며 죽는다.
//    그 전에 사람이 읽을 수 있는 메시지로 바로 알려주고 종료한다.
const REQUIRED_ENV = ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GEMINI_API_KEY', 'SESSION_SECRET'];
const missing = REQUIRED_ENV.filter((k) => !process.env[k]);
if (missing.length > 0) {
    console.error('\n❌ 서버를 시작할 수 없습니다. 다음 환경변수가 .env 에 없습니다:');
    missing.forEach((k) => console.error(`   - ${k}`));
    console.error('\n👉 프로젝트 루트에 .env 파일을 만들고 키를 채워주세요. (.env.example 참고)\n');
    process.exit(1);
}

// 1. DB 초기 설정 (기억의 저장소)
const db = new sqlite3.Database('./closet.db'); // closet.db 라는 파일이 자동으로 생깁니다.
db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS outfits (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT,       -- 구글 로그인 유저의 고유 ID
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
});

// 보안 HTTP 헤더 (CSP는 외부 CDN 폰트/스타일을 막을 수 있어 끔 — 나머지 헤더는 적용)
app.use(helmet({ contentSecurityPolicy: false }));

// AI 분석은 비용이 드는 외부 호출이라 남용 방지용 레이트리밋
const analyzeLimiter = rateLimit({
    windowMs: 60 * 1000, // 1분
    max: 10,             // IP당 분당 10회
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.' },
});

// 2. 세션 및 패스포트 설정 (문지기)
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

// 이미지 업로드를 위한 multer 설정 (하드디스크에 저장)
const UPLOAD_DIR = path.join(__dirname, 'public', 'uploads');
// 업로드 폴더 확보. public/uploads 는 외장 HDD를 가리키는 심링크일 수 있는데,
// HDD가 마운트되지 않았으면 생성에 실패한다. 이때 서버 전체가 죽지 않도록
// 경고만 남기고 계속 진행한다. (업로드 시점에 명확한 에러를 반환)
try {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
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

// 정적 파일 제공
//  - 빌드된 React 앱(dist)을 서빙
//  - 업로드 이미지는 public/uploads (심링크로 외장 HDD를 가리킴)에서 서빙
app.use(express.static(path.join(__dirname, 'dist')));
app.use('/uploads', express.static(UPLOAD_DIR));

// 제미나이 API 초기화
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// --- 라우트 시작 ---

// 유저가 "구글 로그인" 버튼을 누르면 이 주소로 옵니다.
app.get('/auth/google', passport.authenticate('google', { scope: ['profile', 'email'] }));
// 구글에서 로그인이 끝나면 다시 우리 서버로 돌아오는 주소입니다.
app.get('/auth/google/callback',
    passport.authenticate('google', { failureRedirect: '/' }), (req, res) => res.redirect('/'));
// 프론트엔드에서 "나 지금 로그인 되어있나?" 확인할 때 쓸 API
app.get('/api/user', (req, res) => res.json(req.user || null));

// DB에서 내 기록 다 가져오기 API (로그인 유저 또는 익명 세션 본인 것만)
app.get('/api/history', attachUserId, (req, res) => {
    const userId = req.appUserId;
    // liked: 현재 유저가 이 코디에 좋아요를 눌렀는지 (0/1)
    db.all(
        `SELECT o.*,
            EXISTS(SELECT 1 FROM outfit_likes l WHERE l.outfit_id = o.id AND l.user_id = ?) AS liked
         FROM outfits o WHERE o.user_id = ? ORDER BY o.created_at DESC`,
        [userId, userId], (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json(rows);
        });
});

// 커뮤니티에 공개된 코디들 (모든 유저 공통, likes 포함)
app.get('/api/public-gallery', attachUserId, (req, res) => {
    const userId = req.appUserId;
    db.all(
        `SELECT o.id, o.image_path, o.analysis, o.likes, o.created_at,
            EXISTS(SELECT 1 FROM outfit_likes l WHERE l.outfit_id = o.id AND l.user_id = ?) AS liked
         FROM outfits o WHERE o.is_public = 1 ORDER BY o.created_at DESC LIMIT 50`,
        [userId], (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json(rows);
        });
});

// 좋아요 토글 (유저/익명 세션당 1회, 다시 누르면 취소) → { likes, liked }
app.post('/api/outfits/:id/like', attachUserId, (req, res) => {
    const outfitId = req.params.id;
    const userId = req.appUserId;

    // 갱신된 likes 수를 읽어서 응답하는 마무리 함수
    const finish = (liked) => db.get(`SELECT likes FROM outfits WHERE id = ?`, [outfitId], (e, row) => {
        if (e || !row) return res.status(404).json({ error: '데이터 없음' });
        res.json({ likes: row.likes, liked });
    });

    db.get(`SELECT 1 FROM outfit_likes WHERE user_id = ? AND outfit_id = ?`, [userId, outfitId], (err, already) => {
        if (err) return res.status(500).json({ error: err.message });
        if (already) {
            // 이미 눌렀음 → 취소
            db.run(`DELETE FROM outfit_likes WHERE user_id = ? AND outfit_id = ?`, [userId, outfitId], (e) => {
                if (e) return res.status(500).json({ error: e.message });
                db.run(`UPDATE outfits SET likes = MAX(likes - 1, 0) WHERE id = ?`, [outfitId], () => finish(false));
            });
        } else {
            // 처음 누름 → 좋아요
            db.run(`INSERT INTO outfit_likes (user_id, outfit_id) VALUES (?, ?)`, [userId, outfitId], (e) => {
                if (e) return res.status(500).json({ error: e.message });
                db.run(`UPDATE outfits SET likes = likes + 1 WHERE id = ?`, [outfitId], () => finish(true));
            });
        }
    });
});

// 내 코디 삭제 (본인 것만 — 로그인/익명 모두 자기 것만). 업로드 파일도 같이 지운다.
app.delete('/api/outfits/:id', attachUserId, (req, res) => {
    const { id } = req.params;
    const userId = req.appUserId;
    db.get(`SELECT image_path FROM outfits WHERE id = ? AND user_id = ?`, [id, userId], (err, row) => {
        if (err || !row) return res.status(404).json({ error: '기록 없음' });
        // image_path 는 "/uploads/파일명" → 실제 저장 폴더(UPLOAD_DIR) 기준으로 변환
        const fileName = path.basename(row.image_path);
        const realPath = path.join(UPLOAD_DIR, fileName);
        try { if (fs.existsSync(realPath)) fs.unlinkSync(realPath); } catch (e) { /* 파일 없어도 무시 */ }
        db.run(`DELETE FROM outfits WHERE id = ? AND user_id = ?`, [id, userId], (err2) => {
            if (err2) return res.status(500).json({ error: err2.message });
            // 이 코디에 달린 좋아요 기록도 함께 정리 (고아 데이터 방지)
            db.run(`DELETE FROM outfit_likes WHERE outfit_id = ?`, [id]);
            res.json({ message: '삭제 완료' });
        });
    });
});

// 분석 및 저장 API (로그인 없이도 사용 가능 — 익명은 세션에 격리 저장)
app.post('/analyze-outfit', attachUserId, analyzeLimiter, upload.single('selfie'), async (req, res) => {
    console.log("분석 요청 수신! 위치 정보 확인중...");

    let savedFilePath = null; // 실패 시 정리할 업로드 파일 경로
    try {
        if (!req.file) return res.status(400).json({ error: '이미지 업로드 실패.' });

        // 1. 프론트엔드에서 보낸 위도(lat), 경도(lon), 언어, 공개여부 받기
        const { lat, lon } = req.body;
        const lang = req.body.lang === 'English' ? 'English' : 'Korean'; // 답변 언어
        // 커뮤니티 공개는 로그인 사용자만 허용 (익명 공개 사진은 책임 추적이 안 되므로 차단).
        // 프런트가 보내더라도 서버에서 한 번 더 강제한다.
        const isPublic = (req.user && req.body.isPublic === 'true') ? 1 : 0;

        // 현재 계절 (서버 날짜 기준) — 시즌 트렌드 추천에 사용
        const month = new Date().getMonth() + 1;
        const season = lang === 'English'
            ? (month >= 3 && month <= 5 ? 'spring' : month >= 6 && month <= 8 ? 'summer' : month >= 9 && month <= 11 ? 'autumn' : 'winter')
            : (month >= 3 && month <= 5 ? '봄' : month >= 6 && month <= 8 ? '여름' : month >= 9 && month <= 11 ? '가을' : '겨울');
        const weatherApiKey = process.env.WEATHER_API_KEY;

        let currentLocation = "인천"; // 기본값
        let currentWeather = "날씨 정보 없음";
        let weatherUrl = `https://api.openweathermap.org/data/2.5/weather?q=Incheon&appid=${weatherApiKey}&units=metric&lang=kr`;

        // 2. 좌표가 있다면 해당 위치 날씨로 URL 변경! (lat, lon 둘 다 필요)
        if (lat && lon) {
            weatherUrl = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${weatherApiKey}&units=metric&lang=kr`;
            currentLocation = "사용자 현재 위치";
        }

        // 3. 실제 날씨 가져오기 (날씨 키가 없거나 실패해도 분석은 계속 진행)
        if (weatherApiKey) {
            // 날씨 API가 응답하지 않을 때 무한 대기하지 않도록 5초 타임아웃
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), 5000);
            try {
                const weatherRes = await fetch(weatherUrl, { signal: controller.signal });
                const wData = await weatherRes.json();
                if (weatherRes.ok) {
                    currentWeather = `온도: ${Math.round(wData.main.temp)}도, 상태: ${wData.weather[0].description}`;
                    if (lat && lon) currentLocation = wData.name; // API가 알려주는 지역 이름으로 업데이트
                }
            } catch (err) {
                console.error("날씨 호출 실패:", err.message);
            } finally {
                clearTimeout(timer);
            }
        }

        // 4. 이미지 최적화: EXIF 회전 보정 + 1080px 리사이즈 + JPEG 압축 후 저장
        //    (원본 수 MB → 보통 수백 KB로 줄어 갤러리 로딩이 빨라짐)
        const filename = `${crypto.randomUUID()}.jpg`; // 충돌·추측 방지용 무작위 파일명
        const optimized = await sharp(req.file.buffer)
            .rotate() // 폰 사진 방향(EXIF) 자동 보정
            .resize({ width: 1080, withoutEnlargement: true })
            .jpeg({ quality: 80 })
            .toBuffer();
        savedFilePath = path.join(UPLOAD_DIR, filename);
        fs.writeFileSync(savedFilePath, optimized);

        const imageParts = [{
            inlineData: {
                data: optimized.toString('base64'),
                mimeType: 'image/jpeg',
            },
        }];

        // 5. 제미나이에게 위치와 날씨 정보까지 포함해서 물어보기!
        const model = genAI.getGenerativeModel({ model: 'gemini-flash-lite-latest' });
        const prompt = `
너는 전문 패션 스타일리스트야. 첨부된 이미지는 사용자의 오늘 옷차림 거울 셀카야.
현재 위치는 ${currentLocation}, 날씨는 [${currentWeather}], 지금은 ${season} 시즌이야.

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

        const result = await model.generateContent([prompt, ...imageParts]);
        const responseText = result.response.text();

        // 6. DB에 저장! (저장 완료를 기다린 뒤 응답 — 실패하면 catch 로)
        const userId = req.appUserId;
        const imagePath = `/uploads/${filename}`;
        const newId = await new Promise((resolve, reject) => {
            db.run(`INSERT INTO outfits (user_id, image_path, analysis, is_public) VALUES (?, ?, ?, ?)`,
                [userId, imagePath, responseText, isPublic], function (err) {
                    if (err) return reject(err);
                    resolve(this.lastID);
                });
        });
        console.log(`${newId}번 코디(위치: ${currentLocation}, 공개: ${isPublic}) 저장 완료!`);

        res.json({ analysis: responseText, id: newId });

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

// 보안: 외부에서 7704로 직접 접속하지 못하도록 루프백(localhost)에만 바인딩한다.
// 단, nginx의 proxy_pass(localhost)가 환경에 따라 IPv6(::1)로 풀릴 수 있어
// IPv4(127.0.0.1)와 IPv6(::1) 두 루프백 모두에 바인딩해야 502가 안 난다.
// (개발 등 외부 접근이 필요하면 HOST 환경변수로 0.0.0.0 지정 가능)
const http = require('http');
const startOn = (addr) =>
    http.createServer(app)
        .listen(port, addr, () => {
            const shown = addr.includes(':') ? `[${addr}]` : addr;
            console.log(`서버가 http://${shown}:${port} 에서 실행 중입니다.`);
        })
        .on('error', (e) => console.warn(`${addr} 바인딩 생략: ${e.code}`));

if (process.env.HOST) {
    startOn(process.env.HOST);
} else {
    startOn('127.0.0.1'); // IPv4 루프백
    startOn('::1');        // IPv6 루프백 (nginx가 localhost→::1 로 오는 경우)
}
