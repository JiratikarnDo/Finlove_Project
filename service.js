const mysql = require('mysql2');
require('dotenv').config();

const db = mysql.createConnection({
    host: process.env.DATABASE_HOST,
    user: process.env.DATABASE_USER,
    password: process.env.DATABASE_PASSWORD,
    database: process.env.DATABASE_NAME
});

const userService = {
     getUserDetails: (userID, callback) => {
        const sql = `
            SELECT userID, nickname, GenderID, DateBirth, imageFile, verify 
            FROM user 
            WHERE userID = ?;
        `;

        db.query(sql, [userID], (err, results) => {
            if (err) {
                return callback(err, null);
            }
            if (results.length === 0) {
                return callback(new Error("User not found"), null);
            }
            callback(null, results[0]);
        });
    }
    // คุณสามารถเพิ่มฟังก์ชันอื่นๆ ที่เกี่ยวข้องกับ user หรือ database ที่นี่ได้
};

module.exports = userService;
