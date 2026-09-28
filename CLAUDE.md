# סריג — הוראות עבודה ל-Claude

- ריפו: https://github.com/barbiv/sarig (ציבורי) · אתר חי: https://barbiv.github.io/sarig/
- GitHub Pages מפרסם אוטומטית את `docs/` מ-`main` בכל push (כדקה).

## תהליך עדכון
1. בענן: `git clone https://github.com/barbiv/sarig` (הריפו ציבורי, clone עובד בלי הרשאות).
2. לשינויי נתונים — לשכפל את המאגרים ל-`raw/` (ראו README) ולהריץ `build/build_data.py` / `build/build_chords.py`.
3. `./build/build.sh` (מעדכן גרסה ב-index.html וב-sw.js, כך שהאייפון מקבל את העדכון).
4. בדיקה: `cd docs && python3 -m http.server 8765` ואז `python3 build/smoke.py` + `build/smoke2.py` (צילומי מסך למסך אייפון).
5. commit, ואז `git bundle create sarig.bundle origin/main..main` (או bundle מלא), להעביר למחשב של בר
   לתיקייה `~/Documents/Sarig Guitar App/.gh-auth/`, ומשם ב-device_bash:
   `export GH_TOKEN=$(cat ".../.gh-auth/token")`, `git clone https://github.com/barbiv/sarig repo`,
   `git pull <bundle> main`, `git push` עם `https://x-access-token:$GH_TOKEN@github.com/barbiv/sarig.git`.
   (אם הטוקן פג — device flow עם client_id של gh: 178c6fc778ccc68e1d6a, scopes repo,workflow.)
6. תיקייה מחוברת לא מאפשרת מחיקה — להחזיק את ה-clone ב-$HOME של ה-VM, לא ב-Documents.

## עקרונות
- ממשק בעברית RTL; שמות אקורדים LTR. נתוני המשתמש נשמרים מקומית (IndexedDB + localStorage) — לא לשבור את מבנה ה-state ב-`src/store.js` (להוסיף שדות, לא לשנות קיימים). מפתחות שירים יציבים (`db:<hash>`) — לא לשנות את `stable_key`.
- בלי מילות שירים במאגר המובנה (זכויות יוצרים).
