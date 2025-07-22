const express = require('express');
const mysql = require('mysql2');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
require('dotenv').config();

const jwt = require('jsonwebtoken');
const SECRET_KEY = process.env.SECRET_KEY;

const userService = require('./service');

const app = express();
const saltRounds = 10;


const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'assets/user/');  
    },
    filename: function (req, file, cb) {
        cb(null, file.originalname);
    }
});



//////////////////////////////// ลบส่วนนี้หาก manual ////////////////////////////
//const cors = require('cors');

// อนุญาตให้ fin-love.com เข้าถึง API
//app.use(cors({
    //origin: 'https://fin-love.com',  // ตั้งค่าให้ตรงกับโดเมนของคุณ
    //methods: ['GET', 'POST', 'PUT', 'DELETE'],  // ระบุ HTTP methods ที่อนุญาต
    //credentials: true  // หากต้องการให้ส่ง cookies หรือ header การยืนยัน
//}));
///////////////////////////////////////////////////////////////////////////////



const upload = multer({ storage: storage });

const db = mysql.createConnection({
    host: process.env.DATABASE_HOST,
    user: process.env.DATABASE_USER,
    password: process.env.DATABASE_PASSWORD,
    database: process.env.DATABASE_NAME
});

const config = {
    secretKey: 'UX23Y24%@&2aMb',
    serverPort: 8501,
    emailService: {
        service: 'gmail',
        port: 587,
        user: 'pedza507@gmail.com',
        pass: 'dyon lkfk cyzf bsqq'
    }
};

db.connect();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/assets/user', express.static(path.join(__dirname, 'assets/user')));


// Nodemailer Transporter Configuration
const transporter = nodemailer.createTransport({
    service: process.env.EMAIL_SERVICE,
    host: 'smtp.gmail.com',
    port: process.env.EMAIL_PORT,
    secure: false, // ใช้ false สำหรับ port 587
    auth: {
        user: process.env.EMAIL_user,
        pass: process.env.EMAIL_PASS,
    },
});

const helmet = require('helmet');
app.use(helmet());

const rateLimit = require('express-rate-limit');

const loginLimiter = rateLimit({
    windowMs: 600 * 1000, // เริ่มต้นล็อก 1 ชั่วโมง
    max: 5, // Limit each IP to 5 requests per windowMs
    message: "Too many login attempts from this IP, please try again after 10 seconds"
}); 



///////////////////////////////////////////////////////////// Login Logout /////////////////////////////////////////////////////////////


app.post('/api_v2/login', async function(req, res) {
    const { username, password } = req.body;
    const sql = "SELECT userID, password, loginAttempt, isActive, lastAttemptTime FROM user WHERE username = ?";

    try {
        const [users] = await db.promise().query(sql, [username]);

        if (users.length > 0) {
            const user = users[0];
            const storedHashedPassword = user.password;
            const loginAttempt = user.loginAttempt;
            const isActive = user.isActive;
            const lastAttemptTime = user.lastAttemptTime ? new Date(user.lastAttemptTime) : null;
            const now = new Date();
            
            // ระยะเวลาล็อกแบบไล่ตามขั้นบันได (เริ่มที่ 1 นาทีเมื่อผิดครั้งที่ 5)
            const lockIntervals = [60, 300, 600, 1200, 1800]; // หน่วยเป็นวินาที (เริ่มต้นที่ 1 นาที)
            const baseLockDuration = 5; // เริ่มล็อกเมื่อล็อกอินผิดครั้งที่ 5
            let lockDuration = lockIntervals[0] * 1000; // เริ่มล็อกครั้งแรก 1 นาที

            if (loginAttempt >= baseLockDuration) {
                lockDuration = lockIntervals[Math.min(loginAttempt - baseLockDuration, lockIntervals.length - 1)] * 1000; // ใช้ lockIntervals ที่เหมาะสม

                const diffSeconds = (now - lastAttemptTime) / 1000;

                if (diffSeconds < lockDuration / 1000) {
                    return res.send({
                        "message": `บัญชีนี้ถูกปิดใช้งาน กรุณาลองอีกครั้งหลังจาก ${Math.ceil((lockDuration / 1000) - diffSeconds)} วินาที`, 
                        "status": false 
                    });
                } else {
                    // ปลดล็อกบัญชีเมื่อครบกำหนดและรีเซ็ต loginAttempt
                    await db.promise().query("UPDATE user SET loginAttempt = 0, isActive = 1 WHERE userID = ?", [user.userID]);
                }
            }

            const match = await bcrypt.compare(password, storedHashedPassword);

            if (match) {
                await db.promise().query("UPDATE user SET loginAttempt = 0, lastAttemptTime = NOW(), isActive = 1 WHERE userID = ?", [user.userID]);
                const payload = {
                    userID: user.userID,
                    username: username
                }

                const token = jwt.sign(
                    payload,
                    SECRET_KEY, 
                    { expiresIn: '1h' } // กำหนดให้ Token หมดอายุใน 1 ชั่วโมง
                );

                return res.send({ 
                    "message": "เข้าสู่ระบบสำเร็จ", 
                    "status": true,
                    "userID": user.userID,
                    "token": token
                });
            } else {
                const [updateResult] = await db.promise().query("UPDATE user SET loginAttempt = loginAttempt + 1, lastAttemptTime = NOW() WHERE userID = ?", [user.userID]);

                if (updateResult.affectedRows > 0) {
                    if (loginAttempt + 1 === baseLockDuration) {
                        await db.promise().query("UPDATE user SET isActive = 0 WHERE userID = ?", [user.userID]);
                        return res.send({ 
                            "message": `บัญชีถูกล็อค กรุณาลองอีกครั้งใน ${lockIntervals[0]} วินาที`, 
                            "status": false 
                        });
                    } else if (loginAttempt + 1 > baseLockDuration) {
                        await db.promise().query("UPDATE user SET isActive = 0 WHERE userID = ?", [user.userID]);
                        return res.send({ 
                            "message": `บัญชีถูกล็อค กรุณาลองอีกครั้งใน ${lockIntervals[Math.min(loginAttempt - baseLockDuration, lockIntervals.length - 1)]} วินาที`, 
                            "status": false 
                        });
                    } else {
                        return res.send({ "message": "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง", "status": false });
                    }
                } else {
                    return res.send({ "message": "เกิดข้อผิดพลาดในการอัปเดตข้อมูล", "status": false });
                }
            }
        } else {
            return res.send({ "message": "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง", "status": false });
        }
    } catch (err) {
        console.log('Error during login process:', err);
        return res.status(500).send("เกิดข้อผิดพลาดในการเชื่อมต่อ");
    }
});


// API Logout
app.post('/api_v2/logout/:id', async (req, res) => {
    const { id } = req.params;
    const updateSql = "UPDATE user SET isActive = 1, loginAttempt = 0 WHERE userID = ?";

    try {
        await db.promise().query(updateSql, [id]);
        res.send({ status: true, message: "Logged out successfully" });
    } catch (err) {
        console.error('Error during logout process:', err);
        res.status(500).send({ message: "Database update error", status: false });
    }
});



