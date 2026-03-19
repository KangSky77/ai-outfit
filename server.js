require("dotenv").config();
const express = require("express");
const multer = require("multer");
const {GoogleGenerativeAI} = require('@google/generative-ai');
const path = require("path");
const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();
const session = require('express-session');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;

const app = express();
const port = 7704;

//1. DB 초기 설정 (기억의 저장소)
const db = new sqlite3.Database('./closet.db'); // closet.db라는 파일이 자동으로 생깁니다.
// DB 테이블 만들기(처음 실행될 때 한 번만 생성됨)
db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS outfits (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT,       -- 구글 로그인 유저의 고유 ID
        image_path TEXT,    -- 사진이 저장된 경로
        analysis TEXT,      -- 제미나이가 분석해준 내용
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);
});

// 2. 세션 및 패스포트 설정(문지기)
app.use(session({secret: "my-secret",resave:false,saveUninitialized: true}));
app.use(passport.initialize());
app.use(passport.session());

passport.use(new GoogleStrategy({
        clientID:process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL: "http://ai-outfit.duckdns.org:7704/auth/google/callback" // 아까 구글 클라우드에서 적은 URl
    },(ar, rt, profile, done) => done(null, profile)));

// 세션 굽기 (로그인 성공 시)
passport.serializeUser((user,done) => done(null, user));
// 세션 읽기 (페이지 이동 시)
passport.deserializeUser((user, done) => done(null,user));


// 이미지 업로드를 위한 multer 설정 (하드디스크에 저장)
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, 'public/uploads/'),
    filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});
const upload = multer({storage: storage});

// 정적 파일 제공(프론트엔드 HTML이 담길 폴더)
app.use(express.static('public'));
app.use('/uploads', express.static('/media/kanghaneul/_Haneuls_Files_/outfit_uploads)'));
// 제미나이 API 초기화
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// --- 라우트 시작 ---

// 유저가 "구글 로그인" 버튼을 누르면 이 주소로 옵니다.
app.get('/auth/google',passport.authenticate('google', {scope: ['profile', 'email']}));
// 구글에서 로그인이 끝나면 다시 우리 서버로 돌아오는 주소입니다.
app.get('/auth/google/callback',
    passport.authenticate('google', {failureRedirect: '/'}),(req, res) => res.redirect('/'));
// 프론트엔드에서 "나 지금 로그인 되어있나?" 확인할  쓸 API
app.get('/api/user', (req,res) => res.json(req.user || null));

// [추가된 핵심!] DB에서 내 기록 다 가져오기 API
app.get('/api/history',( req,res) => {
    const userId = req.user ? req.user.id : 'anonymous'; // 로그인 유저 확인
    db.all(`SELECT * FROM outfits WHERE user_id = ? ORDER BY created_at DESC`, [userId], (err,rows) => {
        if(err) return res.status(500).json({error: err.message});
        res.json(rows); // 찾은 데이터(행들)을 프론트엔드로 쏴줍니다!
    });
});

// 분석 및 저장 API 
app.post('/analyze-outfit', upload.single('selfie'), async(req, res) => {
    console.log("분석 요청 수신! 위치 정보 확인중...") 

        // [날씨 변수 초기화] - 요청이 들어올 때마다 새로 비워주는 게 좋아요.
    try{
        if (!req.file)return res.status(400).json({error: '이미지 업로드 실패.'});

        // 1. 프론트엔드에서 보낸 위도(lat), 경도(lon) 받기
        const {lat,lon} = req.body;
        const weatherApiKey = process.env.WEATHER_API_KEY;

        let currentLocation = "인천"; // 기본값
        let currentWeather = "날씨 정보 없음"; 
        let weatherUrl = `https://api.openweathermap.org/data/2.5/weather?q=Incheon&appid=${weatherApiKey}&units=metric&lang=kr`;
        
        // 2.좌표가 있다면 해당 위치 날씨로 URL 변경!
        if(lat && lon){
            weatherUrl = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&appid=${weatherApiKey}&units=metric&lang=kr`;
            currentLocation = "사용자 현재 위치";
        }

        // 3. 실제 날씨 가져오기
    try {
        const weatherRes = await fetch(weatherUrl);
        const wData = await weatherRes.json();

        if (weatherRes.ok) {
            currentWeather = `온도: ${Math.round(wData.main.temp)}도, 상태: ${wData.weather[0].description}`;
            if(lat && lon) currentLocation = wData.name; // API가 알려주는 지역 이름으로 업데이트
        }
    } catch (err) {
        console.error("날씨 호출 실패:", err.message);
    }

        // 4. 하드디스크에서 사진 읽기
        const imageParts = [{
            inlineData: {
                data: fs.readFileSync(req.file.path).toString('base64'),
                mimeType: req.file.mimetype
            }
        }];

        // 5. 제미나이에게 위치와 날씨 정보까지 포함해서 물어보기!
        const model = genAI.getGenerativeModel({model: 'gemini-flash-lite-latest'});
        const prompt = `
        너는 전문 패션 스타일리스트야. 첨부된 이미지는 사용자의 오늘 옷차림 거울 셀카야.
        현재 위치는 ${currentLocation}이고, 날씨는 [${currentWeather}]이야.
        1. 이 날씨에 이 옷차림이 적절한지 판단해줘.
        2. 색상 조화와 핏 등 전체적인 스타일링을 평가해 줘
        3. 아쉬운 점이 있다면 더 나은 아이템(예: 겉옷, 신발 등)을 추천해 줘.
        답변은 친절하고 센스 있는 말투로 3~4줄로 요약해서 정리해 줘.
        `;

        const result = await model.generateContent([prompt, ...imageParts]);
        const responseText = result.response.text();

        // 6. DB에 저장! (오늘의 하이라이트!)
        const userId = req.user ? req.user.id : 'anonymous'; // 로그인 안 했으면 익명
        const imagePath = `/uploads/${req.file.filename}`; // 저장된 사진 경로
        db.run(`INSERT INTO outfits (user_id, image_path, analysis) VALUES (?, ?, ?)`, [userId, imagePath, responseText], function(err){
            if (!err) console.log(` ${this.lastID}번 코디(위치: ${currentLocation}) 저장 완료!`);
});
        res.json({analysis: responseText});

    } catch(error){
        console.error('분석 중 에러 발생:', error);
        res.status(500).json({error: 'AI 분석 중 오류가 발생했습니다.'});
    }
});

app.get('/logout', (req,res,next) => {
    req.logout((err) => {
        if(err) return next(err);
        res.redirect('/'); // 로그아웃하면 다시 메인으로!
    });
});

app.listen(port, () => {
    console.log(`서버가 http://localhost:${port} 에서 실행 중입니다.`);
})
