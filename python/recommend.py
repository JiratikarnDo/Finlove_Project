from flask import Flask, send_file, request, jsonify
import mysql.connector as sql
from helpers.osm_images import best_photo_url_from_tags
from helpers.osm_images import get_wikipedia_intro_from_wikidata
from helpers.osm_images import get_fallback_image
from helpers.osm_images import get_osm_image_tag
import pandas as pd
import os
import warnings
import math
import os, mimetypes
import requests


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



@app.route('/ai_v2/user/<path:filename>', methods=['GET'])
def get_user_image(filename):
    safe = os.path.basename(filename)
    image_path = os.path.join(IMAGE_FOLDER, safe)

    app.logger.info(f"[img] request='{filename}' safe='{safe}' path='{image_path}' exists={os.path.isfile(image_path)}")

    if not os.path.isfile(image_path):
        try:
            sample = sorted(os.listdir(IMAGE_FOLDER))[:5]
        except Exception as e:
            sample = [f"<list failed: {e}>"]
        app.logger.warning(f"[img] NOT FOUND. IMAGE_FOLDER='{IMAGE_FOLDER}', samples={sample}")
        return jsonify({"error": "File not found"}), 404

    mime = mimetypes.guess_type(image_path)[0] or "application/octet-stream"
    stat = os.stat(image_path)

    try:
        resp = send_file(
            image_path,
            mimetype=mime,
            conditional=False,
            etag=False,
        )
        resp.headers["Content-Length"] = str(stat.st_size)
        resp.headers["Accept-Ranges"] = "none"
        resp.headers["Cache-Control"] = "public, max-age=31536000, immutable"
        return resp
    except Exception as e:
        app.logger.exception(f"[img] send_file error: {e}")
        return jsonify({"error": "Internal error serving image"}), 500
    