///////////////////////////////////////////////////////////// register /////////////////////////////////////////////////////////////


// API Email Uniqe
app.post('/api_v2/checkusernameEmail', async function(req, res) {
    const { username, email } = req.body;

    if (!username || !email) {
        return res.status(400).send({ "message": "กรุณาระบุชื่อผู้ใช้และอีเมล", "status": false });
    }

    try {
        const [usernameResult] = await db.promise().execute("SELECT username FROM user WHERE username = ?", [username]);
        const [emailResult] = await db.promise().query("SELECT email FROM user WHERE email = ?", [email]);

        if (usernameResult.length > 0) {
            return res.status(409).send({ "message": "ชื่อผู้ใช้นี้ถูกใช้งานแล้ว", "status": false });
        }

        if (emailResult.length > 0) {
            return res.status(409).send({ "message": "อีเมลนี้ถูกใช้งานแล้ว", "status": false });
        }

        res.send({ "message": "ชื่อผู้ใช้และอีเมลนี้สามารถใช้ได้", "status": true });
    } catch (err) {
        console.error('Database error:', err);
        res.status(500).send({ "message": "เกิดข้อผิดพลาดในระบบ", "status": false });
    }
});


// API Register
app.post('/api_v2/register8', upload.single('imageFile'), async function(req, res) {
    const { email, username, password, firstname, lastname, nickname, gender, height, phonenumber, home, dateOfBirth, educationID, preferences, goalID, interestGenderID } = req.body;
    const fileName = req.file ? req.file.filename : null;

    // ตรวจสอบข้อมูลว่าครบถ้วนหรือไม่
    if (!email || !username || !password || !firstname || !lastname || !nickname || !gender || !height || !phonenumber || !home || !dateOfBirth || !educationID || !preferences || !goalID || !interestGenderID || !fileName) {
        console.log("ข้อมูลไม่ครบถ้วน", {
            email, username, password, firstname, lastname, nickname, gender, height, phonenumber, home, dateOfBirth, educationID, preferences, goalID, interestGenderID, fileName
        });
        return res.status(400).send({ "message": "ข้อมูลไม่ครบถ้วน", "status": false });
    }

    try {
        // ตรวจสอบว่าอีเมลหรือชื่อผู้ใช้ซ้ำหรือไม่
        const [existingUser] = await db.promise().query("SELECT * FROM user WHERE email = ? OR username = ?", [email, username]);
        if (existingUser.length > 0) {
            return res.status(409).send({ "message": "อีเมลหรือชื่อผู้ใช้ซ้ำ กรุณาใช้ข้อมูลใหม่", "status": false });
        }

        // ทำการ hash รหัสผ่าน
        const hashedPassword = await bcrypt.hash(password, saltRounds);

        // ค้นหา GenderID
        const [genderResult] = await db.promise().query("SELECT GenderID FROM gender WHERE Gender_Name = ?", [gender]);

        if (genderResult.length === 0) {
            console.log("ไม่พบข้อมูลเพศที่ระบุ");
            return res.status(404).send({ "message": "ไม่พบข้อมูลเพศที่ระบุ", "status": false });
        }

        const genderID = genderResult[0].GenderID;

        // Log ข้อมูลก่อนการบันทึกลง database
        console.log("Inserting data into user: ", {
            username, hashedPassword, email, firstname, lastname, nickname, genderID, height, phonenumber, home, dateOfBirth, educationID, goalID, fileName, interestGenderID
        });

        // บันทึกข้อมูลผู้ใช้
        const sqlInsert = `
            INSERT INTO user (username, password, email, firstname, lastname, nickname, GenderID, height, phonenumber, home, DateBirth, EducationID, goalID, imageFile, interestGenderID )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;
        const [insertResult] = await db.promise().query(sqlInsert, [username, hashedPassword, email, firstname, lastname, nickname, genderID, height, phonenumber, home, dateOfBirth, educationID, goalID, fileName, interestGenderID]);

        const userID = insertResult.insertId;

        // บันทึก preferences
        const preferenceIDs = preferences.split(',').map(id => parseInt(id));
        for (const preferenceID of preferenceIDs) {
            await db.promise().query("INSERT INTO userpreferences (userID, PreferenceID) VALUES (?, ?)", [userID, preferenceID]);
        }

        console.log(`Preferences saved for user ${userID}: `, preferenceIDs);

        res.send({ "message": "ลงทะเบียนสำเร็จ", "status": true });
    } catch (err) {
        console.error('Database error:', err);
        res.status(500).send({ "message": "บันทึกลง FinLove ล้มเหลว", "status": false });
    }
});




///////////////////////////////////////////////////////////// Forgot Password /////////////////////////////////////////////////////////////


// API Request PIN
app.post('/api_v2/request-pin', async (req, res) => {
    const { email } = req.body;

    try {
        // ดึง userID จาก email
        const [result] = await db.promise().query("SELECT userID FROM user WHERE email = ?", [email]);

        if (result.length === 0) {
            return res.status(400).send("ไม่พบอีเมลนี้ในระบบ"); // ส่งข้อความโดยตรง
        }

        const userID = result[0].userID;  // ดึง userID เพื่ออัพเดต PIN
        const pinCode = Math.floor(1000 + Math.random() * 9000).toString(); // PIN 4 หลัก
        const expirationDate = new Date(Date.now() + 3600000); // PIN หมดอายุใน 1 ชั่วโมง

        // อัพเดต pinCode และ pinCodeExpiration โดยใช้ userID
        const updateResult = await db.promise().query(
            "UPDATE user SET pinCode = ?, pinCodeExpiration = ? WHERE userID = ?",
            [pinCode, expirationDate, userID]
        );

        // ตรวจสอบการอัพเดต
        if (updateResult[0].affectedRows === 0) {
            return res.status(500).send("ไม่สามารถอัพเดต PIN ได้");
        }

        // ส่ง PIN ไปยังอีเมลผู้ใช้
        const mailOptions = {
            from: process.env.EMAIL_user,
            to: email,
            subject: 'รหัส PIN สำหรับรีเซ็ตรหัสผ่าน',
            text: `รหัส PIN ของคุณคือ: ${pinCode}. รหัสนี้จะหมดอายุใน 1 ชั่วโมง.`
        };

        await transporter.sendMail(mailOptions);

        res.send("PIN ถูกส่งไปยังอีเมลของคุณ");
    } catch (err) {
        console.error('Error sending PIN:', err);
        res.status(500).send("เกิดข้อผิดพลาดในการส่ง PIN");
    }
});



// API Verify PIN
app.post('/api_v2/verify-pin', async (req, res) => {
    const { email, pin } = req.body;

    try {
        // ตรวจสอบว่าอีเมลและ PIN ถูกต้อง
        const [result] = await db.promise().query(
            "SELECT userID, pinCode, pinCodeExpiration FROM user WHERE email = ? AND pinCode = ?",
            [email, pin]
        );

        if (result.length === 0) {
            return res.status(400).send("PIN ไม่ถูกต้อง"); // ส่งข้อความภาษาไทยโดยตรง
        }

        const user = result[0];
        const currentTime = new Date();

        // ตรวจสอบว่า PIN หมดอายุหรือไม่
        if (currentTime > user.pinCodeExpiration) {
            return res.status(400).send("PIN หมดอายุ"); // ส่งข้อความภาษาไทยโดยตรง
        }

        // ถ้า PIN ถูกต้องและยังไม่หมดอายุ
        res.send("PIN ถูกต้อง"); // ส่งข้อความภาษาไทยโดยตรง
    } catch (err) {
        console.log("Error verifying PIN:", err); // ใช้ console.log เพื่อหลีกเลี่ยงการแสดง Error:
        res.status(500).send("เกิดข้อผิดพลาดในการยืนยัน PIN"); // ส่งข้อความภาษาไทยโดยตรง
    }
});



// API Reset Password
app.post('/api_v2/reset-password', async (req, res) => {
    const { email, pin, newPassword } = req.body;

    // ตรวจสอบว่าข้อมูลครบถ้วนหรือไม่
    if (!email || !pin || !newPassword) {
        return res.status(400).send({ message: "ข้อมูลไม่ครบถ้วน", status: false });
    }

    console.log("Received Data:", req.body); // Log ข้อมูลที่ได้รับจากแอป Android

    try {
        // ตรวจสอบ PIN และวันหมดอายุ
        const [result] = await db.promise().query(
            "SELECT userID, pinCode, pinCodeExpiration FROM user WHERE email = ? AND pinCode = ? AND pinCodeExpiration > ?",
            [email, pin, new Date()]
        );

        if (result.length === 0) {
            return res.status(400).send({ message: "PIN ไม่ถูกต้องหรือหมดอายุ", status: false });
        }

        const userID = result[0].userID;

        // เข้ารหัสรหัสผ่านใหม่
        const hashedPassword = await bcrypt.hash(newPassword, saltRounds);

        // อัปเดตรหัสผ่านใหม่ในฟิลด์ password และลบข้อมูล PIN ออก
        const updateResult = await db.promise().query(
            "UPDATE user SET password = ?, pinCode = NULL, pinCodeExpiration = NULL WHERE userID = ?",
            [hashedPassword, userID]
        );

        if (updateResult[0].affectedRows === 0) {
            return res.status(400).send({ message: "ไม่สามารถอัปเดตรหัสผ่านได้", status: false });
        }

        res.send({ message: "รีเซ็ตรหัสผ่านเรียบร้อยแล้ว", status: true });
    } catch (err) {
        console.error('Error resetting password:', err);
        res.status(500).send({ message: "เกิดข้อผิดพลาดในการรีเซ็ตรหัสผ่าน", status: false });
    }
});



///////////////////////////////////////////////////////////// user Manage /////////////////////////////////////////////////////////////



// API Show All user
app.get('/api_v2/user', function(req, res) {
    const sql = "SELECT username, imageFile, preferences, verify FROM user";
    db.query(sql, function(err, result) {
        if (err) throw err;
        
        // ปรับเส้นทาง imageFile ให้เป็น URL
        result.forEach(user => {
            if (user.imageFile) {
                user.imageFile = `${req.protocol}://${req.get('host')}/assets/user/${user.imageFile}`;
            }
        });

        res.send(result.length > 0 ? result : { message: 'ไม่พบข้อมูลผู้ใช้', status: false });
    });
});



