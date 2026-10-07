# Automatic deployment on GoDaddy cPanel

The server can check GitHub's `main` branch every minute and publish new commits
to `/home/bbbgv5z3ysnm/public_html`. This is scheduled polling, so deployment
normally starts within a minute of a push, rather than immediately on a webhook.
No GitHub Actions secrets or additional hosting credentials are needed; the
server uses the existing repository's access to GitHub.

## One-time activation

1. Open GoDaddy **Web Hosting → Manage → cPanel Admin**.
2. Open **Git Version Control → coolzone → Manage → Pull or Deploy** and click
   **Update from Remote** once to download `scripts/deploy.sh`.
3. Check that the repository's checked-out branch is **main** and has no local
   edits. The repository path is `/home/bbbgv5z3ysnm/repositories/coolzone`.
4. Open **Advanced → Cron Jobs**. Choose **Once Per Minute** (all five schedule
   fields are `*`). Paste this into the **Command** field:

   ```sh
   /bin/sh /home/bbbgv5z3ysnm/repositories/coolzone/scripts/deploy.sh --pull
   ```

5. Click **Add New Cron Job**. Keep cron email enabled during setup so failures
   are visible. Successful unchanged runs are silent.

The first run publishes the current commit. Later runs publish only when the
commit changes, and retry a failed deployment. The script requires `git` and
`flock` on the hosting server. GitHub access must work without an interactive
password prompt; an existing private-repository SSH key must work unattended.

## Verification and troubleshooting

- After adding the cron job, allow about a minute and refresh the website.
- In File Manager, enable **Show Hidden Files** and open
  `/home/bbbgv5z3ysnm/repositories/coolzone/.git/coolzone-last-deployed`.
  Its commit ID is written only after the website files have been copied.
- Cron copies files directly, so its runs do not update cPanel's **Last Deployed**
  dashboard entry. **Deploy HEAD Commit** still works and uses the same script.
- If a run fails, inspect the cron email. Fix local server changes, a wrong
  checked-out branch, GitHub authentication, or file permissions before retrying.
- The script will not reset the server repository or delete unrelated hosting
  files. Removed repository assets are not automatically deleted from the site.
- To stop automatic deployment, disable or delete this entry in **Cron Jobs**.

GoDaddy setup reference:
https://www.godaddy.com/en-au/help/create-cron-jobs-16086