@app.route('/ai_v2/recommend_places/<int:match_id>', methods=['GET'])
def recommend_places(match_id):
    conn = create_connection()
    cursor = conn.cursor(dictionary=True)

    # 1) หาคู่จาก match_id
    cursor.execute("SELECT user1ID, user2ID FROM matches WHERE matchID=%s AND isBlocked=0", (match_id,))
    match = cursor.fetchone()
    if not match:
        return jsonify({"error": "Match not found"}), 404
    u1, u2 = match['user1ID'], match['user2ID']

    # 2) หาตำแหน่งล่าสุดของแต่ละ user
    def get_latest_location(uid):
        q = """SELECT latitude, longitude 
               FROM location WHERE userID=%s
               ORDER BY timestamp DESC LIMIT 1"""
        cursor.execute(q, (uid,))
        row = cursor.fetchone()
        return (float(row['latitude']), float(row['longitude'])) if row else None

    loc1 = get_latest_location(u1)
    loc2 = get_latest_location(u2)
    if not loc1 or not loc2:
        return jsonify({"error": "Missing location for one or both users"}), 404

    # 3) คำนวณ midpoint
    def midpoint(lat1, lon1, lat2, lon2):
        import math
        phi1, lam1 = math.radians(lat1), math.radians(lon1)
        phi2, lam2 = math.radians(lat2), math.radians(lon2)
        bx = math.cos(phi2) * math.cos(lam2 - lam1)
        by = math.cos(phi2) * math.sin(lam2 - lam1)
        phi3 = math.atan2(math.sin(phi1) + math.sin(phi2),
                          math.sqrt((math.cos(phi1) + bx)**2 + by**2))
        lam3 = lam1 + math.atan2(by, math.cos(phi1) + bx)
        return math.degrees(phi3), math.degrees(lam3)

    mid_lat, mid_lon = midpoint(loc1[0], loc1[1], loc2[0], loc2[1])

    # 4) shared preferences
    prefs = pd.read_sql("SELECT * FROM userpreferences", conn)
    pivot = prefs.pivot_table(index='UserID', columns='PreferenceID', aggfunc='size', fill_value=0)
    shared = []
    if u1 in pivot.index and u2 in pivot.index:
        p1 = set(pivot.columns[pivot.loc[u1] > 0])
        p2 = set(pivot.columns[pivot.loc[u2] > 0])
        shared = list(p1 & p2)

    pref_map = dict(pd.read_sql("SELECT PreferenceID, PreferenceNames FROM preferences", conn).values)
    shared_names = [pref_map.get(p, f"Pref {p}") for p in shared]

    # 5) ดึงสถานที่จาก OSM
    query = f"""
    [out:json][timeout:25];
    (
      node["amenity"~"cafe|restaurant|bar|pub|cinema|karaoke"](around:5000,{mid_lat},{mid_lon});
      node["leisure"~"park|bowling_alley"](around:5000,{mid_lat},{mid_lon});
      node["tourism"~"attraction|museum|gallery"](around:5000,{mid_lat},{mid_lon});
    );
    out center 40;
    """
    r = requests.post("https://overpass-api.de/api/interpreter", data={"data": query})
    if r.status_code != 200:
        return jsonify({
            "error": "Overpass error",
            "status": r.status_code,
            "body": r.text[:300]  # ส่ง preview ให้ client ดู
    }), 502

    try:
        data = r.json()
    except Exception:
        return jsonify({
        "error": "Overpass response not JSON",
        "status": r.status_code,
        "body": r.text[:300]  # client จะเห็นว่าได้ HTML / ว่าง / อะไรมา
    }), 502

    spots = []
    for e in data.get("elements", []):
        tags = e.get("tags", {} or {})
        name = tags.get("name", "Unnamed")
        category = tags.get("amenity") or tags.get("leisure") or tags.get("tourism")
        lat = e.get("lat") or (e.get("center") or {}).get("lat")
        lon = e.get("lon") or (e.get("center") or {}).get("lon")

        photo_url, photo_meta = best_photo_url_from_tags(tags)

        if not photo_url:
            photo_url = get_fallback_image(category)
            photo_meta = {"source": "fallback"}

        # 1) ถ้ามี wikidata → ดึงจาก Wikipedia (ภาษาไทย)
        qid = tags.get("wikidata")
        if qid and qid.startswith("Q"):
            try:
                description = get_wikipedia_intro_from_wikidata(qid, lang="th")
            except Exception as e:
                print("Wiki fetch failed:", e)
                description = None

        # 2) ถ้าไม่มี → ใช้ description จาก OSM
        description = None
        if "description:th" in tags:
            description = tags["description:th"]
        elif "cuisine" in tags:
            description = f"ร้านอาหารประเภท {tags['cuisine']}"
        elif category == "cafe":
            description = "คาเฟ่สำหรับนั่งพักผ่อนและดื่มกาแฟ"
        elif category == "restaurant":
            description = "ร้านอาหารสำหรับรับประทานมื้ออร่อยกับเพื่อนหรือครอบครัว"
        elif category == "bar":
            description = "บาร์สำหรับสังสรรค์และดื่มเครื่องดื่ม"
        elif category == "pub":
            description = "ผับสำหรับนั่งชิลหรือสังสรรค์ยามค่ำคืน"
        elif category == "park":
            description = "สวนสาธารณะสำหรับพักผ่อนและทำกิจกรรมกลางแจ้ง"
        elif category == "museum":
            description = "พิพิธภัณฑ์สำหรับเรียนรู้และชมงานจัดแสดง"
        else:
            description = f"สถานที่ประเภท {category or 'ทั่วไป'}"

        spots.append({
            "id": f"osm:{e['type']}/{e['id']}",
            "name": name,
            "lat": lat,
            "lng": lon,
            "category": category,
            "photo_url": photo_url,
            "description": description,
            "photo_meta": photo_meta,
            "gmaps_url": f"https://www.google.com/maps/search/?api=1&query={lat},{lon}"
        })

    # 6) เลือก Top 10 ใกล้ midpoint ที่สุด
    def haversine(lat1, lon1, lat2, lon2):
        R = 6371
        dlat = math.radians(lat2 - lat1)
        dlon = math.radians(lon2 - lon1)
        a = math.sin(dlat/2)**2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon/2)**2
        return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))
    
    for s in spots:
        s["distance_from_user1_km"] = round(haversine(loc1[0], loc1[1], s["lat"], s["lng"]), 2)
        s["distance_from_user2_km"] = round(haversine(loc2[0], loc2[1], s["lat"], s["lng"]), 2)

    spots = sorted(spots, key=lambda s: haversine(mid_lat, mid_lon, s["lat"], s["lng"]))[:10]

    return jsonify({
        "users": [u1, u2],
        "midpoint": {"lat": mid_lat, "lng": mid_lon},
        "shared_preferences": shared_names,
        "spots": spots
    })

# Create Web server
if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=6502)
