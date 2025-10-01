import os
import tensorflow as tf
from tensorflow.keras.preprocessing.image import ImageDataGenerator, img_to_array, load_img
import numpy as np

# --- กำหนดค่าและ Path ---
# เปลี่ยน Path นี้ให้เป็นตำแหน่งโฟลเดอร์ live ของภาพ Depth ของคุณ
# Path น่าจะเป็น: .../archive/train_img/train_img/depth/live/
DEPTH_LIVE_DIR = 'C:/Users/wmmyo/Downloads/archive/train_img/train_img/depth/live/' 
TARGET_ADD_COUNT = 850  # เป้าหมาย: 1252 - 405 = 847 ภาพใหม่

# Data Augmentation Generator สำหรับภาพขาวดำ/Depth
datagen = ImageDataGenerator(
    rotation_range=20,          # หมุนภาพ
    width_shift_range=0.1,      # เลื่อนแนวนอน
    height_shift_range=0.1,     # เลื่อนแนวตั้ง
    zoom_range=[0.8, 1.2],      # ซูม
    horizontal_flip=True,       # กลับภาพซ้ายขวา
    fill_mode='nearest'
)

# --- เริ่มกระบวนการสร้างภาพ ---
print(f"กำลังเพิ่มภาพ Live (Depth): {TARGET_ADD_COUNT} ภาพ")

count = 0
for filename in os.listdir(DEPTH_LIVE_DIR):
    if filename.endswith(('.jpg', '.png', '.jpeg')):
        # 1. โหลดภาพในโหมดสีเทา (Grayscale)
        img = load_img(os.path.join(DEPTH_LIVE_DIR, filename), color_mode='grayscale') 
        x = img_to_array(img)
        x = np.expand_dims(x, axis=0) 

        # 2. สร้างภาพใหม่จากภาพเดิม
        i = 0
        for batch in datagen.flow(x, batch_size=1, save_to_dir=DEPTH_LIVE_DIR, 
                                  save_prefix='aug_depth', save_format='png'):
            i += 1
            count += 1
            if i >= 2 and count > TARGET_ADD_COUNT: 
                break 
            if count >= TARGET_ADD_COUNT:
                break
        
    if count >= TARGET_ADD_COUNT:
        break

print(f"สร้างภาพ Live ใหม่ (Depth): {count} ภาพ")