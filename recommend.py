from flask import Flask, send_file, request, jsonify
import mysql.connector as sql
from sklearn.metrics.pairwise import cosine_similarity
import pandas as pd
import os
import warnings
import numpy as np
import math

IMAGE_FOLDER = os.path.join(os.getcwd(), 'assets', 'user')

warnings.filterwarnings("ignore")

app = Flask(__name__)

# Connection settings (no persistent connection)
def create_connection():
    return sql.connect(
        host=os.getenv('DATABASE_HOST'),
        database=os.getenv("DATABASE_NAME"),
        user=os.getenv("DATABASE_USER"),
        password=os.getenv("DATABASE_PASSWORD")
    )

# ฟังก์ชัน Haversine สำหรับคำนวณระยะห่างระหว่างพิกัด latitude และ longitude
def haversine(lat1, lon1, lat2, lon2):
    R = 6371  # รัศมีของโลก (กิโลเมตร)
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)

    a = math.sin(delta_phi / 2)**2 + math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda / 2)**2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))

    return R * c  # ระยะห่างในกิโลเมตร

 # @app.route('/ai_v2/recommend/<int:id>', methods=['GET'])
# def recommend(id):
#     conn = create_connection()
    
#     sql_query = "SELECT * FROM userpreferences"
#     x = pd.read_sql(sql_query, conn)
    
#     if 'UserID' not in x.columns or 'PreferenceID' not in x.columns:
#         return jsonify({"error": "Data format error in userpreferences table"}), 500

#     # Pivot table
#     x = x.pivot_table(index='UserID', columns='PreferenceID', aggfunc='size', fill_value=0)

#     # Check user exists
#     if id not in x.index:
#         return jsonify({"error": f"UserID {id} not found in preferences table"}), 404

#     login_vec = x.loc[[id]]
#     other_vecs = x.drop([id])

#     # คำนวณ cosine similarity กับผู้ใช้คนอื่น ๆ
#     similarities = cosine_similarity(login_vec, other_vecs)[0]

#     # จำนวน K คนที่อยากแนะนำ (เช่น 10 คน)
#     top_k = 10
#     if len(similarities) < top_k:
#         top_k = len(similarities)

#     # หา userID ของ top-k similarity สูงสุด
#     top_k_idx = np.argsort(similarities)[-top_k:][::-1]
#     recommended_user_ids = other_vecs.index[top_k_idx].tolist()

#     if not recommended_user_ids:
#         return jsonify({"message": "No similar users found"}), 200

#     recommended_user_ids_str = ', '.join(map(str, recommended_user_ids))
    
#     sql_query = f'''
#     SELECT 
#       u.UserID, 
#       u.nickname, 
#       u.imageFile,
#       u.verify,
#       u.dateBirth
#     FROM user u
#     LEFT JOIN matches m ON (m.user1ID = u.UserID AND m.user2ID = {id}) OR (m.user2ID = u.UserID AND m.user1ID = {id})
#     LEFT JOIN blocked_chats b ON (b.user1ID = {id} AND b.user2ID = u.UserID) OR (b.user2ID = {id} AND b.user1ID = u.UserID)
#     LEFT JOIN userlike l ON (l.likerID = {id} AND l.likedID = u.UserID)
#     WHERE u.UserID IN ({recommended_user_ids_str})
#       AND m.matchID IS NULL
#       AND (b.isBlocked IS NULL OR b.isBlocked = 0)
#       AND l.likedID IS NULL
#       AND u.GenderID = (SELECT interestGenderID FROM user WHERE UserID = {id})  
#       AND u.goalID = (SELECT goalID FROM user WHERE UserID = {id})  
#     ;
#     '''

#     recommended_users = pd.read_sql(sql_query, conn)
#     conn.close()

#     for index, user in recommended_users.iterrows():
#         if user['imageFile']:
#             recommended_users.at[index, 'imageFile'] = f"http://{request.host}/ai_v2/user/{user['imageFile']}"

#     return jsonify(recommended_users[['UserID', 'nickname', 'imageFile', 'verify', 'dateBirth']].to_dict(orient='records')), 200


