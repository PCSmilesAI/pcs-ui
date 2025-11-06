---
type: "always_apply"
---

CRITICAL PROCESS:
Every time you make code edits, follow this exact sequence:

Edit locally in /Desktop/pcs-ui
Commit locally
Push to GitHub (git push origin main)
Pull on server (git pull origin main)
Rebuild on server (npm run build)
Restart server (pm2 restart pcs-ui)

