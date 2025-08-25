import express from "express";
import mysql from "mysql2";
import bcrypt from "bcrypt";
import nodemailer from "nodemailer";
import multer from "multer";
import path, { dirname } from "path";
import fs from "fs";
import { v4 as uuidv4 } from "uuid";
import dotenv from "dotenv";
import jwt from "jsonwebtoken";
import { fileURLToPath } from "url";
import { sendMail } from "./sendMail.js";
import crypto from "crypto";


const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const app = express();
const saltRounds = 10;

fs.mkdirSync(path.resolve(__dirname, "../assets/user"), { recursive: true });

const USER_ASSETS_DIR = path.resolve(__dirname, "../assets/user");
fs.mkdirSync(USER_ASSETS_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, USER_ASSETS_DIR),
  filename: (req, file, cb) => cb(null, file.originalname),
});

const upload = multer({ storage: storage });
const router = express.Router();

const db = mysql.createConnection({
  host: process.env.DATABASE_HOST,
  user: process.env.DATABASE_USER,
  password: process.env.DATABASE_PASSWORD,
  database: process.env.DATABASE_NAME,
});


import helmet from "helmet";



//////////////////////////////// ลบส่วนนี้หาก manual ////////////////////////////
//const cors = require('cors');

// อนุญาตให้ fin-love.com เข้าถึง API
//app.use(cors({
    //origin: 'https://fin-love.com',  // ตั้งค่าให้ตรงกับโดเมนของคุณ
    //methods: ['GET', 'POST', 'PUT', 'DELETE'],  // ระบุ HTTP methods ที่อนุญาต
    //credentials: true  // หากต้องการให้ส่ง cookies หรือ header การยืนยัน
//}));
///////////////////////////////////////////////////////////////////////////////



db.connect();

app.use(helmet());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use("/assets/user", express.static(USER_ASSETS_DIR));

// สูตรคำนวณ ระยะห่างเป็น KM
function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371; // km
  const toRad = (deg) => (deg * Math.PI) / 180;

  const phi1 = toRad(lat1);
  const phi2 = toRad(lat2);
  const dPhi = toRad(lat2 - lat1);
  const dLam = toRad(lon2 - lon1);

  const a =
    Math.sin(dPhi / 2) ** 2 +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(dLam / 2) ** 2;

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c; // กิโลเมตร
}

function generateOTP(length = 6) {
  const digits = '0123456789';
  let otp = '';
  for (let i = 0; i < length; i++) {
    otp += digits[Math.floor(Math.random() * 10)];
  }
  return otp;
}

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

// กำหนดระยะเวลาว่ากี่นาทีหมดเวลา
function signAccess(payload) {
  return jwt.sign(payload, process.env.SECRET_KEY, { expiresIn: '2h' });
}

// เอาไว้เช็ค JWT ว่าถูกต้องหรือไม่
function requireAuth(req, res, next) {
  const h = req.headers.authorization || "";
  const token = h.startsWith("Bearer ") ? h.slice(7) : null;
  if (!token) return res.status(401).json({ message: "missing token" });
  try {
    const payload = jwt.verify(token, process.env.SECRET_KEY);
    // ให้มีทั้งสองแบบกันพัง
    req.user = payload.userID ? { userID: payload.userID, ...payload } : payload;
    req.viewerID = req.user.userID;
    return next();
  } catch (err) {
    return res.status(401).json({ message: "invalid or expired token" });
  }
}

