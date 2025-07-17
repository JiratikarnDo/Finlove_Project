from flask import Flask, send_file, request, jsonify
import mysql.connector as sql
import pandas as pd
import os
import warnings

# Suppress warnings
warnings.filterwarnings("ignore")

# Create the Flask app (API)
app = Flask(__name__)

# Connection settings (no persistent connection)
def create_connection():
    return sql.connect(
        host="localhost",
        database="finlove",
        user="root",
        password="1234"
    )

# Path to the folder where images are stored
IMAGE_FOLDER = os.path.join(os.getcwd(), 'assets', 'user')

@app.route('/ai_v2/recommend/<int:id>', methods=['GET'])
def recommend(id):
    # สร้างการเชื่อมต่อใหม่ทุกครั้งที่เรียกใช้งาน
    conn = create_connection()
    
    # ดึงข้อมูลใหม่จากตาราง userpreferences ทุกครั้งที่มีการเรียกใช้งาน
    sql_query = "SELECT * FROM userpreferences"
    x = pd.read_sql(sql_query, conn)

    # ตรวจสอบให้แน่ใจว่า DataFrame มีคอลัมน์ที่จำเป็น
    if 'UserID' not in x.columns or 'PreferenceID' not in x.columns:
        return jsonify({"error": "Data format error in userpreferences table"}), 500

    # ปรับข้อมูลของ userpreferences ให้เป็น pivot table
    x = x.pivot_table(index='UserID', columns='PreferenceID', aggfunc='size', fill_value=0)

    # ตรวจสอบว่า UserID ที่ร้องขอมีอยู่ใน DataFrame หรือไม่
    if id not in x.index:
        return jsonify({"error": f"UserID {id} not found in preferences table"}), 404

    # แยกข้อมูลสำหรับผู้ใช้ที่ล็อกอินและผู้ใช้อื่น ๆ
    x_login_user = x.loc[[id]]  # ข้อมูลผู้ใช้ที่ล็อกอิน
    x_other_users = x.drop([id])  # ข้อมูลผู้ใช้อื่น ๆ

    # ตรวจสอบความเข้ากันของ preferences อย่างน้อย 1 รายการ
    recommended_user_ids = []
    for other_user_id, other_user_data in x_other_users.iterrows():
        common_preferences = (x_login_user.values[0] == other_user_data.values).sum()
        if common_preferences >= 1:
            recommended_user_ids.append(other_user_id)

    if len(recommended_user_ids) == 0:
        return jsonify({"message": "No similar users found"}), 200

    recommended_user_ids_str = ', '.join(map(str, recommended_user_ids))
    
    sql_query = f'''
    SELECT 
    u.UserID, 
    u.nickname, 
    u.imageFile,
    u.verify,
    u.dateBirth
    FROM user u
    LEFT JOIN matches m ON (m.user1ID = u.UserID AND m.user2ID = {id}) OR (m.user2ID = u.UserID AND m.user1ID = {id})
    LEFT JOIN blocked_chats b ON (b.user1ID = {id} AND b.user2ID = u.UserID) OR (b.user2ID = {id} AND b.user1ID = u.UserID)
    LEFT JOIN userlike l ON (l.likerID = {id} AND l.likedID = u.UserID)
    WHERE u.UserID IN ({recommended_user_ids_str})
    AND m.matchID IS NULL
    AND (b.isBlocked IS NULL OR b.isBlocked = 0)
    AND l.likedID IS NULL
    AND u.GenderID = (SELECT interestGenderID FROM user WHERE UserID = {id})  
    AND u.goalID = (SELECT goalID FROM user WHERE UserID = {id})  
    AND (
        (SELECT COUNT(*) FROM userpreferences p WHERE p.UserID = u.UserID AND p.PreferenceID IN 
        (SELECT PreferenceID FROM userpreferences WHERE UserID = {id})) >= 1
    );
'''


    recommended_users = pd.read_sql(sql_query, conn)
    conn.close()  # ปิดการเชื่อมต่อหลังจากดึงข้อมูลเสร็จ

    # ปรับเส้นทางของ imageFile เพื่อให้ชี้ไปที่ API สำหรับโหลดรูปภาพ
    for index, user in recommended_users.iterrows():
        if user['imageFile']:
            recommended_users.at[index, 'imageFile'] = f"http://{request.host}/ai_v2/user/{user['imageFile']}"

    return jsonify(recommended_users[['UserID', 'nickname', 'imageFile', 'verify', 'dateBirth']].to_dict(orient='records')), 200



@app.route('/ai_v2/user/<filename>', methods=['GET'])
def get_user_image(filename):
    # Full path to the image file
    image_path = os.path.join(IMAGE_FOLDER, filename)

    # Check if the file exists
    if os.path.exists(image_path):
        # Return the image file to the client
        return send_file(image_path, mimetype='image/jpeg')
    else:
        # If the file is not found, return 404
        return jsonify({"error": "File not found"}), 404

# Create Web server
if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=6502)
