from flask import Flask, send_file, request, jsonify
import mysql.connector as sql
from sklearn.metrics.pairwise import cosine_similarity
import pandas as pd
import os
import warnings
import numpy as np
import math
import os, mimetypes

IMAGE_FOLDER = os.path.abspath(
    os.path.join(os.path.dirname(__file__), '..', 'assets', 'user')
)
os.makedirs(IMAGE_FOLDER, exist_ok=True)

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

    # ดึง preferences ทั้งหมด
    x = pd.read_sql("SELECT * FROM userpreferences", conn)
    if 'UserID' not in x.columns or 'PreferenceID' not in x.columns:
        return jsonify({"error": "Data format error in userpreferences table"}), 500

    x = x.pivot_table(index='UserID', columns='PreferenceID', aggfunc='size', fill_value=0)
    if id not in x.index:
        return jsonify({"error": f"UserID {id} not found in preferences table"}), 404

    # ดึง location ล่าสุดของ user หลัก
    user_location = pd.read_sql(
    """
    SELECT latitude, longitude 
    FROM location 
    WHERE userID = %s 
    ORDER BY timestamp DESC 
    LIMIT 1
    """,
    conn, params=[id]
    )

    if user_location.empty:
        return jsonify({"error": "User location not found"}), 404

    user_lat, user_lon = float(user_location.iloc[0]['latitude']), float(user_location.iloc[0]['longitude'])

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
        lat1, lon1, lat2, lon2 = float(lat1), float(lon1), float(lat2), float(lon2)
        R = 6371
        phi1 = math.radians(lat1)
        phi2 = math.radians(lat2)
        delta_phi = math.radians(lat2 - lat1)
        delta_lambda = math.radians(lon2 - lon1)
        a = math.sin(delta_phi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda / 2) ** 2
        return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))

    nearby_users = []
    distance_map = {}
    for _, row in other_locs.iterrows():
        dist = haversine(user_lat, user_lon, row['latitude'], row['longitude'])
        distance_map[int(row['userID'])] = haversine(user_lat, user_lon, row['latitude'], row['longitude'])
        if dist <= distance:
            nearby_users.append(row['userID'])

    # เตรียม userIDs สำหรับนิสัยเหมือน
    x_login_user = x.loc[[id]]
    x_other_users = x.drop([id])
    recommended_user_ids = []
    for other_user_id, other_user_data in x_other_users.iterrows():
        if (x_login_user.values[0] * other_user_data.values).sum() >= 1:
            recommended_user_ids.append(other_user_id)

    # โหลด mapping preference id -> name
    df_preferences = pd.read_sql("SELECT PreferenceID, PreferenceNames FROM preferences", conn)
    pref_dict = dict(zip(df_preferences.PreferenceID, df_preferences.PreferenceNames))

    def fetch_query_df(sql, params, source_name):
        cursor.execute(sql, params)
        df = pd.DataFrame(cursor.fetchall())
        if not df.empty:
            df['source'] = source_name
        return df
    
    def in_clause(vals):
        if not vals:
            return "IN (NULL)", []
        placeholders = ", ".join(["%s"] * len(vals))
        return f"IN ({placeholders})", list(vals)

    # --- เตรียม IN-clause สำหรับลิสต์ทั้งสอง ---
    in_rec, p_rec = in_clause(recommended_user_ids)  # สำหรับ "นิสัยเหมือน"
    in_near, p_near = in_clause(nearby_users)        # สำหรับ "อยู่ใกล้"

    # ------------------ sql_query1: คนที่อยู่ใกล้ + นิสัยเหมือน ------------------
    sql_query1 = f'''
        WITH ranked_location AS (
            SELECT userID, latitude, longitude,
                ROW_NUMBER() OVER (PARTITION BY userID ORDER BY timestamp DESC) AS rn
            FROM location
        )
        SELECT 
            u.UserID, u.nickname, u.imageFile, u.verify, u.dateBirth,
            6371 * acos(
                cos(radians(%s)) * cos(radians(l.latitude)) * cos(radians(l.longitude) - radians(%s)) + 
                sin(radians(%s)) * sin(radians(l.latitude))
            ) AS distance
        FROM user u
        JOIN ranked_location l ON u.UserID = l.userID AND l.rn = 1
        LEFT JOIN matches m ON (m.user1ID = u.UserID AND m.user2ID = %s) OR (m.user2ID = u.UserID AND m.user1ID = %s)
        LEFT JOIN blocked_chats b ON (b.user1ID = %s AND b.user2ID = u.UserID) OR (b.user2ID = %s AND b.user1ID = u.UserID)
        LEFT JOIN userlike l2 ON (l2.likerID = %s AND l2.likedID = u.UserID)
        WHERE u.UserID {in_rec} AND u.UserID {in_near} AND u.UserID != %s
        AND m.matchID IS NULL
        AND (b.isBlocked IS NULL OR b.isBlocked = 0)
        AND l2.likedID IS NULL
        AND u.GenderID = (SELECT interestGenderID FROM user WHERE UserID = %s)
        AND u.goalID   = (SELECT goalID          FROM user WHERE UserID = %s)
        ORDER BY distance ASC;
    '''
    params1 = [
        user_lat, user_lon, user_lat,   # ระยะทาง
        id, id,                           # matches
        id, id,                           # blocked_chats
        id,                               # userlike
        *p_rec, *p_near,                  # ค่าจริงสำหรับ IN (...) ทั้งสองตัว
        id,                               # u.UserID != %s
        id, id                            # gender/goal ของผู้ใช้หลัก
    ]
    recommended_users_1 = fetch_query_df(sql_query1, params1, 'sql_query1')

    # ------------------ sql_query2: คนที่อยู่ใกล้ (ไม่เช็คนิสัย) ------------------
    sql_query2 = f'''
        SELECT u.UserID, u.nickname, u.imageFile, u.verify, u.dateBirth
        FROM user u
        LEFT JOIN matches m ON (m.user1ID = u.UserID AND m.user2ID = %s)
                            OR (m.user2ID = u.UserID AND m.user1ID = %s)
        LEFT JOIN blocked_chats b ON (b.user1ID = %s AND b.user2ID = u.UserID)
                                OR (b.user2ID = %s AND b.user1ID = u.UserID)
        LEFT JOIN userlike l ON (l.likerID = %s AND l.likedID = u.UserID)
        WHERE u.UserID {in_near}
        AND u.UserID != %s
        AND m.matchID IS NULL
        AND (b.isBlocked IS NULL OR b.isBlocked = 0)
        AND l.likedID IS NULL
        AND u.GenderID = (SELECT interestGenderID FROM user WHERE UserID = %s)
    '''

    print('nearby_users len =', len(nearby_users))
    print('nearby sample =', nearby_users[:10])
    print('p_near count =', len(p_near))

    params2 = [id, id, id, id, id, *p_near, id, id]
    recommended_users_2 = fetch_query_df(sql_query2, params2, 'sql_query2')

    # ------------------ sql_query3: นิสัยเหมือนอย่างเดียว ------------------
    sql_query3 = f'''
        SELECT u.UserID, u.nickname, u.imageFile, u.verify, u.dateBirth
        FROM user u
        LEFT JOIN matches m ON (m.user1ID = u.UserID AND m.user2ID = %s)
                            OR (m.user2ID = u.UserID AND m.user1ID = %s)
        LEFT JOIN blocked_chats b ON (b.user1ID = %s AND b.user2ID = u.UserID)
                                OR (b.user2ID = %s AND b.user1ID = u.UserID)
        LEFT JOIN userlike l ON (l.likerID = %s AND l.likedID = u.UserID)
        WHERE u.UserID {in_rec}
        AND u.UserID != %s
        AND m.matchID IS NULL
        AND (b.isBlocked IS NULL OR b.isBlocked = 0)
        AND l.likedID IS NULL
        AND u.GenderID = (SELECT interestGenderID FROM user WHERE UserID = %s)
    '''
    params3 = [id, id, id, id, id, *p_rec, id, id]
    recommended_users_3 = fetch_query_df(sql_query3, params3, 'sql_query3')

    # รวมผลลัพธ์
    recommended_users = pd.concat([
        recommended_users_1, recommended_users_2, recommended_users_3
    ]).drop_duplicates(subset='UserID')

    if recommended_users.empty:
        return jsonify([]), 200

    # หา shared preferences (นิสัยเหมือน)
    login_user_pref = set(x.columns[x.loc[id] == 1])
    shared_pref_list = []
    for uid in recommended_users['UserID']:
        if uid in x.index:
            other_pref = set(x.columns[x.loc[uid] == 1])
            shared = login_user_pref & other_pref
            shared_pref_list.append([pref_dict.get(p, f"Preference {p}") for p in shared])
        else:
            shared_pref_list.append([])

    def user_pref_names(uid: int):
        if uid in x.index:  # x คือ pivot (UserID x PreferenceID) ที่คุณสร้างไว้
            pref_ids = list(x.columns[x.loc[uid] > 0])   # ใช้ > 0 กันเคสซ้ำ
            return [pref_dict.get(p, f"Preference {p}") for p in pref_ids]
        return []
    
    recommended_users['UserID'] = recommended_users['UserID'].astype(int)
    recommended_users['allPreferences'] = [
    user_pref_names(uid) for uid in recommended_users['UserID']
    ]
    recommended_users['sharedPreferences'] = shared_pref_list
    recommended_users['distance'] = recommended_users['UserID'].map(distance_map)

    # เติม URL รูปภาพ
    for idx, user in recommended_users.iterrows():
        if user['imageFile']:
            recommended_users.at[idx, 'imageFile'] = f"http://{request.host}/ai_v2/user/{user['imageFile']}"

    conn.close()

    return jsonify(recommended_users[[
        'UserID', 'nickname', 'imageFile', 'verify', 'dateBirth', 'distance',
        'sharedPreferences', 'allPreferences', 'source'
    ]].to_dict(orient='records')), 200



@app.route('/ai_v2/user/<path:filename>', methods=['GET'])  # << เปลี่ยนเป็น <path:filename>
def get_user_image(filename):
    safe = os.path.basename(filename)  # กัน path traversal
    image_path = os.path.join(IMAGE_FOLDER, safe)

    if not os.path.isfile(image_path):
        return jsonify({"error": "File not found"}), 404

    mime = mimetypes.guess_type(image_path)[0] or "application/octet-stream"
    resp = send_file(image_path, mimetype=mime)
    resp.headers["Cache-Control"] = "public, max-age=86400, immutable"
    return resp
# Create Web server
if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=6502)
