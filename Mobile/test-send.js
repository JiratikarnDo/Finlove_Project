import "dotenv/config";
import { sendMail } from "./ีutils/sendMail.js";

await sendMail("jiratikarn.pri@gmail.com", "ทดสอบส่งเมล", "สวัสดีจาก Finlove!");