// API Show All user Image
app.get('/api_v2/user/image/:filename', function(req, res) {
    const filepath = path.join(__dirname, 'assets/user', req.params.filename);
    res.sendFile(filepath, err => {
        if (err) res.status(404).json({ error: "File not found" });
    });
});



// API View Profile
app.get('/api_v2/user/:id', async function (req, res) {
    const { id } = req.params;
    const sql = `
    SELECT 
        u.username, u.email, u.firstname, u.lastname, u.nickname, 
        u.verify,
        g.Gender_Name AS gender, ig.interestGenderName AS interestGender, 
        u.height, u.home, u.DateBirth, u.imageFile,
        e.EducationName AS education,
        go.goalName AS goal,
        COALESCE(GROUP_CONCAT(DISTINCT p.PreferenceNames), 'ไม่มีความชอบ') AS preferences
    FROM user u
    LEFT JOIN gender g ON u.GenderID = g.GenderID
    LEFT JOIN interestgender ig ON u.InterestGenderID = ig.interestGenderID
    LEFT JOIN education e ON u.educationID = e.educationID
    LEFT JOIN goal go ON u.goalID = go.goalID
    LEFT JOIN userpreferences up ON u.userID = up.userID
    LEFT JOIN preferences p ON up.PreferenceID = p.PreferenceID
    WHERE u.userID = ?
    GROUP BY u.userID
    `;

    try {
        const [rows] = await db.promise().query(sql, [id]);
        
        // ตรวจสอบให้แน่ใจว่า rows มีข้อมูล
        if (rows && rows.length > 0) {
            const user = rows[0]; // กำหนดตัวแปร user เพื่อใช้งานง่าย
            if (user.imageFile) {
                user.imageFile = `${req.protocol}://${req.get('host')}/api_v2/user/image/${user.imageFile}`;
                console.log("Full image URL:", user.imageFile); // ตรวจสอบ URL เต็ม
            }
            res.send(user);
        } else {
            res.status(404).send({ message: "ไม่พบข้อมูลผู้ใช้", status: false });
        }
    } catch (err) {
        console.error('Database query error:', err);
        res.status(500).send({ message: "เกิดข้อผิดพลาดในการดึงข้อมูลผู้ใช้", status: false });
    }
});



// API View OtherProfile
app.get('/api_v2/profile/:id', async function (req, res) {
    const { id } = req.params;
    const sql = `
    SELECT 
        u.firstname, 
        u.lastname, 
        u.nickname, 
        u.verify,
        g.Gender_Name AS gender, 
        COALESCE(GROUP_CONCAT(DISTINCT p.PreferenceNames), 'ไม่มีความชอบ') AS preferences,
        u.imageFile
    FROM user u
    LEFT JOIN gender g ON u.GenderID = g.GenderID
    LEFT JOIN userpreferences up ON u.userID = up.userID
    LEFT JOIN preferences p ON up.PreferenceID = p.PreferenceID
    WHERE u.userID = ?
    GROUP BY u.userID
    `;

    try {
        // เรียกใช้ query และตรวจสอบผลลัพธ์
        const [rows] = await db.promise().query(sql, [id]);
        console.log('Database query result:', rows); // ตรวจสอบผลลัพธ์ใน console

        // ตรวจสอบให้แน่ใจว่า rows มีข้อมูล
        if (rows && rows.length > 0) {
            const user = rows[0]; // กำหนดตัวแปร user เพื่อใช้งานง่าย
            if (user.imageFile) {
                user.imageFile = `${req.protocol}://${req.get('host')}/api_v2/user/image/${user.imageFile}`;
                console.log("Full image URL:", user.imageFile); // ตรวจสอบ URL เต็ม
            } else {
                console.log("No image file for user:", id);
            }
            res.send(user);
        } else {
            res.status(404).send({ message: "ไม่พบข้อมูลผู้ใช้", status: false });
        }
    } catch (err) {
        console.error('Database query error:', err);
        res.status(500).send({ message: "เกิดข้อผิดพลาดในการดึงข้อมูลผู้ใช้", status: false });
    }
});



