import { google } from "googleapis";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.resolve(__dirname, "../.env");

dotenv.config({ path: envPath, override: true });

const {
  CLIENT_ID,
  CLIENT_SECRET,
  REFRESH_TOKEN,
  MY_EMAIL,
} = process.env;

const oAuth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET);
oAuth2Client.setCredentials({ refresh_token: REFRESH_TOKEN });

const gmail = google.gmail({ version: "v1", auth: oAuth2Client });

function toBase64Url(str) {
  return Buffer.from(str)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export async function sendMail(to, subject, text) {
  try {
    const from = `Finlove OTP <${MY_EMAIL}>`;
    const message =
        `From: ${from}\r\n` +
        `To: ${to}\r\n` +
        `Subject: =?UTF-8?B?${Buffer.from(subject).toString("base64")}?=\r\n` +
        `Content-Type: text/plain; charset="UTF-8"\r\n` +
        `\r\n${text}`;

    const raw = toBase64Url(message);

    const res = await gmail.users.messages.send({
      userId: "me",
      requestBody: { raw },
    });

    console.log("REFRESH_TOKEN =", REFRESH_TOKEN ? "Loaded" : "Missing");
    console.log("✅ Mail sent:", res.data.id);
    return res.data;
  } catch (error) {
    console.log("REFRESH_TOKEN =", REFRESH_TOKEN ? "Loaded" : "Missing");
    console.error("❌ Send mail error:", error.response?.data || error.message);
    throw error;
  }
}
