# סריג — הוראות עבודה ל-Claude

- ריפו: https://github.com/barbiv/sarig (ציבורי) · אתר חי: https://barbiv.github.io/sarig/
- GitHub Pages מפרסם אוטומטית את `docs/` מ-`main` בכל push (כדקה).

## תהליך עדכון
1. בענן: `git clone https://github.com/barbiv/sarig` (הריפו ציבורי, clone עובד בלי הרשאות).
2. לשינויי נתונים — לשכפל את המאגרים ל-`raw/` (ראו README) ולהריץ `build/build_data.py` / `build/build_chords.py`.
3. `./build/build.sh` (מעדכן גרסה ב-index.html וב-sw.js, כך שהאייפון מקבל את העדכון).
4. בדיקה: `cd docs && python3 -m http.server 8765` ואז `python3 build/smoke3.py` (אייפון 15 פרו) + בדיקות המיקרופון והסימנייה.
5. commit, ואז `git bundle create sarig-<מספר>.bundle main` (שם קובץ חדש בכל פעם — דריסה של קובץ קיים לא תמיד מתעדכנת במחשב), להעביר למחשב של בר
   לתיקייה `~/Documents/Sarig Guitar App/.gh-auth/`, ומשם ב-device_bash:
   `export GH_TOKEN=$(cat ".../.gh-auth/token")`, `git clone https://github.com/barbiv/sarig repo`,
   `git pull <bundle> main`, `git push` עם `https://x-access-token:$GH_TOKEN@github.com/barbiv/sarig.git`.
   (אם הטוקן פג — device flow עם client_id של gh: 178c6fc778ccc68e1d6a, scopes repo,workflow.)
6. תיקייה מחוברת לא מאפשרת מחיקה — להחזיק את ה-clone ב-$HOME של ה-VM, לא ב-Documents.

## גרסאות ו-rollback
- מספר הגרסה בקובץ `VERSION` (מוזרק לאפליקציה כ-APP_VERSION). לכל שחרור: לעדכן VERSION, להוסיף רשומה ב-`CHANGELOG.md` וב-`src/whatsnew.js`, לבנות, לדחוף, ואז `git tag vX.Y.Z` + `gh release create`.
- Rollback: `git checkout vX.Y.Z -- docs` ואז commit + push (האתר חוזר לגרסה הזו; נתוני המשתמש במכשיר לא נפגעים).
- עבודה על שינויים גדולים: לבנות ולבדוק מקומית לפני push ל-main (main = האתר החי).

## יוטיוב ומילים
- `docs/data/yt.json` נבנה ע"י GitHub Action `youtube.yml` (yt-dlp, מתוך GitHub Actions — לסביבות של Claude אין גישה ליוטיוב). הרצה: `gh workflow run youtube.yml -f limit=2600 -f minutes=300`.
- מילים מסונכרנות: LRCLIB, נטענות בזמן ריצה במכשיר ונשמרות רק שם. לא לשמור מילים בריפו.
- חיפוש חי של סרטונים: Piped API (api.piped.private.coffee). `diag.yml` בודק זמינות שירותים וכותב ל-`build/diag.txt`.

## מיקרופון (כוונן והאזנה)
- `src/mic.js`: McLeod pitch לכוונן, כרומה + תבניות הרמוניות לזיהוי אקורדים (`matchChord`, `whichChord`).
- בדיקות עם מיקרופון מדומה: `build/mictest.py`, `mictest2.py`, `mictest3.py` (קבצי WAV סינתטיים — ראו הסקריפטים; Chromium עם `--use-file-for-fake-audio-capture`).

## ייבוא שירים
- אין משיכה אוטומטית מאתרי אקורדים. הייבוא: סימנייה לספארי (`src/tools/bookmarklet.js`, נבנית ל-`src/bookmarklet_url.js`) + ״ייבוא מהלוח״ (`src/importer.js`). בדיקה: `build/bmtest.py`.

## ממשק (HIG)
- `src/polish.js`: מצבי לחיצה, thumb מחליק ל-`.seg`, `onLongPress`, `actionSheet`, `spinner`. `src/nav.js`: פרלקסה/החשכה ב-push/pop. `ui.recede()`: אפקט כרטיס מאחורי sheet גבוה.
- בדיקה: `build/polishtest.py` (מעברים, לחיצה ארוכה, חיפוש, sheet, קישור שיתוף).

## עקרונות
- ממשק בעברית RTL; שמות אקורדים LTR. נתוני המשתמש נשמרים מקומית (IndexedDB + localStorage) — לא לשבור את מבנה ה-state ב-`src/store.js` (להוסיף שדות, לא לשנות קיימים). מפתחות שירים יציבים (`db:<hash>`) — לא לשנות את `stable_key`.
- בלי מילות שירים במאגר המובנה (זכויות יוצרים).