// API Update user
app.post('/api_v2/user/update/:id', async function(req, res) {
    const { id } = req.params;
    let { username, email, firstname, lastname, nickname, gender, interestGender, height, home, DateBirth, education, goal, preferences } = req.body;

    try {
        // Fetch current user data
        const [userResult] = await db.promise().query("SELECT * FROM user WHERE userID = ?", [id]);
        if (userResult.length === 0) {
            return res.status(404).send({ message: "ไม่พบผู้ใช้ที่ต้องการอัปเดต", status: false });
        }

        const currentuser = userResult[0];

        // ตรวจสอบว่า username ไม่ใช่ค่าว่าง
        if (!username || username.trim() === "") {
            return res.status(400).send({ message: "ชื่อผู้ใช้ไม่สามารถว่างได้", status: false });
        }

        // Use current data if no new data is provided
        email = email || currentuser.email;
        firstname = firstname || currentuser.firstname;
        lastname = lastname || currentuser.lastname;
        nickname = nickname || currentuser.nickname;
        height = height || currentuser.height;
        home = home || currentuser.home;

        // Handle DateBirth: ถ้าไม่มีการส่งมา ใช้ค่าปัจจุบันในฐานข้อมูล
        if (DateBirth && DateBirth !== '') {
            DateBirth = new Date(DateBirth).toISOString().split('T')[0]; // Convert to YYYY-MM-DD format
        } else {
            DateBirth = currentuser.DateBirth; // Keep old DateBirth if not updated
        }

        // Translate gender name to ID
        let genderID = currentuser.GenderID;
        if (gender && gender !== '') {
            const [genderResult] = await db.promise().query("SELECT GenderID FROM gender WHERE Gender_Name = ?", [gender]);
            if (genderResult.length === 0) {
                return res.status(404).send({ message: "ไม่พบเพศที่ระบุ", status: false });
            }
            genderID = genderResult[0].GenderID;
        }

        // Translate interestGender name to ID
        let interestGenderID = currentuser.InterestGenderID;
        if (interestGender && interestGender !== '') {
            const [interestGenderResult] = await db.promise().query("SELECT interestGenderID FROM interestgender WHERE interestGenderName = ?", [interestGender]);
            if (interestGenderResult.length === 0) {
                return res.status(404).send({ message: "ไม่พบเพศที่สนใจที่ระบุ", status: false });
            }
            interestGenderID = interestGenderResult[0].interestGenderID;
        }

        // Translate education name to ID
        let educationID = currentuser.educationID;
        if (education && education !== '') {
            const [educationResult] = await db.promise().query("SELECT EducationID FROM education WHERE EducationName = ?", [education]);
            if (educationResult.length === 0) {
                return res.status(404).send({ message: "ไม่พบการศึกษาที่ระบุ", status: false });
            }
            educationID = educationResult[0].EducationID;
        }

        // Translate goal name to ID
        let goalID = currentuser.goalID;
        if (goal && goal !== '') {
            const [goalResult] = await db.promise().query("SELECT goalID FROM goal WHERE goalName = ?", [goal]);
            if (goalResult.length === 0) {
                return res.status(404).send({ message: "ไม่พบเป้าหมายที่ระบุ", status: false });
            }
            goalID = goalResult[0].goalID;
        }

        // Update the user table with all the fields
        const updateuserSql = `
            UPDATE user 
            SET username = ?, email = ?, firstname = ?, lastname = ?, nickname = ?, GenderID = ?, InterestGenderID = ?, height = ?, home = ?, DateBirth = ?, educationID = ?, goalID = ?
            WHERE userID = ?
        `;
        await db.promise().query(updateuserSql, [username, email, firstname, lastname, nickname, genderID, interestGenderID, height, home, DateBirth, educationID, goalID, id]);

        // Update preferences in userpreferences table
        if (preferences && Array.isArray(preferences)) {
            // ลบ preference เก่าทั้งหมดของผู้ใช้
            await db.promise().query("DELETE FROM userpreferences WHERE userID = ?", [id]);

            // เพิ่ม preference ใหม่
            for (const preference of preferences) {
                const [preferenceResult] = await db.promise().query("SELECT PreferenceID FROM preferences WHERE PreferenceNames = ?", [preference]);
                if (preferenceResult.length > 0) {
                    await db.promise().query("INSERT INTO userpreferences (userID, PreferenceID) VALUES (?, ?)", [id, preferenceResult[0].PreferenceID]);
                }
            }
        }

        res.send({ message: "ข้อมูลถูกอัปเดตเรียบร้อย", status: true });
    } catch (err) {
        console.error('Database update error:', err);
        res.status(500).send({ message: "เกิดข้อผิดพลาดในการอัปเดตข้อมูลผู้ใช้", status: false });
    }
});


// API Update Preference
app.post('/api_v2/user/update_preferences/:id', async function (req, res) {
    const { id } = req.params; // รับ userID จากพารามิเตอร์
    const { preferences } = req.body; // รับข้อมูล preferences เป็น comma-separated string

    try {
        // ตรวจสอบว่ามีการส่งข้อมูล preferences มาหรือไม่
        if (!preferences || preferences.trim() === "") {
            return res.status(400).send({ message: "Preferences ไม่สามารถว่างได้", status: false });
        }

        // ลบ preferences เก่าของผู้ใช้ในฐานข้อมูล
        await db.promise().query("DELETE FROM userpreferences WHERE userID = ?", [id]);

        // แปลง comma-separated string เป็น array
        const preferencesArray = preferences.split(",");

        // เพิ่ม preferences ใหม่ในฐานข้อมูล
        for (const preferenceID of preferencesArray) {
            const preferenceIDNumber = parseInt(preferenceID.trim()); // แปลงเป็น integer
            if (isNaN(preferenceIDNumber)) {
                return res.status(400).send({ message: "Preference ID ไม่ถูกต้อง", status: false });
            }

            // ตรวจสอบว่า PreferenceID มีอยู่ในตาราง preferences หรือไม่
            const [preferenceExists] = await db.promise().query("SELECT PreferenceID FROM preferences WHERE PreferenceID = ?", [preferenceIDNumber]);
            if (preferenceExists.length === 0) {
                return res.status(404).send({ message: `ไม่พบ PreferenceID: ${preferenceIDNumber}`, status: false });
            }

            // เพิ่มข้อมูลในตาราง userpreferences
            await db.promise().query("INSERT INTO userpreferences (userID, PreferenceID) VALUES (?, ?)", [id, preferenceIDNumber]);
        }

        res.send({ message: "Preferences ถูกอัปเดตเรียบร้อย", status: true });
    } catch (err) {
        console.error('Database error:', err);
        res.status(500).send({ message: "เกิดข้อผิดพลาดในการอัปเดต preferences", status: false });
    }
});


