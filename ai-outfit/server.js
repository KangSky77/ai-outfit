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
const REQUIRED_ENV = ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GEMINI_API_KEY'];
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
});

// 2. 세션 및 패스포트 설정 (문지기)
app.use(session({
    secret: process.env.SESSION_SECRET || "change-this-secret",
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
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOAD_DIR),
    filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname),
});
const upload = multer({
    storage,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB 제한
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

// DB에서 내 기록 다 가져오기 API
app.get('/api/history', (req, res) => {
    const userId = req.user ? req.user.id : 'anonymous';
    db.all(`SELECT * FROM outfits WHERE user_id = ? ORDER BY created_at DESC`, [userId], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// 커뮤니티에 공개된 코디들 (모든 유저 공통, likes 포함)
app.get('/api/public-gallery', (req, res) => {
    db.all(
        `SELECT id, image_path, analysis, likes, created_at FROM outfits
         WHERE is_public = 1 ORDER BY created_at DESC LIMIT 50`,
        [], (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json(rows);
        });
});

// 좋아요 +1 (누구나 가능) → 갱신된 likes 반환
app.post('/api/outfits/:id/like', (req, res) => {
    const { id } = req.params;
    db.run(`UPDATE outfits SET likes = likes + 1 WHERE id = ?`, [id], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        db.get(`SELECT likes FROM outfits WHERE id = ?`, [id], (err2, row) => {
            if (err2 || !row) return res.status(404).json({ error: '데이터 없음' });
            res.json({ likes: row.likes });
        });
    });
});

// 내 코디 삭제 (본인 것만). 업로드 파일도 같이 지운다.
app.delete('/api/outfits/:id', (req, res) => {
    const { id } = req.params;
    const userId = req.user ? req.user.id : 'anonymous';
    db.get(`SELECT image_path FROM outfits WHERE id = ? AND user_id = ?`, [id, userId], (err, row) => {
        if (err || !row) return res.status(404).json({ error: '기록 없음' });
        // image_path 는 "/uploads/파일명" → 실제 저장 폴더(UPLOAD_DIR) 기준으로 변환
        const fileName = path.basename(row.image_path);
        const realPath = path.join(UPLOAD_DIR, fileName);
        try { if (fs.existsSync(realPath)) fs.unlinkSync(realPath); } catch (e) { /* 파일 없어도 무시 */ }
        db.run(`DELETE FROM outfits WHERE id = ? AND user_id = ?`, [id, userId], (err2) => {
            if (err2) return res.status(500).json({ error: err2.message });
            res.json({ message: '삭제 완료' });
        });
    });
});

// 분석 및 저장 API
app.post('/analyze-outfit', upload.single('selfie'), async (req, res) => {
    console.log("분석 요청 수신! 위치 정보 확인중...");

    try {
        if (!req.file) return res.status(400).json({ error: '이미지 업로드 실패.' });

        // 1. 프론트엔드에서 보낸 위도(lat), 경도(lon), 언어, 공개여부 받기
        const { lat, lon } = req.body;
        const lang = req.body.lang === 'English' ? 'English' : 'Korean'; // 답변 언어
        const isPublic = req.body.isPublic === 'true' ? 1 : 0;            // 커뮤니티 공개
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
            try {
                const weatherRes = await fetch(weatherUrl);
                const wData = await weatherRes.json();
                if (weatherRes.ok) {
                    currentWeather = `온도: ${Math.round(wData.main.temp)}도, 상태: ${wData.weather[0].description}`;
                    if (lat && lon) currentLocation = wData.name; // API가 알려주는 지역 이름으로 업데이트
                }
            } catch (err) {
                console.error("날씨 호출 실패:", err.message);
            }
        }

        // 4. 하드디스크에서 사진 읽기
        const imageParts = [{
            inlineData: {
                data: fs.readFileSync(req.file.path).toString('base64'),
                mimeType: req.file.mimetype,
            },
        }];

        // 5. 제미나이에게 위치와 날씨 정보까지 포함해서 물어보기!
        const model = genAI.getGenerativeModel({ model: 'gemini-flash-lite-latest' });
        const prompt = `
        너는 전문 패션 스타일리스트야. 첨부된 이미지는 사용자의 오늘 옷차림 거울 셀카야.
        현재 위치는 ${currentLocation}이고, 날씨는 [${currentWeather}]이야.
        1. 이 날씨에 이 옷차림이 적절한지 판단해줘.
        2. 색상 조화와 핏 등 전체적인 스타일링을 평가해 줘
        3. 아쉬운 점이 있다면 더 나은 아이템(예: 겉옷, 신발 등)을 추천해 줘.
        답변은 친절하고 센스 있는 말투로 3~4줄로 요약해서 정리해 줘.
        IMPORTANT: Write your entire answer in ${lang}.
        `;

        const result = await model.generateContent([prompt, ...imageParts]);
        const responseText = result.response.text();

        // 6. DB에 저장!
        const userId = req.user ? req.user.id : 'anonymous'; // 로그인 안 했으면 익명
        const imagePath = `/uploads/${req.file.filename}`;
        db.run(`INSERT INTO outfits (user_id, image_path, analysis, is_public) VALUES (?, ?, ?, ?)`,
            [userId, imagePath, responseText, isPublic], function (err) {
                if (!err) console.log(`${this.lastID}번 코디(위치: ${currentLocation}, 공개: ${isPublic}) 저장 완료!`);
            });

        res.json({ analysis: responseText });

    } catch (error) {
        console.error('분석 중 에러 발생:', error);
        res.status(500).json({ error: 'AI 분석 중 오류가 발생했습니다.' });
    }
});

app.get('/logout', (req, res, next) => {
    req.logout((err) => {
        if (err) return next(err);
        res.redirect('/'); // 로그아웃하면 다시 메인으로!
    });
});

app.listen(port, () => {
    console.log(`서버가 http://localhost:${port} 에서 실행 중입니다.`);
});
