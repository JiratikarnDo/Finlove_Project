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

@app.route('/ai_v2/recommend/<int:id>', methods=['GET'])
def recommend(id):
    conn = create_connection()
    cursor = conn.cursor(dictionary=True)
    distance = request.args.get('distance', default=10, type=int)

    # ดึง preferences pivot
    x = pd.read_sql("SELECT * FROM userpreferences", conn)
    if 'UserID' not in x.columns or 'PreferenceID' not in x.columns:
        return jsonify({"error": "Data format error in userpreferences table"}), 500

    x = x.pivot_table(index='UserID', columns='PreferenceID', aggfunc='size', fill_value=0)
    if id not in x.index:
        return jsonify({"error": f"UserID {id} not found in preferences table"}), 404

    # ดึง location ของ user หลัก
    user_location = pd.read_sql(f'''
        SELECT latitude, longitude 
        FROM location 
        WHERE userID = {id} 
        ORDER BY timestamp DESC 
        LIMIT 1
    ''', conn)
    if user_location.empty:
        return jsonify({"error": "User location not found"}), 404

    user_lat, user_lon = user_location.iloc[0]['latitude'], user_location.iloc[0]['longitude']

    # หาผู้ใช้ที่อยู่ใกล้
    sql_other_locations = '''
        SELECT l.userID, l.latitude, l.longitude
        FROM (
            SELECT userID, latitude, longitude,
                   ROW_NUMBER() OVER (PARTITION BY userID ORDER BY timestamp DESC) AS rn
            FROM location
        ) l
        WHERE l.rn = 1 AND userID != %s
    '''
    cursor.execute(sql_other_locations, (id,))
    other_locs = pd.DataFrame(cursor.fetchall())

    def haversine(lat1, lon1, lat2, lon2):
        import math
        R = 6371

        lat1, lon1, lat2, lon2 = float(lat1), float(lon1), float(lat2), float(lon2)

        phi1, phi2 = math.radians(lat1), math.radians(lat2)
        delta_phi = math.radians(lat2 - lat1)
        delta_lambda = math.radians(lon2 - lon1)
        a = math.sin(delta_phi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda / 2) ** 2
        return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))

    nearby_users = []
    for _, row in other_locs.iterrows():
        dist = haversine(user_lat, user_lon, row['latitude'], row['longitude'])
        if dist <= distance:
            nearby_users.append(row['userID'])

    if not nearby_users:
        return jsonify({"message": f"No nearby users found within {distance}KM"}), 200

    # ผู้ใช้ที่ preferences เหมือนกัน
    x_login_user = x.loc[[id]]
    x_other_users = x.drop([id])
    recommended_user_ids = []
    for other_user_id, other_user_data in x_other_users.iterrows():
        if (x_login_user.values[0] == other_user_data.values).sum() >= 1:
            recommended_user_ids.append(other_user_id)

    if not recommended_user_ids:
        return jsonify({"message": "No similar users found"}), 200

    recommended_user_ids_str = ', '.join(map(str, recommended_user_ids))

    # ช่วงที่ 1: ผู้ใช้ที่อยู่ในระยะและมีนิสัยตรงกับเรา
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
    params1 = (
        user_lat, user_lon, user_lat,
        id, id, id, id, id,
        tuple(recommended_user_ids), tuple(nearby_users), id,
        id, id, id
    )
    recommended_users_1 = fetch_query_df(sql_query1, params1, 'sql_query1')

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
    params3 = (id, id, id, id, id, tuple(recommended_user_ids), id, id, id, id)
    recommended_users_3 = fetch_query_df(sql_query3, params3, 'sql_query3')

    # รวมผลลัพธ์
    recommended_users = pd.concat([
        recommended_users_1, recommended_users_2, recommended_users_3
    ]).drop_duplicates(subset='UserID')

    if recommended_users.empty:
        return jsonify([]), 200

    # หา shared preferences
    login_user_pref = set(x.columns[x.loc[id] == 1])
    shared_pref_list = []
    for uid in recommended_users['UserID']:
        if uid in x.index:
            other_pref = set(x.columns[x.loc[uid] == 1])
            shared = login_user_pref & other_pref
            shared_pref_list.append([pref_dict.get(p, f"Preference {p}") for p in shared])
        else:
            shared_pref_list.append([])

    recommended_users['sharedPreferences'] = shared_pref_list
    recommended_users['sharedPreferencesCount'] = recommended_users['sharedPreferences'].apply(len)

    # แปลง image path → URL
    for idx, user in recommended_users.iterrows():
        if user['imageFile']:
            recommended_users.at[idx, 'imageFile'] = f"http://{request.host}/ai_v2/user/{user['imageFile']}"

    conn.close()

    return jsonify(recommended_users[[
        'UserID', 'nickname', 'imageFile', 'verify', 'dateBirth',
        'distance', 'sharedPreferences', 'sharedPreferencesCount', 'source'
    ]].to_dict(orient='records')), 200


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
