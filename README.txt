ANKIT FINANCE HUB — READY SETUP

IMPORTANT: This is the fast GitHub frontend + Google Sheets cloud database version.

STEP 1 — BACKEND (ONE TIME)
1. Open the Google Sheet you want as database.
2. Extensions → Apps Script.
3. Replace Code.gs with the included Code.gs.
4. Deploy → New deployment → Web app.
5. Execute as: Me.
6. Who has access: Anyone (or Anyone with Google account, depending on your preference).
7. Deploy and copy the /exec URL.

STEP 2 — FRONTEND
1. Open app.js.
2. Replace only this text:
   PASTE_YOUR_APPS_SCRIPT_EXEC_URL_HERE
   with your copied /exec URL.
3. Upload index.html, style.css and app.js to a PUBLIC GitHub repository.

STEP 3 — GITHUB PAGES
Repository → Settings → Pages
Source: Deploy from a branch
Branch: main
Folder: / (root)
Save.

Your app will be:
https://YOUR-GITHUB-USERNAME.github.io/YOUR-REPOSITORY-NAME/

SYNC
Every Save sends data directly to Google Sheets and then immediately reloads the latest cloud data.
Laptop and mobile therefore see the same database after refresh/save.

FILES
Code.gs      = Google Apps Script cloud backend
index.html   = App UI
style.css    = App design
app.js       = App logic
README.txt   = Setup
