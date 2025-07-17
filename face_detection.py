import cv2 as cv
import numpy as np
import os
from flask import Flask, request, jsonify
import tensorflow as tf
import mysql.connector
from datetime import datetime
from flask_cors import CORS
import threading
from werkzeug.utils import secure_filename

app = Flask(__name__)
CORS(app)

MODEL_PATH = 'model_finlove.h5'
LABELS_PATH = 'star-labels.txt'

model = tf.keras.models.load_model(MODEL_PATH)

db = mysql.connector.connect(
    host="localhost",
    user="root",
    password="1234",  # เปลี่ยนเป็นรหัสผ่าน MySQL ของคุณ
    database="finlove"  # เปลี่ยนเป็นชื่อฐานข้อมูลของคุณ
)

def delete_file_after_delay(file_path, delay):
    def delete_file():
        if os.path.exists(file_path):
            os.remove(file_path)
            print(f"{file_path} has been deleted.")
    timer = threading.Timer(delay, delete_file)
    timer.start()

@app.route('/ai/predict', methods=['POST'])
def predict():
    if 'image' not in request.files or 'UserID' not in request.form:
        return jsonify({"error": "Missing image or UserID"}), 400

    file = request.files['image']
    user_id = request.form['UserID']

    filename = secure_filename(file.filename)
    allowed_extensions = {'png', 'jpg', 'jpeg'}
    if not ('.' in filename and filename.rsplit('.', 1)[1].lower() in allowed_extensions):
        return jsonify({"error": "Invalid file type"}), 400

    if not os.path.exists('uploads'):
        os.makedirs('uploads')

    file_path = os.path.join('uploads', filename)
    file.save(file_path)

    delete_file_after_delay(file_path, 180)

    try:
        image = tf.keras.preprocessing.image.load_img(file_path, target_size=(224, 224))
        image = tf.keras.preprocessing.image.img_to_array(image)
        image = tf.expand_dims(image, axis=0)
    except Exception as e:
        return jsonify({"error": f"Image processing error: {str(e)}"}), 500

    try:
        predictions = model.predict(image, verbose=0)
        predicted_class = int(tf.argmax(predictions, axis=1).numpy()[0])
        confidence_score = float(predictions[0][predicted_class])  # Convert to float for JSON serialization
    except Exception as e:
        return jsonify({"error": f"Model prediction error: {str(e)}"}), 500

    # กำหนดค่า is_human ตาม confidence_score โดยใช้เกณฑ์ใหม่
    is_human = confidence_score < 0.95  # ถ้า confidence_score น้อยกว่า 95 จะถือว่าเป็นมนุษย์
    verification_status = 1 if is_human else 0  # ถ้าเป็นมนุษย์จะเป็น 1, ถ้าไม่ใช่มนุษย์จะเป็น 0

    try:
        cursor = db.cursor()
        cursor.execute("UPDATE user SET verify = %s WHERE UserID = %s", (verification_status, user_id))
        db.commit()
        cursor.close()
    except mysql.connector.Error as err:
        return jsonify({"error": f"Database error: {str(err)}"}), 500

    result = {
        "is_human": is_human,
        "confidence_score": round(confidence_score * 100, 2),
        "message": "Verification status updated successfully" if is_human else "Verification failed"
    }

    return jsonify(result), 200

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=6501, debug=True)
