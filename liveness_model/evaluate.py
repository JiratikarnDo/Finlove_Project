import tensorflow as tf
from tensorflow.keras.preprocessing.image import ImageDataGenerator
import numpy as np
import os
import sys
from sklearn.metrics import confusion_matrix

TEST_DATA_PATH = 'C:/Users/wmmyo/Downloads/archive/test_img/test_img/color/' 
MODEL_PATH = 'best_liveness_model.h5'

IMAGE_SIZE = (224, 224)
BATCH_SIZE = 32

# ตรวจสอบ Path และไฟล์โมเดล
if not os.path.exists(TEST_DATA_PATH) or not os.path.exists(MODEL_PATH):
    print("Error: ไม่พบ Path ข้อมูลทดสอบ หรือไฟล์โมเดล")
    print(f"Test Path: {TEST_DATA_PATH} | Model File: {MODEL_PATH}")
    sys.exit(1)

# โหลดโมเดลที่ดีที่สุด
print(f"--- โหลดโมเดล: {MODEL_PATH} ---")
model = tf.keras.models.load_model(MODEL_PATH)

# Test Data Generator: ห้ามทำ Augmentation, ต้อง Rescale เท่านั้น
test_datagen = ImageDataGenerator(rescale=1./255)

# โหลดข้อมูล Test Set
# shuffle=False เพื่อให้ลำดับของภาพตรงกับลำดับของ Label (y_true)
test_generator = test_datagen.flow_from_directory(
    TEST_DATA_PATH,
    target_size=IMAGE_SIZE,
    batch_size=BATCH_SIZE,
    class_mode='binary',
    shuffle=False 
)

# ----------------------------------------------------
# 3. การประเมินผลและการคำนวณ Metrics
# ----------------------------------------------------

print("\n--- เริ่มประเมินผลบน Test Set ---")
# 3.1 ทำการทำนายทั้งหมด
Y_pred_proba = model.predict(test_generator)
Y_pred_raw = Y_pred_proba.flatten() # ค่าความน่าจะเป็น (0.0 ถึง 1.0)

# 3.2 Label จริง (True Labels)
# Class indices: {0: 'live', 1: 'spoof'} หรือ {0: 'spoof', 1: 'live'}
# ให้ตรวจสอบลำดับคลาสจาก test_generator.class_indices 
# โดยทั่วไป Live ควรเป็น 0 และ Spoof ควรเป็น 1 (ถ้าคุณตั้งชื่อโฟลเดอร์)
Y_true = test_generator.classes 
# เราจะตั้งสมมติฐานว่า Spoof คือคลาสที่ 0 (0) และ Live คือคลาสที่ 1 (1) 
# ถ้าไม่ใช่ ให้สลับค่าในตัวแปร true_live_label และ true_spoof_label

# 3.3 กำหนดค่า Threshold ที่จะใช้
# โดยทั่วไป เริ่มจาก 0.5 และลองปรับหาค่าที่เหมาะสม
THRESHOLD = 0.5 

# 3.4 แปลงค่าความน่าจะเป็นเป็นคลาส (0 หรือ 1)
# ถ้า Pred_proba > Threshold ให้เป็นคลาส Live (1), ไม่อย่างนั้นเป็น Spoof (0)
Y_pred_class = (Y_pred_raw > THRESHOLD).astype(int) 

# 3.5 คำนวณ Confusion Matrix
# Matrix: [[TN, FP], [FN, TP]]
# TN (True Negative): Spoof ถูกทำนายว่า Spoof
# FP (False Positive): Spoof ถูกทำนายว่า Live (อันตราย! = APCER)
# FN (False Negative): Live ถูกทำนายว่า Spoof
# TP (True Positive): Live ถูกทำนายว่า Live
cm = confusion_matrix(Y_true, Y_pred_class)

# ----------------------------------------------------
# 4. คำนวณ Liveness Metrics
# ----------------------------------------------------

# Note: ต้องตรวจสอบลำดับคลาส (Live/Spoof) ใน cm[row, col] ให้ถูกต้องตามผลลัพธ์ generator
# สมมติฐาน: Live = 1, Spoof = 0
true_live_count = len([y for y in Y_true if y == 1]) # จำนวน Live จริงทั้งหมด
true_spoof_count = len([y for y in Y_true if y == 0]) # จำนวน Spoof จริงทั้งหมด

# --- Liveness Metrics (ISO/IEC 30107-3) ---

# APCER (Attack Presentation Classification Error Rate)
# อัตราที่ Spoof ถูกทำนายผิดว่าเป็น Live (ความปลอดภัย)
# False Positive / Total Spoof
FP = cm[0, 1] if 0 in test_generator.class_indices.values() else cm[1, 0] # ต้องตรวจสอบลำดับ cm ให้ดี
APCER = FP / true_spoof_count if true_spoof_count > 0 else 0

# BPCER (Bona Fide Presentation Classification Error Rate)
# อัตราที่ Live ถูกทำนายผิดว่าเป็น Spoof (ประสบการณ์ผู้ใช้)
# False Negative / Total Live
FN = cm[1, 0] if 1 in test_generator.class_indices.values() else cm[0, 1]
BPCER = FN / true_live_count if true_live_count > 0 else 0

# ACER (Average Classification Error Rate)
ACER = (APCER + BPCER) / 2

# Test Accuracy โดยรวม
test_loss, test_accuracy = model.evaluate(test_generator, verbose=0)

# --- แสดงผลลัพธ์ ---

print("\n=================================================")
print("          สรุปผลการประเมิน (Test Set)            ")
print("=================================================")
print(f"Total Test Samples: {test_generator.samples}")
print(f"Threshold: {THRESHOLD}")
print("-" * 49)
print(f"Test Accuracy (รวม): {test_accuracy*100:.2f}%")
print("-" * 49)
print("--- Liveness Metrics ---")
print(f"APCER (ความปลอดภัย): {APCER*100:.2f}% (ต้องต่ำที่สุด)")
print(f"BPCER (ประสบการณ์ผู้ใช้): {BPCER*100:.2f}% (ต้องต่ำที่สุด)")
print(f"ACER (ค่าเฉลี่ยความผิดพลาด): {ACER*100:.2f}%")
print("=================================================")
print(f"Confusion Matrix:\n{cm}")
print("\n*หมายเหตุ: APCER คือความเสี่ยงที่ Spoof จะผ่านระบบ")