app.put('/api_v2/user/update/:id', upload.single('image'), async function (req, res) {
    const { id } = req.params;
    let { username, email, firstname, lastname, nickname, gender, interestGender, height, home, DateBirth, education, goal, preferences } = req.body;
    const image = req.file ? req.file.filename : null;

    try {
        if (!username || username.trim() === "") {
            return res.status(400).send({ message: "username ไม่สามารถเว้นว่างได้", status: false });
        }

        const [userResult] = await db.promise().query("SELECT * FROM user WHERE userID = ?", [id]);
        if (userResult.length === 0) {
            return res.status(404).send({ message: "ไม่พบผู้ใช้ที่ต้องการอัปเดต", status: false });
        }

        const currentuser = userResult[0];
        let genderID = currentuser.GenderID;
        if (gender) {
            const [genderResult] = await db.promise().query("SELECT GenderID FROM gender WHERE Gender_Name = ?", [gender]);
            if (genderResult.length > 0) {
                genderID = genderResult[0].GenderID;
            }
        }

        let interestGenderID = currentuser.InterestGenderID;
        if (interestGender) {
            const [interestGenderResult] = await db.promise().query("SELECT interestGenderID FROM interestgender WHERE interestGenderName = ?", [interestGender]);
            if (interestGenderResult.length > 0) {
                interestGenderID = interestGenderResult[0].interestGenderID;
            }
        }

        let educationID = currentuser.educationID;
        if (education) {
            const [educationResult] = await db.promise().query("SELECT EducationID FROM education WHERE EducationName = ?", [education]);
            if (educationResult.length > 0) {
                educationID = educationResult[0].EducationID;
            }
        }

        let goalID = currentuser.goalID;
        if (goal) {
            const [goalResult] = await db.promise().query("SELECT goalID FROM goal WHERE goalName = ?", [goal]);
            if (goalResult.length > 0) {
                goalID = goalResult[0].goalID;
            }
        }

        if (preferences && Array.isArray(preferences)) {
            await db.promise().query("DELETE FROM userpreferences WHERE userID = ?", [id]);

            for (const preference of preferences) {
                const [preferenceResult] = await db.promise().query("SELECT PreferenceID FROM preferences WHERE PreferenceNames = ?", [preference]);
                if (preferenceResult.length > 0) {
                    await db.promise().query("INSERT INTO userpreferences (userID, PreferenceID) VALUES (?, ?)", [id, preferenceResult[0].PreferenceID]);
                }
            }
        }

        let currentImageFile = image;
        if (!currentImageFile) {
            currentImageFile = currentuser.imageFile || '';
        } else {
            const ext = path.extname(req.file.originalname);
            const newFileName = `${uuidv4()}${ext}`;
            fs.renameSync(req.file.path, path.join('assets/user', newFileName));
            currentImageFile = newFileName;

            if (currentuser.imageFile && currentuser.imageFile !== '') {
                const oldImagePath = path.join(__dirname, 'assets/user', currentuser.imageFile);
                if (fs.existsSync(oldImagePath)) {
                    fs.unlinkSync(oldImagePath);
                }
            }
        }

        let dateBirth = DateBirth ? DateBirth.split('T')[0] : currentuser.DateBirth;

        const sqlUpdate = `
            UPDATE user 
            SET username = ?, email = ?, firstname = ?, lastname = ?, nickname = ?, imageFile = ?, GenderID = ?, InterestGenderID = ?, height = ?, home = ?, DateBirth = ?, educationID = ?, goalID = ?
            WHERE userID = ?`;
        await db.promise().query(sqlUpdate, [username, email, firstname, lastname, nickname, currentImageFile, genderID, interestGenderID, height, home, dateBirth, educationID, goalID, id]);

        const imageUrl = currentImageFile ? `${req.protocol}://${req.get('host')}/assets/user/${currentImageFile}` : null;

        res.send({
            message: "ข้อมูลผู้ใช้อัปเดตสำเร็จ",
            status: true,
            image: imageUrl
        });
    } catch (err) {
        console.error('Database update error:', err);
        res.status(500).send({ message: "การอัปเดตข้อมูลผู้ใช้ล้มเหลว", status: false });
    }
});


// API Delete user
app.delete('/api_v2/user/:id', async function (req, res) {
    const { id } = req.params;

    // SQL Queries
    const sqlDeleteuserReport = "DELETE FROM userreport WHERE reporterID = ? OR reportedID = ?";
    const sqlDeleteBlockedChats = "DELETE FROM blocked_chats WHERE user1ID = ? OR user2ID = ?";
    const sqlDeleteLikes = "DELETE FROM userlike WHERE likerID = ? OR likedID = ?";
    const sqlDeleteDislikes = "DELETE FROM userdislike WHERE dislikerID = ? OR dislikedID = ?";
    const sqlDeleteChats = "DELETE FROM chats WHERE matchID IN (SELECT matchID FROM matches WHERE user1ID = ? OR user2ID = ?)";
    const sqlDeleteMatches = "DELETE FROM matches WHERE user1ID = ? OR user2ID = ?";
    const sqlDeleteDeletedChats = "DELETE FROM deleted_chats WHERE userID = ?";
    const sqlDeleteuser = "DELETE FROM user WHERE userID = ?";

    try {
        // ลบข้อมูลที่เกี่ยวข้องกับผู้ใช้ในแต่ละตาราง
        await db.promise().query(sqlDeleteuserReport, [id, id]);
        await db.promise().query(sqlDeleteBlockedChats, [id, id]);
        await db.promise().query(sqlDeleteLikes, [id, id]);
        await db.promise().query(sqlDeleteDislikes, [id, id]);
        await db.promise().query(sqlDeleteChats, [id, id]);
        await db.promise().query(sqlDeleteMatches, [id, id]);
        await db.promise().query(sqlDeleteDeletedChats, [id]);

        // ลบข้อมูลผู้ใช้จากตาราง user
        const [deleteResult] = await db.promise().query(sqlDeleteuser, [id]);

        if (deleteResult.affectedRows > 0) {
            res.send({ message: "ลบข้อมูลผู้ใช้สำเร็จ", status: true });
        } else {
            res.status(404).send({ message: "ไม่พบผู้ใช้ที่ต้องการลบ", status: false });
        }
    } catch (err) {
        console.error('Database delete error:', err);
        res.status(500).send({ message: "เกิดข้อผิดพลาดในการลบข้อมูลผู้ใช้", status: false });
    }
});



