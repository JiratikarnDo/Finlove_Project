import tensorflow as tf
from tensorflow.keras.preprocessing.image import ImageDataGenerator
from tensorflow.keras.applications import MobileNetV2
from tensorflow.keras.models import Model
from tensorflow.keras.layers import Dense, GlobalAveragePooling2D, Dropout
from tensorflow.keras.callbacks import ModelCheckpoint, EarlyStopping
import os
import sys


# Path ควรชี้ไปที่โฟลเดอร์ 'color' ที่มีโฟลเดอร์ย่อย 'live' และ 'spoof' อยู่
TRAIN_DATA_PATH = 'C:/Users/wmmyo/Downloads/archive/train_img/train_img/color/' 

IMAGE_SIZE = (224, 224) # ขนาดภาพมาตรฐานสำหรับ MobileNetV2
BATCH_SIZE = 32         # ขนาด Batch (ปรับได้ตามความสามารถของ GPU)
EPOCHS = 50             # จำนวนรอบการฝึกสูงสุด (จะหยุดเองด้วย EarlyStopping)
MODEL_NAME = 'best_liveness_model.h5'

# ตรวจสอบ Path ว่ามีอยู่จริงหรือไม่
if not os.path.exists(TRAIN_DATA_PATH):
    print(f"Error: ไม่พบ Path ข้อมูล: {TRAIN_DATA_PATH}")
    print("กรุณาแก้ไขตัวแปร TRAIN_DATA_PATH ให้ถูกต้อง")
    sys.exit(1)

# --- 2. Data Generators (โหลดและประมวลผลข้อมูล) ---

datagen = ImageDataGenerator(
    rescale=1./255, # ปรับค่าพิกเซลให้อยู่ในช่วง 0-1 (Normalization)
    validation_split=0.2 # แบ่ง 20% จากชุดฝึกทั้งหมดไปเป็น Validation
)

print("\n--- กำลังโหลดข้อมูล ---")
train_generator = datagen.flow_from_directory(
    TRAIN_DATA_PATH,
    target_size=IMAGE_SIZE,
    batch_size=BATCH_SIZE,
    class_mode='binary',
    subset='training'
)

validation_generator = datagen.flow_from_directory(
    TRAIN_DATA_PATH,
    target_size=IMAGE_SIZE,
    batch_size=BATCH_SIZE,
    class_mode='binary',
    subset='validation'
)

# โหลด MobileNetV2 ที่ฝึกบน ImageNet มาแล้ว
base_model = MobileNetV2(
    weights='imagenet', 
    include_top=False, # ไม่เอา Output Layer เดิม
    input_shape=IMAGE_SIZE + (3,)
)

# Freeze Base Layers: ล็อกน้ำหนักของ MobileNetV2 ไว้ก่อน
for layer in base_model.layers:
    layer.trainable = False 

# สร้าง Output Head สำหรับงาน Liveness Detection ของเรา
x = base_model.output
x = GlobalAveragePooling2D()(x) # ลดขนาด feature map
x = Dense(128, activation='relu')(x)
x = Dropout(0.5)(x) # ลด Overfitting
predictions = Dense(1, activation='sigmoid')(x) # Output สุดท้าย: Live (ใกล้ 1) หรือ Spoof (ใกล้ 0)

model = Model(inputs=base_model.input, outputs=predictions)

# Compile Model
model.compile(
    optimizer='adam', 
    loss='binary_crossentropy', 
    metrics=['accuracy']
)

# แสดงสรุปโครงสร้างโมเดล
model.summary()


# Callback 1: บันทึกโมเดลที่ดีที่สุด (จากการตรวจสอบ Validation Accuracy)
checkpoint = ModelCheckpoint(
    MODEL_NAME,
    monitor='val_accuracy', 
    save_best_only=True, 
    mode='max', 
    verbose=1
)

# Callback 2: หยุดการฝึกเมื่อประสิทธิภาพไม่ดีขึ้น (ป้องกัน Overfitting)
early_stopping = EarlyStopping(
    monitor='val_loss', 
    patience=10, 
    verbose=1
)

print("\n--- เริ่มการฝึกโมเดล Liveness Detection ---")
history = model.fit(
    train_generator,
    epochs=EPOCHS,
    validation_data=validation_generator,
    callbacks=[checkpoint, early_stopping]
)

print(f"\nการฝึกเสร็จสมบูรณ์. โมเดลที่ดีที่สุดถูกบันทึกในไฟล์: {MODEL_NAME}")