function sendOtp(email, cb) {
  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 นาที
  const hash = crypto.createHash("sha256").update(code).digest("hex");

  // ลบ OTP เก่า
  db.query("DELETE FROM user_otp WHERE email = ?", [email], (err) => {
    if (err) return cb(err);

    // แทรก OTP ใหม่
    db.query(
      "INSERT INTO user_otp (email, otp_hash, expires_at, used, created_at) VALUES (?,?,?,?,NOW())",
      [email, hash, expiresAt, 0],
      (err2) => {
        if (err2) return cb(err2);

        // ส่งเมล
        sendMail(
          email,
          "รหัสยืนยัน Finlove",
          `รหัส OTP ของคุณคือ ${code} (หมดอายุใน 5 นาที)`
        )
          .then(() => cb(null))
          .catch(cb);
      }
    );
  });
}
app.post('/api_v2/login', (req, res) => {
  const { username, password } = req.body;
  const sql = "SELECT UserID, username, password, email, isActive, is_verified FROM user WHERE username = ?";

  db.query(sql, [username], (err, rows) => {
    if (err) {
      console.error("DB error:", err);
      return res.status(500).send("เกิดข้อผิดพลาดในการเชื่อมต่อ");
    }

    if (!rows.length) {
      return res.send({ status: false, message: "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง" });
    }

    const user = rows[0];

    // 1) ตรวจสอบว่าถูกปิดถาวรไหม
    if (user.isActive === 0) {
      return res.send({ status: false, message: "บัญชีถูกปิดใช้งาน กรุณาติดต่อผู้ดูแลระบบ" });
    }

    // 2) ตรวจสอบรหัสผ่านก่อน
    bcrypt.compare(password, user.password, (err, ok) => {
      if (err) {
        console.error("bcrypt error:", err);
        return res.status(500).send({ status: false, message: "เกิดข้อผิดพลาดในการตรวจสอบรหัสผ่าน" });
      }

      if (!ok) {
        return res.send({ status: false, message: "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง" });
      }

      // 3) เช็ค is_verified หลังจาก password ถูกต้องแล้ว
      if (user.is_verified === 0) {
        sendOtp(user.email, (err2) => {
          if (err2) {
            console.error("OTP error:", err2);
            return res.status(500).json({ status: false, message: "ส่ง OTP ไม่สำเร็จ" });
          }

          return res.status(403).json({
            status: false,
            next: "verify_otp_required",
            message: "บัญชียังไม่ได้ยืนยัน OTP ใหม่ถูกส่งไปยังอีเมลแล้ว"
          });
        });
        return; // ต้อง return ตรงนี้กัน response ซ้ำ
      }

      // 4) ถ้าทุกอย่างโอเค → ออก token ให้ login ได้
      const token = signAccess({ userID: user.UserID, username: user.username });
      return res.send({
        status: true,
        message: "เข้าสู่ระบบสำเร็จ",
        userID: user.UserID,
        token
      });
    });
  });
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

// ---------------- API Register + ส่ง OTP ----------------
app.post("/api_v2/register8", upload.single("imageFile"), (req, res) => {
  const {
    email, username, password, firstname, lastname, nickname,
    gender, height, phonenumber, home, dateOfBirth,
    educationID, preferences, goalID, interestGenderID, career_id , weight , province
  } = req.body;
  const fileName = req.file ? req.file.filename : null;

if (
  !email || !username || !password || !firstname || !lastname || !nickname ||
  !gender || !height || !phonenumber || !home || !dateOfBirth ||
  !educationID || !preferences || !goalID || !interestGenderID ||
  career_id === undefined || career_id === null ||
  weight === undefined || weight === null ||
  !province || !fileName
) {
  console.log('body:', req.body);
  console.log('file:', req.file);
  return res.status(400).send({ message: "ข้อมูลไม่ครบถ้วน", status: false });

}



  // ตรวจอีเมล/username ซ้ำ
  db.query(
    "SELECT UserID FROM user WHERE email = ? OR username = ? LIMIT 1",
    [email, username],
    (err, rows) => {
      if (err) {
        console.error(err);
        return res.status(500).send({ message: "DB error", status: false });
      }
      if (rows.length > 0) {
        return res.status(409).send({ message: "อีเมลหรือชื่อผู้ใช้ซ้ำ", status: false });
      }

      // หา GenderID
      db.query("SELECT GenderID FROM gender WHERE Gender_Name = ?", [gender], (err, g) => {
        if (err) {
          console.error(err);
          return res.status(500).send({ message: "DB error", status: false });
        }
        if (g.length === 0) {
          return res.status(404).send({ message: "ไม่พบข้อมูลเพศ", status: false });
        }
        const genderID = g[0].GenderID;

        // hash password (bcrypt ใช้ callback ได้)
        bcrypt.hash(password, saltRounds, (err, hashedPassword) => {
          if (err) {
            console.error(err);
            return res.status(500).send({ message: "Hash error", status: false });
          }

          // insert user
        const sqlInsert = `
            INSERT INTO user (
                username, password, email, firstname, lastname, nickname,
                GenderID, height, phonenumber, home, DateBirth,
                EducationID, goalID, imageFile, interestGenderID, is_verified, career_id, weight, province
            )
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,0,?,?,?)
            `;
          db.query(
            sqlInsert,
            [username, hashedPassword, email, firstname, lastname, nickname,
             genderID, height, phonenumber, home, dateOfBirth,
             educationID, goalID, fileName, interestGenderID, career_id, weight, province],
            (err, result) => {
              if (err) {
                console.error(err);
                return res.status(500).send({ message: "DB insert error", status: false });
              }
              const userID = result.insertId;

              // preferences
              const preferenceIDs = preferences.split(",").map((id) => parseInt(id));
              let done = 0;
              preferenceIDs.forEach((pid) => {
                db.query(
                  "INSERT INTO userpreferences (userID, PreferenceID) VALUES (?, ?)",
                  [userID, pid],
                  () => {
                    done++;
                    if (done === preferenceIDs.length) {
                      // หลังจาก preferences เสร็จ → ส่ง OTP
                      sendOtp(email, (err) => {
                        if (err) {
                          console.error("OTP error:", err);
                          return res.status(500).send({ message: "ส่ง OTP ไม่สำเร็จ", status: false });
                        }
                          console.log("OTP sent successfully");
                        return res.send({
                          message: "ลงทะเบียนสำเร็จ โปรดยืนยัน OTP ที่อีเมล",
                          status: true,
                          next: "verify_otp_required"
                        });
                      });
                    }
                  }
                );
              });
            }
          );
        });
      });
    }
  );
});


// API Register
// app.post('/api_v2/register8', upload.single('imageFile'), async function(req, res) {
//     const { email, username, password, firstname, lastname, nickname, gender, height, phonenumber, home, dateOfBirth, educationID, preferences, goalID, interestGenderID } = req.body;
//     const fileName = req.file ? req.file.filename : null;

//     // ตรวจสอบข้อมูลว่าครบถ้วนหรือไม่
//     if (!email || !username || !password || !firstname || !lastname || !nickname || !gender || !height || !phonenumber || !home || !dateOfBirth || !educationID || !preferences || !goalID || !interestGenderID || !fileName) {
//         console.log("ข้อมูลไม่ครบถ้วน", {
//             email, username, password, firstname, lastname, nickname, gender, height, phonenumber, home, dateOfBirth, educationID, preferences, goalID, interestGenderID, fileName
//         });
//         return res.status(400).send({ "message": "ข้อมูลไม่ครบถ้วน", "status": false });
//     }

//     try {
//         // ตรวจสอบว่าอีเมลหรือชื่อผู้ใช้ซ้ำหรือไม่
//         const [existingUser] = await db.promise().query("SELECT * FROM user WHERE email = ? OR username = ?", [email, username]);
//         if (existingUser.length > 0) {
//             return res.status(409).send({ "message": "อีเมลหรือชื่อผู้ใช้ซ้ำ กรุณาใช้ข้อมูลใหม่", "status": false });
//         }

//         // ทำการ hash รหัสผ่าน
//         const hashedPassword = await bcrypt.hash(password, saltRounds);

//         // ค้นหา GenderID
//         const [genderResult] = await db.promise().query("SELECT GenderID FROM gender WHERE Gender_Name = ?", [gender]);

//         if (genderResult.length === 0) {
//             console.log("ไม่พบข้อมูลเพศที่ระบุ");
//             return res.status(404).send({ "message": "ไม่พบข้อมูลเพศที่ระบุ", "status": false });
//         }

//         const genderID = genderResult[0].GenderID;

//         // Log ข้อมูลก่อนการบันทึกลง database
//         console.log("Inserting data into user: ", {
//             username, hashedPassword, email, firstname, lastname, nickname, genderID, height, phonenumber, home, dateOfBirth, educationID, goalID, fileName, interestGenderID
//         });

//         // บันทึกข้อมูลผู้ใช้
//         const sqlInsert = `
//             INSERT INTO user (username, password, email, firstname, lastname, nickname, GenderID, height, phonenumber, home, DateBirth, EducationID, goalID, imageFile, interestGenderID )
//             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
//         `;
//         const [insertResult] = await db.promise().query(sqlInsert, [username, hashedPassword, email, firstname, lastname, nickname, genderID, height, phonenumber, home, dateOfBirth, educationID, goalID, fileName, interestGenderID]);

//         const userID = insertResult.insertId;

//         // บันทึก preferences
//         const preferenceIDs = preferences.split(',').map(id => parseInt(id));
//         for (const preferenceID of preferenceIDs) {
//             await db.promise().query("INSERT INTO userpreferences (userID, PreferenceID) VALUES (?, ?)", [userID, preferenceID]);
//         }

//         console.log(`Preferences saved for user ${userID}: `, preferenceIDs);

//         res.send({ "message": "ลงทะเบียนสำเร็จ", "status": true });
//     } catch (err) {
//         console.error('Database error:', err);
//         res.status(500).send({ "message": "บันทึกลง FinLove ล้มเหลว", "status": false });
//     }
// });

// สร้าง OTP + ส่งเมล 
app.post("/api_v2/request-otp", (req, res) => {
  const { email } = req.body;
  if (!email) {
    return res.status(400).json({ message: "Email is required" });
  }

  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 นาที
  const hash = crypto.createHash("sha256").update(code).digest("hex");

  // ลบ OTP เก่าก่อน
  db.query("DELETE FROM user_otp WHERE email = ?", [email], (err) => {
    if (err) {
      console.error("DB delete error:", err);
      return res.status(500).json({ message: "DB error" });
    }

    // แทรก OTP ใหม่
    db.query(
      "INSERT INTO user_otp (email, otp_hash, expires_at) VALUES (?,?,?)",
      [email, hash, expiresAt],
      async (err) => {
        if (err) {
          console.error("DB insert error:", err);
          return res.status(500).json({ message: "DB error" });
        }

        try {
          // ส่งอีเมล
          await sendMail(
            email,
            "รหัสยืนยัน Finlove",
            `รหัส OTP ของคุณคือ ${code} (หมดอายุใน 5 นาที)`
          );
          res.json({ message: "OTP sent successfully" });
        } catch (mailErr) {
          console.error("Send mail error:", mailErr);
          res.status(500).json({ message: "Failed to send OTP" });
        }
      }
    );
  });
});

// API ตรวจสอบ verify OTP
app.post("/api_v2/verify-otp", (req, res) => {
  const { email, otp } = req.body;

  if (!email || !otp) {
    return res.status(400).json({ success: false, message: "Missing email or otp" });
  }

  // หา OTP ล่าสุด
  db.query(
    "SELECT * FROM user_otp WHERE email = ? AND used = 0 ORDER BY created_at DESC LIMIT 1",
    [email],(err, results) => {
      if (err) {
        console.error("DB error:", err);
        return res.status(500).json({ success: false, message: "Database error" });
      }

      if (results.length === 0) {
        return res.json({ success: false, message: "No OTP found or already used" });
      }

      const otpRecord = results[0];

      // เช็คการหมดอายุ
      if (new Date() > otpRecord.expires_at) {
        return res.json({ success: false, message: "OTP expired" });
      }

      // เช็ค hash
      bcrypt.compare(otp, otpRecord.otp_hash, (err, isMatch) => {
        if (err) {
          console.error("bcrypt error:", err);
          return res.status(500).json({ success: false, message: "Server error" });
        }

        const calc = crypto.createHash("sha256").update(String(otp)).digest("hex");
        if (calc !== otpRecord.otp_hash) {
            return res.json({ success:false, message:"Invalid OTP" });
        }

        // กำหนดเป็นใช้แล้ว == 1
        db.query("UPDATE user_otp SET used = 1 WHERE id = ?", [otpRecord.id]);

        db.query("UPDATE user SET is_verified = 1 WHERE email = ?", [email]);

        return res.json({ success: true, message: "OTP verified successfully" });
      });
    }
  );
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
_
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
    //ดึงรูปให้ตรง path
    const fp = path.join(USER_ASSETS_DIR, path.basename(req.params.filename));
  res.sendFile(fp, err => err && res.status(404).json({ error: "Image not found" }));
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
                const oldImagePath = path.join(__dirname, 'web', 'front-end', 'assets', 'employee', currentuser.imageFile);
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
  const userID = req.query.userID;
  if (!userID) {
    return res.status(400).json({ message: "กรุณาส่ง userID มาใน query string" });
  }

  // 1) ดึงความชอบของเราไว้หาว่า shared อะไร
  const prefSql = `
    SELECT p.PreferenceNames
    FROM userpreferences up
    JOIN preferences p ON up.PreferenceID = p.PreferenceID
    WHERE up.UserID = ?
    ORDER BY up.created_at DESC
    LIMIT 3
  `;

  db.query(prefSql, [userID], (err, myPrefs) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ message: "เกิดข้อผิดพลาดในการดึงข้อมูล" });
    }
    const myPrefNames = myPrefs.map(p => p.PreferenceNames);

    const sql = `
      SELECT L1.UserID, L1.nickname, L1.verify, L1.imageFile, L1.DateBirth,
             L1.distance_km,
             COALESCE(
               (
                 SELECT JSON_ARRAYAGG(p.PreferenceNames) AS preferences
                 FROM (
                   SELECT up.PreferenceID
                   FROM userpreferences up
                   WHERE up.UserID = L1.UserID
                   ORDER BY up.created_at DESC
                   LIMIT 3
                 ) latest_up
                 JOIN preferences p ON p.PreferenceID = latest_up.PreferenceID
               ),
               JSON_ARRAY()
             ) AS preferences
      FROM (
        SELECT u.UserID, u.nickname, u.verify, u.imageFile, u.DateBirth,
               
               6371 * ACOS(
                 LEAST(1, GREATEST(-1,
                   COS(RADIANS(me.latitude)) * COS(RADIANS(ll.latitude)) *
                   COS(RADIANS(ll.longitude) - RADIANS(me.longitude)) +
                   SIN(RADIANS(me.latitude)) * SIN(RADIANS(ll.latitude))
                 ))
               ) AS distance_km
        FROM (SELECT DISTINCT likerID FROM userlike WHERE likedID = ?) ul
        JOIN \`user\` u ON u.UserID = ul.likerID
        
        JOIN (
          SELECT l.userID, l.latitude, l.longitude
          FROM location l
          JOIN (
            SELECT userID, MAX(timestamp) AS ts
            FROM location
            GROUP BY userID
          ) t ON t.userID = l.userID AND t.ts = l.timestamp
        ) ll ON ll.userID = u.UserID
        
        JOIN (
          SELECT l.latitude, l.longitude
          FROM location l
          WHERE l.userID = ?
          ORDER BY l.timestamp DESC
          LIMIT 1
        ) me
      ) AS L1
      ORDER BY L1.distance_km ASC
    `;

    // พารามิเตอร์: 1) likedID (คือ userID ของเรา) 2) userID ของเรา (ดึงพิกัดล่าสุด)
    db.query(sql, [userID, userID], (err, results) => {
      if (err) {
        console.error(err);
        return res.status(500).json({ message: "เกิดข้อผิดพลาดในการดึงข้อมูล" });
      }

      results.forEach(r => {
        // preferences อาจถูกคืนเป็นสตริงในบางไดรเวอร์
        if (typeof r.preferences === 'string') r.preferences = JSON.parse(r.preferences);
        

        // ปัดทศนิยมระยะทางให้อ่านง่าย
        if (r.distance_km != null) r.distance_km = Number(r.distance_km.toFixed(2));

        // หา shared preferences กับเรา
        r.sharedPreferences = r.preferences
          .filter(p => myPrefNames.includes(p.name))
          .map(p => p.name);
      });

      res.json(results);
    });
  });
});