///////////////////////////////////////////////////////////// Show All user /////////////////////////////////////////////////////////////



// API Get user Home
app.get('/api_v2/users', (req, res) => {
    const query = `SELECT userID, nickname, imageFile FROM user`;

    db.query(query, (err, results) => {
        if (err) {
            return res.status(500).send('Error fetching users');
        }

        // ตรวจสอบและปรับปรุงเส้นทางของ imageFile สำหรับผู้ใช้แต่ละคน
        results.forEach(user => {
            if (user.imageFile) {
                user.imageFile = `${req.protocol}://${req.get('host')}/assets/user/${user.imageFile}`;
            }
        });

        res.json(results);
    });
});



///////////////////////////////////////////////////////////// report /////////////////////////////////////////////////////////////



// API Report
app.post('/api_v2/report', (req, res) => {
    const { reporterID, reportedID, reportType } = req.body;

    // ตรวจสอบว่าได้ค่าอะไรจาก req.body และมีการส่งค่ามาครบถ้วนหรือไม่
    console.log('Received report data:', { reporterID, reportedID, reportType });

    // ตรวจสอบว่า reporterID ถูกส่งมาหรือไม่
    if (!reporterID || reporterID === '-1') {
        console.error("Invalid reporterID:", reporterID);
        return res.status(400).json({ message: "Invalid reporterID" });
    }

    const query = `
        INSERT INTO userreport (reporterID, reportedID, reportID)
        VALUES (?, ?, (SELECT reportID FROM report WHERE reportType = ?))
    `;

    // ตรวจสอบว่าค่า query ที่จะใช้ใน db query ถูกต้องหรือไม่
    console.log('Executing query with values:', [reporterID, reportedID, reportType]);

    db.query(query, [reporterID, reportedID, reportType], (err, result) => {
        if (err) {
            console.error('Error inserting report:', err);
            return res.status(500).json({ message: 'Failed to report', error: err.message });
        }

        // ตรวจสอบผลลัพธ์หลังการ execute query
        console.log('Report insertion result:', result);
        res.json({ message: 'Report saved successfully' });
    });
});



///////////////////////////////////////////////////////////// Like Dislike /////////////////////////////////////////////////////////////



// API Like user
app.post('/api_v2/like', (req, res) => {
    const { likerID, likedID } = req.body;

    if (likerID === likedID) {
        return res.status(400).json({ error: 'You cannot like yourself' });
    }

    // เริ่ม Transaction เพื่อเพิ่ม Like และลบ Dislike ใน table userdislike
    db.beginTransaction((err) => {
        if (err) return res.status(500).send(err);

        // ลบข้อมูลใน table userdislike ก่อน
        const deleteDislikeQuery = `
            DELETE FROM userdislike 
            WHERE dislikerID = ? AND dislikedID = ?
        `;

        db.query(deleteDislikeQuery, [likerID, likedID], (err, result) => {
            if (err) {
                return db.rollback(() => {
                    res.status(500).send(err);
                });
            }

            // เพิ่ม Like ลงในฐานข้อมูล
            const insertLikeQuery = `
                INSERT INTO userlike (likerID, likedID)
                VALUES (?, ?)
            `;

            db.query(insertLikeQuery, [likerID, likedID], (err, result) => {
                if (err) {
                    return db.rollback(() => {
                        res.status(500).send(err);
                    });
                }

                // Commit Transaction ถ้าทำงานสำเร็จทั้งหมด
                db.commit((err) => {
                    if (err) {
                        return db.rollback(() => {
                            res.status(500).send(err);
                        });
                    }
                    res.status(200).json({ success: true, message: 'user liked successfully and dislike removed' });
                });
            });
        });
    });
});


// API Dislike user
app.post('/api_v2/dislike', (req, res) => {
    const { dislikerID, dislikedID } = req.body;

    if (dislikerID === dislikedID) {
        return res.status(400).json({ error: 'You cannot dislike yourself' });
    }

    // ตรวจสอบก่อนว่าผู้ใช้เคยถูก Like หรือ Dislike แล้วหรือยัง
    const checkExistQuery = `
        SELECT * FROM userdislike 
        WHERE dislikerID = ? AND dislikedID = ?
    `;

    db.query(checkExistQuery, [dislikerID, dislikedID], (err, result) => {
        if (err) return res.status(500).send(err);

        if (result.length > 0) {
            // ถ้าเคย Dislike แล้วให้ตอบกลับว่า Dislike สำเร็จโดยไม่ต้องทำซ้ำ
            return res.status(200).json({ success: true, message: 'Already disliked this user' });
        }

        // เริ่ม Transaction เพื่อเพิ่ม Dislike และลบ Like ใน table userlike
        db.beginTransaction((err) => {
            if (err) return res.status(500).send(err);

            // ลบข้อมูลใน table userlike ก่อน
            const deleteLikeQuery = `
                DELETE FROM userlike 
                WHERE likerID = ? AND likedID = ?
            `;

            db.query(deleteLikeQuery, [dislikerID, dislikedID], (err, result) => {
                if (err) {
                    return db.rollback(() => {
                        res.status(500).send(err);
                    });
                }

                // เพิ่ม Dislike ลงในฐานข้อมูล
                const insertDislikeQuery = 'INSERT INTO userdislike (dislikerID, dislikedID) VALUES (?, ?)';
                db.query(insertDislikeQuery, [dislikerID, dislikedID], (err, result) => {
                    if (err) {
                        return db.rollback(() => {
                            res.status(500).send(err);
                        });
                    }

                    // Commit Transaction ถ้าทำงานสำเร็จทั้งหมด
                    db.commit((err) => {
                        if (err) {
                            return db.rollback(() => {
                                res.status(500).send(err);
                            });
                        }
                        res.status(200).json({ success: true, message: 'user disliked successfully and like removed' });
                    });
                });
            });
        });
    });
});

// ดึงผู้ใช้ที่เคยมากด Like user คนนี้ !!!ใหม่
debugger
app.get('/api_v2/wholike', (req, res) => {
    const userID = req.query.userID;  // userID ที่ล็อกอินอยู่ ต้องส่งมาจาก client

    if (!userID) {
        return res.status(400).json({ message: "กรุณาส่ง userID มาใน query string" });
    }

    const sql = `
    SELECT DISTINCT u.userID, u.nickname, u.verify, u.imageFile, u.DateBirth
    FROM userlike ul
    JOIN user u ON ul.likerID = u.userID
    WHERE ul.likedID = ?;
`;


    db.query(sql, [userID], (err, results) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ message: "เกิดข้อผิดพลาดในการดึงข้อมูล" });
        }

        res.json(results);  // ส่ง list user ที่มากดไลค์ user นี้
    });
});

