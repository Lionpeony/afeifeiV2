import sqlite3, json
con = sqlite3.connect(r'C:\Users\Administrator\.cc-switch\cc-switch.db')
cur = con.cursor()
tables = [r[0] for r in cur.execute("select name from sqlite_master where type='table'")]
print('tables:', tables)
for t in tables:
    cols = [c[1] for c in cur.execute(f'pragma table_info({t})')]
    print(f'--- {t}: {cols}')
    rows = cur.execute(f'select * from {t}').fetchall()
    for row in rows:
        s = str(row)
        if 'gpt-6' in s or 'luna' in s.lower():
            print(row)
