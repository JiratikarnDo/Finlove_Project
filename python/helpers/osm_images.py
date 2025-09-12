import requests
from typing import Optional, Tuple, Dict

WIKI_HEADERS = {
    "User-Agent": "FinloveApp/0.1 (localdev; test@example.com)"
}
def get_osm_image_tag(tags: dict) -> Optional[str]:
    url = (tags or {}).get("image")
    if url and url.startswith(("http://", "https://")):
        return url
    return None


def get_commons_thumb_from_filename(filename: str, width: int = 640) -> Optional[str]:
    api = "https://commons.wikimedia.org/w/api.php"
    params = {
    "action": "query",
    "prop": "imageinfo",
    "iiprop": "url|extmetadata",
    "iiurlwidth": str(width),
    "titles": filename,
    "format": "json"
    }

    r = requests.get(api, params=params, headers=WIKI_HEADERS, timeout=20)
    r.raise_for_status()
    data = r.json()
    pages = data.get("query", {}).get("pages", {})
    for _, page in pages.items():
        infos = page.get("imageinfo")
        if infos:
            return infos[0].get("thumburl") or infos[0].get("url")
    return None


def get_commons_thumb_from_wikidata_qid(qid: str, width: int = 640) -> Tuple[Optional[str], Dict]:
    meta: Dict = {}
    wd_api = "https://www.wikidata.org/w/api.php"
    wd_params = {
        "action": "wbgetclaims",
        "entity": qid,
        "property": "P18",
        "format": "json"
    }
    r = requests.get(wd_api, params=wd_params, headers=WIKI_HEADERS, timeout=20)
    r.raise_for_status()
    claims = r.json().get("claims", {})
    if not claims or "P18" not in claims:
        return None, meta

    mainsnak = claims["P18"][0].get("mainsnak", {})
    datavalue = mainsnak.get("datavalue", {})
    filename = datavalue.get("value")  # e.g. 'Lumpini Park Bangkok.jpg'
    if not filename:
        return None, meta

    title = f"File:{filename}"
    thumb = get_commons_thumb_from_filename(title, width=width)
    return thumb, meta

def get_wikipedia_intro_from_wikidata(qid: str, lang: str = "th") -> Optional[str]:
    """
    รับ Wikidata QID → คืนบทนำย่อจาก Wikipedia (ภาษาไทย)
    """
    # 1) เรียก Wikidata เพื่อหาว่าลิงก์ wiki ภาษาไทยคืออะไร
    url = "https://www.wikidata.org/w/api.php"
    params = {
        "action": "wbgetentities",
        "ids": qid,
        "props": "sitelinks",
        "format": "json"
    }
    r = requests.get(url, params=params, headers=WIKI_HEADERS, timeout=20)
    r.raise_for_status()
    data = r.json()

    sitelinks = data.get("entities", {}).get(qid, {}).get("sitelinks", {})
    wiki_key = f"{lang}wiki"
    if wiki_key not in sitelinks:
        return None
    
    title = sitelinks[wiki_key]["title"]

    # 2) เรียก Wikipedia API เพื่อนำ extract (บทนำ)
    wiki_api = f"https://{lang}.wikipedia.org/w/api.php"
    params2 = {
        "action": "query",
        "prop": "extracts",
        "exintro": True,
        "explaintext": True,
        "titles": title,
        "format": "json"
    }
    r2 = requests.get(wiki_api, params=params2, headers=WIKI_HEADERS, timeout=20)
    r2.raise_for_status()
    data2 = r2.json()

    pages = data2.get("query", {}).get("pages", {})
    for _, page in pages.items():
        extract = page.get("extract")
        if extract:
            return extract.strip()
    return None



def best_photo_url_from_tags(tags: dict, width: int = 640) -> Tuple[Optional[str], Dict]:
    """
    ลองหารูป image= → wikimedia_commons= → wikidata= → None
    """
    meta: Dict = {}

    # 1) OSM image tag
    url = get_osm_image_tag(tags)
    if url:
        return url, meta

    # 2) Wikimedia Commons file
    commons = (tags or {}).get("wikimedia_commons")
    if commons and commons.lower().startswith("file:"):
        url = get_commons_thumb_from_filename(commons, width=width)
        if url:
            return url, meta

    # 3) Wikidata QID
    qid = (tags or {}).get("wikidata")
    if qid and qid.upper().startswith("Q"):
        url, meta = get_commons_thumb_from_wikidata_qid(qid, width=width)
        if url:
            return url, meta

    return None, meta