# @app.route('/ai_v2/recommend/<int:id>', methods=['GET'])
# def recommend(id):

#     conn = create_connection()
#     distance = request.args.get('distance', default=10, type=int)
    
#     # ดึงข้อมูลใหม่จากตาราง userpreferences ทุกครั้งที่มีการเรียกใช้งาน
#     sql_query = "SELECT * FROM userpreferences"
#     x = pd.read_sql(sql_query, conn)
#     user_location = pd.read_sql(sql_query, conn)


#     # ตรวจสอบให้แน่ใจว่า DataFrame มีคอลัมน์ที่จำเป็น
#     if 'UserID' not in x.columns or 'PreferenceID' not in x.columns:
#         return jsonify({"error": "Data format error in userpreferences table"}), 500
    
#     # ตรวจสอบให้แน่ใจว่า DataFrame มีคอลัมน์ที่จำเป็นสำหรับ user_location
#     if user_location.empty:
#         return jsonify({"error": "User location not found"}), 404

#     user_lat, user_lon = user_location.iloc[0]['latitude'], user_location.iloc[0]['longitude']

#     # ปรับข้อมูลของ userpreferences ให้เป็น pivot table
#     x = x.pivot_table(index='UserID', columns='PreferenceID', aggfunc='size', fill_value=0)

#     # ตรวจสอบว่า UserID ที่ร้องขอมีอยู่ใน DataFrame หรือไม่
#     if id not in x.index:
#         return jsonify({"error": f"UserID {id} not found in preferences table"}), 404

#     # แยกข้อมูลสำหรับผู้ใช้ที่ล็อกอินและผู้ใช้อื่น ๆ
#     x_login_user = x.loc[[id]]
#     x_other_users = x.drop([id])

#     sql_query = "SELECT UserID, latitude, longitude, nickname, imageFile FROM user"
#     other_users = pd.read_sql(sql_query, conn)


#     # หาผู้ใช้ที่อยู่ในระยะที่ได้รับจาก frontend
#     nearby_users = []
#     for _, other_user in other_users.iterrows():
#         dist = haversine(user_lat, user_lon, other_user['latitude'], other_user['longitude'])
#         if dist <= distance:  # เปรียบเทียบระยะห่างกับระยะทางที่ได้รับ
#             nearby_users.append(other_user['UserID'])

#     # ถ้าไม่มีผู้ใช้ที่ใกล้เคียงเลย
#     if not nearby_users:
#         return jsonify({"message": f"No nearby users found within {distance}KM"}), 200

#     nearby_users_str = ', '.join(map(str, nearby_users))

#     # ตรวจสอบความเข้ากันของ preferences อย่างน้อย 1 รายการ
#     recommended_user_ids = []
#     for other_user_id, other_user_data in x_other_users.iterrows():
#         common_preferences = (x_login_user.values[0] == other_user_data.values).sum()
#         if common_preferences >= 1:
#             recommended_user_ids.append(other_user_id)

#     if len(recommended_user_ids) == 0:
#         return jsonify({"message": "No similar users found"}), 200

#     recommended_user_ids_str = ', '.join(map(str, recommended_user_ids))
    
#     sql_query = f'''
#     SELECT 
#     u.UserID, 
#     u.nickname, 
#     u.imageFile,
#     u.verify,
#     u.dateBirth
#     FROM user u
#     LEFT JOIN matches m ON (m.user1ID = u.UserID AND m.user2ID = {id}) OR (m.user2ID = u.UserID AND m.user1ID = {id})
#     LEFT JOIN blocked_chats b ON (b.user1ID = {id} AND b.user2ID = u.UserID) OR (b.user2ID = {id} AND b.user1ID = u.UserID)
#     LEFT JOIN userlike l ON (l.likerID = {id} AND l.likedID = u.UserID)
#     WHERE u.UserID IN ({recommended_user_ids_str})
#     AND m.matchID IS NULL
#     AND (b.isBlocked IS NULL OR b.isBlocked = 0)
#     AND l.likedID IS NULL
#     AND u.GenderID = (SELECT interestGenderID FROM user WHERE UserID = {id})  
#     AND u.goalID = (SELECT goalID FROM user WHERE UserID = {id})  
#     AND (
#         (SELECT COUNT(*) FROM userpreferences p WHERE p.UserID = u.UserID AND p.PreferenceID IN 
#         (SELECT PreferenceID FROM userpreferences WHERE UserID = {id})) >= 1
#     );
# '''