// API user Detail
app.post('/api_v2/user/detail', (req, res) => {
    const { userID } = req.body;

    if (!userID) {
        return res.status(400).json({ message: "กรุณาส่ง userID ใน request body" });
    }

    // แก้ไขจาก targetUserID เป็น userID
    userService.getUserDetails(userID, (err, userData) => {
        if (err) {
            console.error('Error fetching user details:', err);
            if (err.message === "User not found") {
                return res.status(404).json({ message: "User not found." });
            }
            return res.status(500).json({ message: "Internal server error." });
        }
        res.json(userData);
    });
});


// API Check Match
app.post('/api_v2/check_match', (req, res) => {
    const { userID, likedID } = req.body;

    // Query เพื่อตรวจสอบว่าผู้ใช้ที่ถูก Like (likedID) กด Like ให้กับผู้ใช้ปัจจุบัน (userID) หรือไม่
    const checkMatchQuery = `
        SELECT * FROM userlike 
        WHERE likerID = ? AND likedID = ?
    `;

    db.query(checkMatchQuery, [likedID, userID], (err, result) => {
        if (err) {
            return res.status(500).json({ error: 'Database error' });
        }

        if (result.length > 0) {
            // ถ้าทั้งสองฝ่ายกด Like ให้กัน ให้แทรกข้อมูลลงในตาราง matches
            const insertMatchQuery = `
                INSERT INTO matches (user1ID, user2ID)
                VALUES (?, ?)
            `;

            // ตรวจสอบว่ามีการ Match อยู่แล้วหรือไม่
            const checkExistingMatchQuery = `
                SELECT * FROM matches
                WHERE (user1ID = ? AND user2ID = ?) OR (user1ID = ? AND user2ID = ?)
            `;

            db.query(checkExistingMatchQuery, [userID, likedID, likedID, userID], (err, existingMatch) => {
                if (err) {
                    return res.status(500).json({ error: 'Database error' });
                }

                if (existingMatch.length > 0) {
                    // ถ้ามี Match อยู่แล้ว
                    return res.status(200).json({ match: true, message: 'Match already exists' });
                } else {
                    // แทรกข้อมูล Match ใหม่ลงในตาราง matches
                    db.query(insertMatchQuery, [userID, likedID], (err, matchResult) => {
                        if (err) {
                            return res.status(500).json({ error: 'Failed to insert match' });
                        }
                        return res.status(200).json({ match: true, message: 'New match created' });
                    });
                }
            });
        } else {
            // ถ้าอีกฝ่ายยังไม่ได้กด Like ให้ผู้ใช้ปัจจุบัน
            return res.status(200).json({ match: false });
        }
    });
});



///////////////////////////////////////////////////////////// Chat /////////////////////////////////////////////////////////////



// API Get Match
app.get('/api_v2/matches/:userID', (req, res) => {
    const { userID } = req.params;

    const getMatchedusersWithLastMessageQuery = `
        SELECT u.userID, u.nickname, u.imageFile,
               (SELECT c.message FROM chats c WHERE c.matchID = m.matchID ORDER BY c.timestamp DESC LIMIT 1) AS lastMessage,
               m.matchID,
               DATE_FORMAT(GREATEST(
                   COALESCE((SELECT c.timestamp FROM chats c WHERE c.matchID = m.matchID ORDER BY c.timestamp DESC LIMIT 1), '1970-01-01 00:00:00'), 
                   m.matchDate), '%H:%i') AS lastInteraction,
               GREATEST(
                   COALESCE((SELECT c.timestamp FROM chats c WHERE c.matchID = m.matchID ORDER BY c.timestamp DESC LIMIT 1), '1970-01-01 00:00:00'), 
                   m.matchDate) AS fullLastInteraction,
               COALESCE(b.isBlocked, 0) AS isBlocked -- แสดงสถานะการบล็อค
        FROM matches m
        JOIN user u ON (m.user1ID = u.userID OR m.user2ID = u.userID)
        LEFT JOIN deleted_chats d ON d.matchID = m.matchID AND d.userID = ?
        LEFT JOIN blocked_chats b ON b.matchID = m.matchID AND b.user1ID = ?
        WHERE (m.user1ID = ? OR m.user2ID = ?)
          AND u.userID != ?
          AND (d.deleted IS NULL OR (SELECT COUNT(*) FROM chats c WHERE c.matchID = m.matchID AND c.timestamp > d.deleteTimestamp) > 0) 
        ORDER BY fullLastInteraction DESC;
    `;

    db.query(getMatchedusersWithLastMessageQuery, [userID, userID, userID, userID, userID], (err, results) => {
        if (err) {
            return res.status(500).json({ error: 'Database error' });
        }

        results.forEach(user => {
            if (user.imageFile && !user.imageFile.startsWith('http')) {
                // เพิ่ม URL แบบเต็มเฉพาะเมื่อ imageFile ไม่ได้เริ่มด้วย "http"
                user.imageFile = `${req.protocol}://${req.get('host')}/api_v2/user/image/${user.imageFile}`;
                console.log("Full image URL:", user.imageFile); // ตรวจสอบ URL เต็ม
            }

            if (user.lastMessage === null) {
                user.lastMessage = "เริ่มแชทกันเลย !!!";
            }
        });

        return res.status(200).json(results);
    });
});



// API Chat (ส่งข้อความ)
app.post('/api_v2/chats/:matchID', (req, res) => {
    const { matchID } = req.params;
    const { senderID, message } = req.body;

    // ตรวจสอบสถานะการบล็อกก่อนที่จะบันทึกข้อความ
    const checkBlockQuery = `
        SELECT isBlocked FROM blocked_chats 
        WHERE matchID = ? AND isBlocked = 1 AND (user1ID = ? OR user2ID = ?)
    `;

    db.query(checkBlockQuery, [matchID, senderID, senderID], (err, results) => {
        if (err) {
            return res.status(500).json({ error: 'Database error' });
        }

        if (results.length > 0) {
            return res.status(403).json({ error: 'You have been blocked from sending messages in this chat' });
        }

        // บันทึกข้อความถ้าไม่ถูกบล็อค
        const insertChatQuery = `
            INSERT INTO chats (matchID, senderID, message, timestamp)
            VALUES (?, ?, ?, NOW())
        `;

        db.query(insertChatQuery, [matchID, senderID, message], (err, result) => {
            if (err) {
                return res.status(500).json({ error: 'Database error' });
            }
            res.status(200).json({ success: 'Message sent' });
        });
    });
});



// API Show Chat
app.get('/api_v2/chats/:matchID', (req, res) => {
    const { matchID } = req.params;

    const getChatQuery = `
        SELECT c.senderID, u.nickname, u.imageFile, c.message, c.timestamp 
        FROM chats c
        JOIN user u ON c.senderID = u.userID
        WHERE c.matchID = ?
        ORDER BY c.timestamp ASC;
    `;

    db.query(getChatQuery, [matchID], (err, results) => {
        if (err) {
            return res.status(500).json({ error: 'Database error' });
        }

        // ตรวจสอบและปรับปรุงเส้นทางของ imageFile สำหรับผู้ใช้แต่ละคน
        results.forEach(chat => {
            if (chat.imageFile) {
                chat.imageFile = `${req.protocol}://${req.get('host')}/assets/user/${chat.imageFile}`;
            }

            // ตรวจสอบถ้า message เป็น null ให้แสดงข้อความ "เริ่มแชทกันเลย !!!"
            if (chat.message === null) {
                chat.message = "เริ่มแชทกันเลย !!!";
            }
        });

        return res.status(200).json({ messages: results });
    });
});



