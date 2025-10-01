from fastapi import FastAPI, UploadFile, File, HTTPException
from tensorflow.keras.models import load_model
from tensorflow.keras.preprocessing.image import img_to_array
import numpy as np
import cv2
import uvicorn
import socket
import sys
import os

# --- 1. กำหนดค่าและ Path ---
MODEL_PATH = 'best_liveness_model.h5' 
FINAL_THRESHOLD = 0.3
IMAGE_SIZE = (224, 224)
SERVER_PORT = 8000

app = FastAPI(title="Finlove Face Liveness API")

# --- 2. โหลดโมเดลและตัวตรวจจับใบหน้า ---
try:
    liveness_model = load_model(MODEL_PATH)
    # ใช้ Path แบบสัมพัทธ์ (relative path) เพื่อหาไฟล์ XML 
    script_dir = os.path.dirname(__file__)
    cascade_path = os.path.join(script_dir, 'haarcascade_frontalface_default.xml')

    face_detector = cv2.CascadeClassifier(cascade_path)
    if face_detector.empty():
        print(f"API ERROR: ไม่พบไฟล์ตรวจจับใบหน้า XML ที่: {cascade_path}")
        sys.exit(1)
        
    print("API: โมเดล Liveness ถูกโหลดเรียบร้อย.")
except Exception as e:
    print(f"API ERROR: ไม่สามารถโหลดโมเดลหรือ Detector ได้: {e}")
    
# --- 3. API Endpoint ---
@app.post("/api/v1/liveness_check")
async def liveness_check(file: UploadFile = File(...)):
    
    # 3.1 อ่านไฟล์ภาพ
    contents = await file.read()
    np_array = np.frombuffer(contents, np.uint8)
    image = cv2.imdecode(np_array, cv2.IMREAD_COLOR)

    if image is None:
        raise HTTPException(status_code=400, detail="ไม่สามารถประมวลผลไฟล์ภาพได้")

    # 3.2 Face Detection และ Cropping
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    
    # **แก้ไขแล้ว: ใช้พารามิเตอร์หลัก 4 ตัว**
    faces = face_detector.detectMultiScale(
        gray, 
        scaleFactor=1.1,      # ลดขนาดภาพทีละ 10%
        minNeighbors=5,       # ต้องมีจุดพบ 5 ครั้งถึงจะยืนยันว่าเป็นใบหน้า
        minSize=(30, 30)      # ขนาดต่ำสุด 30x30 pixels
    )
    
    # การจัดการ Error เมื่อไม่พบใบหน้า
    if len(faces) == 0:
        return {
            "is_live": False,
            "score": 0.0,
            "threshold_used": FINAL_THRESHOLD,
            "detail": "ไม่พบใบหน้าในภาพ (SPOOF/วัตถุอื่น)"
        }
    
    # ใช้วัตถุแรกที่ตรวจจับได้
    (x, y, w, h) = faces[0]
    face_crop = image[y:y+h, x:x+w]
    processed_face = cv2.resize(face_crop, IMAGE_SIZE)
    
    # 3.3 Pre-processing สำหรับโมเดล
    processed_face = processed_face.astype("float") / 255.0
    processed_face = img_to_array(processed_face)
    processed_face = np.expand_dims(processed_face, axis=0) 

    # 3.4 ทำนายผล
    score = liveness_model.predict(processed_face)[0][0] 
    
    # 3.5 การตัดสินใจด้วย Threshold
    is_live = bool(score >= FINAL_THRESHOLD)
    
    return {
        "is_live": is_live,
        "score": float(score),
        "threshold_used": FINAL_THRESHOLD,
        "message": "LIVE (ยืนยัน)" if is_live else "SPOOF (ปฏิเสธ)"
    }

# --- 4. จุดเริ่มต้นการรัน Server (Embed Uvicorn) ---
if __name__ == "__main__":
    
    # --- 1. ค้นหา Local IP Address ของเครื่อง ---
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80)) 
        local_ip = s.getsockname()[0]
        s.close()
    except Exception:
        local_ip = "127.0.0.1"
    
    # --- 2. แสดงผลข้อมูลการเข้าถึง ---
    print("\n=====================================================")
    print(f"API Liveness Server กำลังทำงานที่:")
    print(f" - Local URL (ทดสอบในเครื่อง): http://localhost:{SERVER_PORT}")
    print(f" - Network URL (สำหรับ Mobile App): http://{local_ip}:{SERVER_PORT}")
    print("=====================================================")

    # --- 3. สั่งรัน Uvicorn ---
    uvicorn.run("liveness:app", host="0.0.0.0", port=SERVER_PORT, reload=True)