#     recommended_users = pd.read_sql(sql_query, conn)
#     conn.close()  # ปิดการเชื่อมต่อหลังจากดึงข้อมูลเสร็จ

#     # ปรับเส้นทางของ imageFile เพื่อให้ชี้ไปที่ API สำหรับโหลดรูปภาพ
#     for index, user in recommended_users.iterrows():
#         if user['imageFile']:
#             recommended_users.at[index, 'imageFile'] = f"http://{request.host}/ai_v2/user/{user['imageFile']}"

#     return jsonify(recommended_users[['UserID', 'nickname', 'imageFile', 'verify', 'dateBirth']].to_dict(orient='records')), 200

@app.route('/ai_v2/recommend/<int:id>', methods=['GET'])
def recommend(id):

    conn = create_connection()
    distance = request.args.get('distance', default=10, type=int)

    # ดึงข้อมูลจาก userpreferences
    sql_query = "SELECT * FROM userpreferences"
    x = pd.read_sql(sql_query, conn)

    # ดึงข้อมูลพิกัดของผู้ใช้ที่ล็อกอิน (ล่าสุด)
    user_location_query = f"""
        SELECT latitude, longitude 
        FROM location 
        WHERE userID = {id} 
        ORDER BY timestamp DESC 
        LIMIT 1
    """
    user_location = pd.read_sql(user_location_query, conn)

    if user_location.empty:
        return jsonify({"error": "User location not found"}), 404

    user_lat, user_lon = user_location.iloc[0]['latitude'], user_location.iloc[0]['longitude']

    # ตรวจสอบว่า DataFrame มีคอลัมน์ที่จำเป็น
    if 'UserID' not in x.columns or 'PreferenceID' not in x.columns:
        return jsonify({"error": "Data format error in userpreferences table"}), 500

    # ปรับข้อมูลของ userpreferences ให้เป็น pivot table
    x = x.pivot_table(index='UserID', columns='PreferenceID', aggfunc='size', fill_value=0)

    # ตรวจสอบว่า UserID ที่ร้องขอมีอยู่ใน DataFrame หรือไม่
    if id not in x.index:
        return jsonify({"error": f"UserID {id} not found in preferences table"}), 404

    # แยกข้อมูลสำหรับผู้ใช้ที่ล็อกอินและผู้ใช้อื่น ๆ
    x_login_user = x.loc[[id]]
    x_other_users = x.drop([id])

    # ดึงข้อมูลของผู้ใช้อื่น ๆ พร้อม location ล่าสุด
    sql_query = """
        SELECT u.UserID, l.latitude, l.longitude, u.nickname, u.imageFile
        FROM user u
        JOIN (
            SELECT userID, latitude, longitude
            FROM location
            WHERE (userID, timestamp) IN (
                SELECT userID, MAX(timestamp)
                FROM location
                GROUP BY userID
            )
        ) l ON u.UserID = l.userID
    """
    other_users = pd.read_sql(sql_query, conn)

    # หาผู้ใช้ที่อยู่ในระยะที่ได้รับจาก frontend (กรองผู้ใช้ที่อยู่ในระยะ)
    nearby_users = []
    for _, other_user in other_users.iterrows():
        dist = haversine(user_lat, user_lon, other_user['latitude'], other_user['longitude'])
        if dist <= distance:
            nearby_users.append(other_user['UserID'])

    if not nearby_users:
        return jsonify({"message": f"No nearby users found within {distance}KM"}), 200

    nearby_users_str = ', '.join(map(str, nearby_users))

    # ตรวจสอบความเข้ากันของ preferences อย่างน้อย 1 รายการ
    recommended_user_ids = []
    for other_user_id, other_user_data in x_other_users.iterrows():
        common_preferences = (x_login_user.values[0] == other_user_data.values).sum()
        if common_preferences >= 1:
            recommended_user_ids.append(other_user_id)

    if len(recommended_user_ids) == 0:
        return jsonify({"message": "No similar users found"}), 200

    recommended_user_ids_str = ', '.join(map(str, recommended_user_ids))

    # ช่วงที่ 1: ผู้ใช้ที่อยู่ในระยะและมีนิสัยตรงกับเรา แกัไขใหม่
    sql_query1 = f'''
    SELECT 
    u.UserID, 
    u.nickname, 
    u.imageFile,
    u.verify,
    u.dateBirth,
    6371 * acos(cos(radians({user_lat})) * cos(radians(l.latitude)) * cos(radians(l.longitude) - radians({user_lon})) + sin(radians({user_lat})) * sin(radians(l.latitude))) AS distance
    FROM user u
    JOIN (
        SELECT userID, latitude, longitude
        FROM location
        WHERE (userID, timestamp) IN (
            SELECT userID, MAX(timestamp)
            FROM location
            GROUP BY userID
        )
    ) l ON u.UserID = l.userID
    LEFT JOIN matches m ON (m.user1ID = u.UserID AND m.user2ID = {id}) OR (m.user2ID = u.UserID AND m.user1ID = {id})
    LEFT JOIN blocked_chats b ON (b.user1ID = {id} AND b.user2ID = u.UserID) OR (b.user2ID = {id} AND b.user1ID = u.UserID)
    LEFT JOIN userlike l2 ON (l2.likerID = {id} AND l2.likedID = u.UserID)
    WHERE u.UserID IN ({recommended_user_ids_str}) 
    AND u.UserID IN ({nearby_users_str}) 
    AND u.UserID != {id} // ไม่รวมผู้ใช้ที่ล็อกอิน
    AND m.matchID IS NULL
    AND (b.isBlocked IS NULL OR b.isBlocked = 0)
    AND l2.likedID IS NULL
    AND u.GenderID = (SELECT interestGenderID FROM user WHERE UserID = {id})  
    AND u.goalID = (SELECT goalID FROM user WHERE UserID = {id})  
    AND (
        (SELECT COUNT(*) FROM userpreferences p WHERE p.UserID = u.UserID AND p.PreferenceID IN 
        (SELECT PreferenceID FROM userpreferences WHERE UserID = {id})) >= 1
    )
    ORDER BY distance ASC;
    '''

    # ช่วงที่ 2: ผู้ใช้ที่อยู่ใกล้เคียงเรา
    sql_query2 = f'''
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
    WHERE u.UserID IN ({nearby_users_str}) 
    AND u.UserID != {id}
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

    # ช่วงที่ 3: ผู้ใช้ที่มีนิสัยตรงกับเรา
    sql_query3 = f'''
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
    AND u.UserID != {id}
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

    # ดึงข้อมูลจากทั้งสอง query
    recommended_users_1 = pd.read_sql(sql_query1, conn)
    recommended_users_1['source'] = 'sql_query1'

    recommended_users_2 = pd.read_sql(sql_query2, conn)
    recommended_users_2['source'] = 'sql_query2'

    recommended_users_3 = pd.read_sql(sql_query3, conn)
    recommended_users_3['source'] = 'sql_query3'

    conn.close()

    # รวมทั้งสองผลลัพธ์และกรองข้อมูลซ้ำ
    recommended_users = pd.concat([recommended_users_1, recommended_users_2, recommended_users_3]).drop_duplicates(subset='UserID')

    # ปรับเส้นทางของ imageFile เพื่อให้ชี้ไปที่ API สำหรับโหลดรูปภาพ
    for index, user in recommended_users.iterrows():
        if user['imageFile']:
            recommended_users.at[index, 'imageFile'] = f"http://{request.host}/ai_v2/user/{user['imageFile']}"

    return jsonify(recommended_users[['UserID', 'nickname', 'imageFile', 'verify', 'dateBirth', 'source']].to_dict(orient='records')), 200


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
