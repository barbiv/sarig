# סריג — לומדים גיטרה עם שירים

אפליקציית ווב (PWA) לאייפון: Play Along מסונכרן, ספריית אקורדים, אימוני מעברים ומעקב התקדמות.
האתר החי נבנה מהתיקייה `docs/` ומפורסם אוטומטית ב-GitHub Pages בכל push ל-`main`.

## מבנה
- `src/` — קוד האפליקציה (JS מודולרי, נארז עם esbuild ל-`docs/app.js`)
- `build/build.sh` — בנייה (bundle + css + index.html + sw.js עם גרסה חדשה)
- `build/build_data.py` — בניית מאגר השירים מ-`raw/` (לא בריפו; ראו למטה) → `docs/data/`
- `build/build_chords.py` — צורות אחיזה מ-chords-db → `docs/data/chords.json`
- `build/curated_he.txt` — שירים בעברית (מהלכים בסיסיים, פורמט מתועד בראש הקובץ)
- `build/smoke.py`, `build/smoke2.py` — בדיקות Playwright במסך אייפון

## בנייה מחדש של הנתונים
```
mkdir raw && cd raw
git clone --depth 1 https://github.com/boomerr1/The-McGill-Billboard-Project billboard
git clone --depth 1 https://github.com/smashub/choco choco
git clone --depth 1 https://github.com/tombatossals/chords-db chordsdb
cd .. && python3 build/build_data.py && python3 build/build_chords.py
```

## פריסה
`./build/build.sh` ואז commit + push ל-`main` → GitHub Pages מתעדכן תוך כדקה.

## מקורות ורישיונות
McGill Billboard (CC0) · ChoCo Chord Corpus (CC BY 4.0) · chords-db (MIT).
