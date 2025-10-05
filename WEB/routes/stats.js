const express = require('express');
const router = express.Router();

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const mysql = require('mysql2');

// ===== helpers =====
const toYMD = (d) => d.toISOString().slice(0, 10);
const parseYMD = (s) => (s ? new Date(`${s}T00:00:00Z`) : null);

const db = mysql.createPool({
  host:     process.env.DATABASE_HOST,
  user:     process.env.DATABASE_USER,
  password: process.env.DATABASE_PASSWORD,
  database: process.env.DATABASE_NAME, 
  waitForConnections: true,
  connectionLimit: 10,
  timezone: 'Z',
  dateStrings: true,
}).promise();

// ---- /stats/total-users?from=YYYY-MM-DD&to=YYYY-MM-DD
router.get('/total-users', async (req, res) => {
  try {
    const f = parseYMD(req.query.from);
    const t = parseYMD(req.query.to);

    let sql = 'SELECT COUNT(*) AS total_users FROM `user`';
    const p = [];
    if (f && t) {
      sql += ' WHERE created_at >= ? AND created_at < DATE_ADD(?, INTERVAL 1 DAY)';
      p.push(toYMD(f), toYMD(t));
    }

    const [rows] = await db.query(sql, p);
    res.json(rows[0] || { total_users: 0 });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'db_error' });
  }
});

// ---- /stats/total-reported-users?from=YYYY-MM-DD&to=YYYY-MM-DD
router.get('/total-reported-users', async (req, res) => {
  try {
    const f = parseYMD(req.query.from);
    const t = parseYMD(req.query.to);

    let sql = 'SELECT COUNT(DISTINCT reportedID) AS total_reported_users FROM userreport';
    const p = [];
    if (f && t) {
      sql += ' WHERE created_at >= ? AND created_at < DATE_ADD(?, INTERVAL 1 DAY)';
      p.push(toYMD(f), toYMD(t));
    }

    const [rows] = await db.query(sql, p);
    res.json(rows[0] || { total_reported_users: 0 });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'db_error' });
  }
});

const startOfWeekMonUTC = (d) => {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  // ทำให้ Monday = 0 ... Sunday = 6
  const weekdayMon0 = (x.getUTCDay() + 6) % 7;
  x.setUTCDate(x.getUTCDate() - weekdayMon0);
  return x;
};

router.get('/series', async (req, res) => {
  try {
    const groupBy = (req.query.groupBy || 'day').toLowerCase();
    const today = new Date(); today.setUTCHours(0,0,0,0);

    let t = parseYMD(req.query.to) || today;
    let f = parseYMD(req.query.from) || new Date(Date.UTC(
      t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate() - 6
    ));
    if (f > t) [f, t] = [t, f];

    const bucket = groupBy === 'week'
      ? 'DATE(DATE_SUB(created_at, INTERVAL WEEKDAY(created_at) DAY))'
      : 'DATE(created_at)';

    const params = [toYMD(f), toYMD(t)];

    const usersSQL = `
      SELECT ${bucket} AS bucket, COUNT(*) AS users
      FROM \`user\`
      WHERE created_at >= ? AND created_at < DATE_ADD(?, INTERVAL 1 DAY)
      GROUP BY bucket ORDER BY bucket
    `;
    const reportsSQL = `
      SELECT ${bucket} AS bucket, COUNT(DISTINCT reportedID) AS reports
      FROM userreport
      WHERE created_at >= ? AND created_at < DATE_ADD(?, INTERVAL 1 DAY)
      GROUP BY bucket ORDER BY bucket
    `;

    const [[uRows], [rRows]] = await Promise.all([
      db.query(usersSQL, params),
      db.query(reportsSQL, params),
    ]);

    const key = x => toYMD(new Date(x.bucket));
    const uMap = new Map(uRows.map(x => [key(x), Number(x.users)]));
    const rMap = new Map(rRows.map(x => [key(x), Number(x.reports)]));

    // *** จุดสำคัญ: align ช่วงวนลูปให้ตรง "จันทร์ของสัปดาห์" ***
    let itStart = f;
    let itEnd   = t;
    let step = 1;
    if (groupBy === 'week') {
      itStart = startOfWeekMonUTC(f);
      itEnd   = startOfWeekMonUTC(t);
      step = 7;
    }

    const data = [];
    for (let d = new Date(itStart); d <= itEnd; d.setUTCDate(d.getUTCDate() + step)) {
      const k = toYMD(d); // k จะตรงกับคีย์ใน uMap/rMap แล้ว
      data.push({ date: k, users: uMap.get(k) || 0, reports: rMap.get(k) || 0 });
    }

    res.json(data);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'db_error' });
  }
});

module.exports = router;
