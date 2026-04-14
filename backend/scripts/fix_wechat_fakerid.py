# -*- coding: utf-8 -*-
"""修复微信源 faker_id 的脚本

从 RSS URL 提取 fakeid：
- /feed/MP_WXS_XXXXXXX.rss  -> XXXXXXX (纯数字)
- /wechat/csm/{base64_biz}   -> 解码 base64 得到纯数字 fakeid
"""

import sqlite3
import re
import base64

db_path = 'd:/code/aggregation/infohub/backend/data/infohub.db'
conn = sqlite3.connect(db_path)
conn.text_factory = str
cursor = conn.cursor()

# Get all WeChat sources
cursor.execute('SELECT id, name, url FROM sources WHERE platform = "wechat"')
sources = cursor.fetchall()

print(f'Found {len(sources)} WeChat sources')

updated = 0
skipped = 0
errors = 0

for source in sources:
    source_id, name, url = source

    fakeid = None

    if url:
        # /feed/MP_WXS_3248194593.rss -> 提取纯数字
        match = re.search(r'/feed/MP_WXS_(\d+)', url)
        if match:
            fakeid = match.group(1)
        else:
            # /wechat/csm/MzA3MDMxNTYzMw== -> base64 解码为纯数字
            match = re.search(r'/wechat/csm/([^/]+)', url)
            if match:
                raw_biz = match.group(1)
                try:
                    decoded = base64.b64decode(raw_biz).decode('utf8')
                    # 解码后应该是纯数字
                    if re.match(r'^\d+$', decoded):
                        fakeid = decoded
                    else:
                        print(f'  [WARN] ID:{source_id} biz decode not digits: {decoded}')
                except Exception as e:
                    print(f'  [ERROR] ID:{source_id} biz decode failed: {e}')

    if not fakeid:
        print(f'  [SKIP] ID:{source_id} - no fakeid found in {url}')
        skipped += 1
        continue

    # 校验 fakeid 是纯数字
    if not re.match(r'^\d+$', fakeid):
        print(f'  [SKIP] ID:{source_id} - invalid fakeid: {fakeid}')
        errors += 1
        continue

    # Check existing
    cursor.execute('SELECT source_id FROM sources_wechat_ext WHERE source_id = ?', (source_id,))
    existing = cursor.fetchone()

    if existing:
        cursor.execute('UPDATE sources_wechat_ext SET faker_id = ? WHERE source_id = ?',
                      (fakeid, source_id))
        print(f'  [UPDATE] ID:{source_id} -> fakeid: {fakeid}')
    else:
        cursor.execute('INSERT INTO sources_wechat_ext (source_id, faker_id) VALUES (?, ?)',
                      (source_id, fakeid))
        print(f'  [INSERT] ID:{source_id} -> fakeid: {fakeid}')

    updated += 1

conn.commit()

# Verify
cursor.execute('SELECT source_id, faker_id FROM sources_wechat_ext ORDER BY source_id')
rows = cursor.fetchall()
print(f'\nVerified: sources_wechat_ext has {len(rows)} records:')
for row in rows:
    print(f'  source_id={row[0]}, faker_id={row[1]}')

conn.close()
print(f'\nDone! updated={updated}, skipped={skipped}, errors={errors}')
