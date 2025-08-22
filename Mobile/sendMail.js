import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import nodemailer from "nodemailer";
import { google } from "googleapis";
import { fileURLToPath } from "url";
import crypto from "crypto";


const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.resolve(__dirname, "../.env");
console.log("Using .env at:", envPath, "exists?", fs.existsSync(envPath));
dotenv.config({ path: envPath, override: true });



function generateOtp(ttlMs = 5 * 60 * 1000) {
  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
  const expiresAt = new Date(Date.now() + ttlMs);
  const hash = crypto.createHash("sha256").update(code).digest("hex");
  return { code, hash, expiresAt };
}



const {
  CLIENT_ID,
  CLIENT_SECRET,
  REDIRECT_URI,
  REFRESH_TOKEN,
  MY_EMAIL
} = process.env;

const oAuth2Client = new google.auth.OAuth2(
  CLIENT_ID,
  CLIENT_SECRET,
  REDIRECT_URI
);

oAuth2Client.setCredentials({ refresh_token: REFRESH_TOKEN });

export async function sendMail(to, subject, text) {
  try {
    const accessToken = await oAuth2Client.getAccessToken();

    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        type: "OAuth2",
        user: MY_EMAIL,
        clientId: CLIENT_ID,
        clientSecret: CLIENT_SECRET,
        refreshToken: REFRESH_TOKEN,
        accessToken: accessToken.token,
      },
    });

    const mailOptions = {
      from: `Finlove OTP <${MY_EMAIL}>`,
      to,
      subject,
      text,
    };

    const result = await transporter.sendMail(mailOptions);
    return result;
  } catch (error) {
    console.error("Send mail error:", error);
    throw error;
  }
}
