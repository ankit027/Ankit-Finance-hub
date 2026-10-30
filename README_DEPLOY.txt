ANKIT FINANCE HUB — UPDATED FILES

Files included:
- Code.gs
- index.html
- app.js
- style.css

WHAT CHANGED
1. Fuel entries include previous odometer, current odometer, and automatically calculated distance since the previous fuel entry.
2. Fuel and maintenance entries include a payment account. The same account is written to the linked Passbook expense.
3. Oil, engine-oil, and coolant reminders are tracked independently per vehicle.
4. The Next change after how many km field is an INTERVAL, not an absolute odometer. Example: service at 1,000 km + interval 2,000 km = next target 3,000 km.
5. Give & Take history displays Purpose and Notes as Remarks.

DEPLOYMENT
1. Make a backup copy of your current Apps Script project and Google Sheet.
2. Replace Code.gs with the supplied Code.gs. Save. The setup routine only appends missing columns to existing sheets; it does not clear existing records.
3. Replace the hosted frontend files index.html, app.js, and style.css with these versions.
4. In Apps Script, Deploy > Manage deployments > Edit the existing Web App deployment > select New version > Deploy. Keep the existing deployment URL and access settings.
5. Open the app and refresh. Enter a service record with actual odometer and the distance interval for the next change.

IMPORTANT
- Existing Passbook data and existing vehicle data are retained. New columns Distance and Account are appended to the Fuel and Maintenance sheets by setup_.
- Existing old fuel / maintenance rows will show “Not recorded” for payment account because they were saved before the account field was added.
- The first fuel entry for a vehicle has no previous odometer, so distance since previous fill is left blank/zero. Later entries calculate the odometer difference.
- For an oil or coolant service, record the actual odometer at the time of service. Enter 2,000 in the interval field if you want the next change after another 2,000 km.