// API Chat New Message
app.post('/api_v2/chats/:matchID', (req, res) => {
    const { matchID } = req.params;
    const { senderID, message } = req.body; // รับ senderID และข้อความจาก body ของ request

    const insertChatQuery = `
        INSERT INTO chats (matchID, senderID, message, timestamp)
        VALUES (?, ?, ?, NOW())  -- ใช้ NOW() เพื่อบันทึกเวลาปัจจุบัน
    `;

    db.query(insertChatQuery, [matchID, senderID, message], (err, result) => {
        if (err) {
            return res.status(500).json({ error: 'Database error' });
        }

        // ส่งสถานะความสำเร็จกลับไป
        return res.status(200).json({ success: 'Message sent' });
    });
});


// API Delete Chat
app.post('/api_v2/delete-chat', (req, res) => {
    const { userID, matchID } = req.body;

    if (!userID || !matchID) {
        return res.status(400).json({ error: 'Missing userID or matchID' });
    }

    const deleteQuery = `
        INSERT INTO deleted_chats (userID, matchID, deleted)
        VALUES (?, ?, 1)
        ON DUPLICATE KEY UPDATE deleted = 1;
    `;

    db.query(deleteQuery, [userID, matchID], (err, result) => {
        if (err) {
            return res.status(500).json({ error: 'Database error' });
        }
        res.status(200).json({ success: 'Chat hidden successfully' });
    });
});


app.post('/api_v2/restore-all-chats', (req, res) => {
    const { userID } = req.body;

    if (!userID) {
        return res.status(400).json({ error: 'Missing userID' });
    }

    const restoreAllQuery = `
        DELETE FROM deleted_chats
        WHERE userID = ?;
    `;

    db.query(restoreAllQuery, [userID], (err, result) => {
        if (err) {
            return res.status(500).json({ error: 'Database error' });
        }
        res.status(200).json({ success: 'All chats restored successfully' });
    });
});

// API Block user
app.post('/api_v2/block-chat', (req, res) => {
    const { userID, matchID, isBlocked } = req.body;

    // Validate input
    if (!userID || !matchID || isBlocked === undefined) {
        return res.status(400).json({ error: 'Missing userID, matchID, or isBlocked' });
    }

    // Query to get user1ID and user2ID from the matches table
    const matchQuery = `SELECT user1ID, user2ID FROM matches WHERE matchID = ?`;
    db.query(matchQuery, [matchID], (err, results) => {
        if (err || results.length === 0) {
            console.error('Database error or match not found');
            return res.status(500).json({ error: 'Match not found or database error' });
        }

        // ดึงข้อมูล user1ID และ user2ID จากผลลัพธ์
        let { user1ID, user2ID } = results[0];

        console.log(`Initial values - Received userID: ${userID}, user1ID: ${user1ID}, user2ID: ${user2ID}`);

        // ถ้า userID ไม่ตรงกับ user1ID ให้สลับตำแหน่ง
        if (userID != user1ID) {
            console.log("Swapping positions as userID doesn't match user1ID");
            [user1ID, user2ID] = [user2ID, user1ID]; // สลับตำแหน่ง
            console.log(`Swapped values - user1ID: ${user1ID}, user2ID: ${user2ID}`);
        }

        // ดี
        // ตรวจสอบอีกครั้งเพื่อให้มั่นใจว่า user1ID และ user2ID ไม่ซ้ำกัน
        if (user1ID == user2ID) {
            console.log("Detected same IDs for user1ID and user2ID after swapping, correcting user2ID to the other user");
            user2ID = user1ID === results[0].user1ID ? results[0].user2ID : results[0].user1ID;
        }

        console.log(`Final values before blocking - user1ID: ${user1ID}, user2ID: ${user2ID}`);

        // ตรวจสอบว่า block record นี้มีอยู่แล้วหรือไม่
        const checkQuery = `SELECT blockID FROM blocked_chats WHERE user1ID = ? AND user2ID = ?`;
        db.query(checkQuery, [user1ID, user2ID], (err, checkResult) => {
            if (err) {
                console.error('Database error:', err);
                return res.status(500).json({ error: 'Database error' });
            }

            if (checkResult.length > 0) {
                // Block exists, update the isBlocked status and timestamp
                const updateQuery = `
                    UPDATE blocked_chats 
                    SET isBlocked = ?, blockTimestamp = NOW() 
                    WHERE user1ID = ? AND user2ID = ?`;
                db.query(updateQuery, [isBlocked ? 1 : 0, user1ID, user2ID], (err, result) => {
                    if (err) {
                        console.error('Database error:', err);
                        return res.status(500).json({ error: 'Database error' });
                    }
                    console.log(`Updated block status successfully: user1ID: ${user1ID}, user2ID: ${user2ID}, isBlocked: ${isBlocked}`);
                    res.status(200).json({ success: isBlocked ? 'Chat blocked successfully' : 'Chat unblocked successfully' });
                });
            } else {
                // No block exists, insert a new record
                const insertQuery = `
                    INSERT INTO blocked_chats (user1ID, user2ID, matchID, isBlocked, blockTimestamp)
                    VALUES (?, ?, ?, ?, NOW())`;
                db.query(insertQuery, [user1ID, user2ID, matchID, isBlocked ? 1 : 0], (err, result) => {
                    if (err) {
                        console.error('Database error:', err);
                        return res.status(500).json({ error: 'Database error' });
                    }
                    console.log(`Inserted new block record successfully: user1ID: ${user1ID}, user2ID: ${user2ID}, matchID: ${matchID}, isBlocked: ${isBlocked}`);
                    res.status(200).json({ success: 'Chat blocked successfully' });
                });
            }
        });
    });
});


// API Unblock user
app.post('/api_v2/unblock-chat', (req, res) => {
    const { userID, matchID } = req.body;

    if (!userID || !matchID) {
        return res.status(400).json({ error: 'Missing userID or matchID' });
    }

    // ตั้งค่า isBlocked ให้เป็น 0 เพื่อปลดบล็อค
    const unblockQuery = `
        UPDATE blocked_chats 
        SET isBlocked = 0 
        WHERE matchID = ? AND user1ID = ?;
    `;

    db.query(unblockQuery, [matchID, userID], (err, result) => {
        if (err) {
            console.error("Database error:", err);
            return res.status(500).json({ error: 'Database error' });
        }

        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'No match found to unblock' });
        }

        res.status(200).json({ success: 'Chat unblocked successfully' });
    });
});

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////



app.listen(process.env.SERVER_PORT, () => {
    console.log(`Server listening on port ${process.env.SERVER_PORT}`);
});
