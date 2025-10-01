import tensorflow as tf
from tensorflow.keras.preprocessing.image import img_to_array
import numpy as np
import cv2  # สำหรับ Face Detection
import os
import sys

# --- 1. กำหนดค่าและ Path ---

MODEL_PATH = 'best_liveness_model.h5'
FINAL_THRESHOLD = 0.3
IMAGE_SIZE = (224, 224)
# **Path ไปยังไฟล์ตรวจจับใบหน้า**
FACE_CASCADE_PATH = 'haarcascade_frontalface_default.xml' 

# **สำคัญ: แก้ไข Path นี้ให้ชี้ไปยังรูปภาพของคุณ**
# ผมแก้ไขเป็น 2.jpg เพื่อทดสอบตามรูปที่คุณเคยส่งมา
TEST_IMAGE_PATH = 'C:/Users/wmmyo/Downloads/test_model/12.jpg' 

# ตรวจสอบไฟล์
if not os.path.exists(TEST_IMAGE_PATH):
    print(f"Error: ไม่พบไฟล์ภาพที่ Path: {TEST_IMAGE_PATH}")
    sys.exit(1)

# --- 2. โหลดโมเดลและตัวตรวจจับใบหน้า ---

try:
    model = tf.keras.models.load_model(MODEL_PATH)
    face_detector = cv2.CascadeClassifier(FACE_CASCADE_PATH)
    if face_detector.empty():
        print(f"Error: ไม่พบไฟล์ตรวจจับใบหน้า {FACE_CASCADE_PATH}")
        sys.exit(1)
    print("โมเดล Liveness และตัวตรวจจับใบหน้าถูกโหลดเรียบร้อย.")
except Exception as e:
    print(f"Error ในการโหลด: {e}")
    sys.exit(1)


# --- 3. ฟังก์ชันหลักสำหรับทำนาย (รวม Cropping) ---

def check_liveness(image_path):
    """ตรวจจับใบหน้า, ครอป, ประมวลผล, และทำนายความเป็นคนจริง"""
    
    # 3.1 โหลดภาพด้วย OpenCV
    image = cv2.imread(image_path)
    if image is None:
        return 0.0, "ERROR: ไม่สามารถโหลดไฟล์ภาพได้ (ตรวจสอบ Path/นามสกุล)"

    # แปลงเป็น GrayScale เพื่อตรวจจับใบหน้า (เร็วขึ้น)
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    
    # ตรวจจับใบหน้า
    faces = face_detector.detectMultiScale(
        gray, 
        scaleFactor=1.1, 
        minNeighbors=5, 
        minSize=(30, 30)
    )

    if len(faces) == 0:
        # โมเดลปฏิเสธเพราะหาใบหน้าไม่เจอ
        return 0.0, "SPOOF (ปฏิเสธ: ไม่พบใบหน้า หรือภาพไม่ชัด)"
    
    # ใช้ใบหน้าแรกที่ตรวจจับได้
    (x, y, w, h) = faces[0]
    
    # 3.2 ครอปและปรับขนาดใบหน้า
    # ตัดภาพให้เหลือเฉพาะใบหน้า
    face_crop = image[y:y+h, x:x+w]
    
    # ปรับขนาดให้เท่ากับที่ใช้ฝึกโมเดล (224x224)
    processed_face = cv2.resize(face_crop, IMAGE_SIZE)
    
    # แปลงเป็น Array, Normalize, และเพิ่มมิติ Batch
    processed_face = processed_face.astype("float") / 255.0
    processed_face = img_to_array(processed_face)
    processed_face = np.expand_dims(processed_face, axis=0) 

    # 3.3 ทำนายผล
    prediction = model.predict(processed_face)[0][0] 
    
    # 3.4 การตัดสินใจด้วย Threshold
    if prediction >= FINAL_THRESHOLD:
        result = "LIVE (คนจริง)"
    else:
        result = "SPOOF (ปลอมแปลง)"
        
    return prediction, result

# --- 4. การแสดงผลลัพธ์ ---

score, final_result = check_liveness(TEST_IMAGE_PATH)

print("\n=================================================")
print("             ผลการทดสอบ Liveness              ")
print("=================================================")
print(f"รูปภาพ: {os.path.basename(TEST_IMAGE_PATH)}")
print(f"คะแนนความเชื่อมั่น (Score): {score:.4f}")
print(f"Threshold ที่ใช้ในการตัดสิน: {FINAL_THRESHOLD}")
print("-" * 49)
print(f"ผลลัพธ์สุดท้าย: {final_result}")
print("=================================================")