app.get('/api_v2/likedbyme', (req, res) => {
    const userID = req.query.userID;

    if (!userID) {
        return res.status(400).json({ message: "กรุณาส่ง userID มาใน query string" });
    }

    const sql = `
        SELECT DISTINCT u.userID, u.nickname, u.verify, u.imageFile, u.DateBirth
        FROM userlike ul
        JOIN user u ON ul.likedID = u.userID
        WHERE ul.likerID = ?;
    `;

    db.query(sql, [userID], (err, results) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ message: "เกิดข้อผิดพลาดในการดึงข้อมูล" });
        }
        res.json(results); // ส่ง array รายชื่อคนที่เราเคยไปกดไลค์
    });
});

// API user Detail
app.post('/api_v2/user/detail', requireAuth ,async (req, res) => {
    const viewerID = req.user.userID;
    const { userID } = req.body || {};

  if (!userID) {
    return res.status(400).json({ message: "กรุณาส่ง userID ใน request body" });
  }

  const sql = `
    SELECT 
      u.UserID, u.nickname, u.GenderID, u.DateBirth, u.imageFile, u.verify,

      /* พิกัด viewer (อาจเป็น NULL ถ้าไม่ส่ง viewerID) */
      me.latitude   AS me_lat,
      me.longitude  AS me_lon,

      /* พิกัดล่าสุดของ user เป้าหมาย */
      loc.latitude  AS user_lat,
      loc.longitude AS user_lon,

      /* ความชอบของ target (ล่าสุด 3) -> JSON array */
      COALESCE(
        (
          SELECT JSON_ARRAYAGG(p.PreferenceNames)
          FROM (
            SELECT up.PreferenceID
            FROM userpreferences up
            WHERE up.UserID = u.UserID
            ORDER BY up.created_at DESC
            LIMIT 3
          ) latest_up
          JOIN preferences p ON p.PreferenceID = latest_up.PreferenceID
        ),
        JSON_ARRAY()
      ) AS preferences,

      /* ความชอบที่ตรงกับ viewer (ล่าสุด 3) -> JSON array */
      COALESCE(
        (
          SELECT JSON_ARRAYAGG(p.PreferenceNames)
          FROM (
            SELECT up.PreferenceID
            FROM userpreferences up
            WHERE up.UserID = u.UserID
              AND up.PreferenceID IN (
                SELECT upv.PreferenceID
                FROM userpreferences upv
                WHERE upv.UserID = ?
                /* ถ้าต้องการจำกัดชุดฝั่ง viewer ให้ใส่ ORDER BY + LIMIT ได้ */
              )
            ORDER BY up.created_at DESC
            LIMIT 3
          ) tgt_shared
          JOIN preferences p ON p.PreferenceID = tgt_shared.PreferenceID
        ),
        JSON_ARRAY()
      ) AS shared_preferences,

      /* จำนวนความชอบที่ตรงกันทั้งหมด (distinct) */
      (
        SELECT COUNT(DISTINCT up.PreferenceID)
        FROM userpreferences up
        WHERE up.UserID = u.UserID
          AND up.PreferenceID IN (
            SELECT upv.PreferenceID
            FROM userpreferences upv
            WHERE upv.UserID = ?
          )
      ) AS shared_count

    FROM \`user\` u

    /* พิกัดล่าสุดของ user เป้าหมาย */
    LEFT JOIN (
      SELECT l.userID, l.latitude, l.longitude
      FROM location l
      JOIN (
        SELECT userID, MAX(\`timestamp\`) AS ts
        FROM location
        GROUP BY userID
      ) t ON t.userID = l.userID AND t.ts = l.\`timestamp\`
    ) loc ON loc.userID = u.UserID

    /* พิกัดล่าสุดของผู้ชม (viewer) */
    LEFT JOIN (
      SELECT l.latitude, l.longitude
      FROM location l
      WHERE l.userID = ?
      ORDER BY l.\`timestamp\` DESC
      LIMIT 1
    ) me ON 1=1

    WHERE u.UserID = ?;
  `;

  try {
    const params = [viewerID, viewerID, viewerID, userID];
    const [rows] = await db.promise().query(sql, params);

    if (!rows?.length) {
      return res.status(404).json({ message: "User not found." });
    }

    const row = rows[0];

    if (typeof row.preferences === 'string') {
      try { row.preferences = JSON.parse(row.preferences); } catch { row.preferences = []; }
    }
    if (typeof row.shared_preferences === 'string') {
      try { row.shared_preferences = JSON.parse(row.shared_preferences); } catch { row.shared_preferences = []; }
    }

    // คำนวณระยะทางด้วย Haversine (ถ้ามีพิกัดครบ)
    console.log("me:", row.me_lat, row.me_lon, "target:", row.user_lat, row.user_lon);
    let distance_km = null;
    if (
      row.me_lat != null && row.me_lon != null &&
      row.user_lat != null && row.user_lon != null
    ) {
      distance_km = Number(haversine(row.me_lat, row.me_lon, row.user_lat, row.user_lon).toFixed(2));
    }

    // shape output ให้เหมือนอันบน
    const out = {
      UserID: row.UserID,
      nickname: row.nickname,
      GenderID: row.GenderID,
      DateBirth: row.DateBirth,
      imageFile: row.imageFile,
      verify: row.verify,
      distance_km,
      preferences: row.preferences,
      shared_preferences: row.shared_preferences,
      shared_count: row.shared_count ?? 0,
    };

    return res.json(out);
  } catch (err) {
    console.error('Error fetching user detail:', err);
    return res.status(500).json({ message: "Internal server error." });
  }
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

// API add-location คำนวณรัดติจูด ลองติจูด
debugger
app.post('/api_v2/add-location', requireAuth, async (req, res) => {
  const userID = req.user.userID;
  const { latitude, longitude } = req.body;

  // ===== เพิ่ม log ตรงนี้ =====
  console.log('[add-location]', {
    userID,
    latitude,
    longitude,
    body: req.body,
    headers: req.headers
  });
  // ===========================

  if (!latitude || !longitude) {
    return res.status(400).json({ error: 'Latitude and Longitude are required' });
  }

  try {
    // 1. ตรวจสอบว่า User มีในฐานข้อมูลหรือไม่
    const [users] = await db.promise().query('SELECT * FROM user WHERE userID = ?', [userID]);
    if (users.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    // 2. เพิ่มข้อมูล location (สมมุติว่ามีตารางชื่อ location)
    const [result] = await db.promise().query(
      'INSERT INTO location (userID, latitude, longitude) VALUES (?, ?, ?)',
      [userID, latitude, longitude]
    );

    res.status(201).json({
      message: 'ข้อมูลตำแหน่งถูกเพิ่มสำเร็จ',
      locationID: result.insertId,
      userID,
      latitude,
      longitude
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message || 'ไม่สามารถเพิ่มข้อมูลได้' });
  }
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
