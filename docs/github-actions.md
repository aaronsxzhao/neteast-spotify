# GitHub Actions daily sync

The `Daily Spotify Sync` workflow runs on GitHub's Ubuntu runners at approximately 08:17 Beijing time. Recovery runs at 09:17 and 10:17 skip automatically if today's sync succeeded. GitHub may delay or drop schedules; this is not an exact-time guarantee.

## One-time setup

1. Connect both accounts in the local dashboard and sync once to create the target playlist.
2. Run `node scripts/export-cloud-secrets.js`. It writes two owner-only files inside the ignored `.data/` folder without printing their contents. The existing encryption key is reused, not regenerated.
3. In your repository, open Settings → Secrets and variables → Actions. Create these **repository secrets**, copying each corresponding file's contents:
   - `DAILY_RELAY_CONFIG`: Spotify Client ID, refresh token, NetEase cookie, existing playlist ID and settings, as JSON.
   - `DAILY_RELAY_STATE_KEY`: 32 random bytes encoded as 64 hex characters.
4. Push the workflow and source to the default branch. The workflow requests `contents: write` for its encrypted state branch; repository or organization rules must permit that.
5. Open Actions → Daily Spotify Sync → Run workflow. Select the default branch. Enable `force` only to repeat an already successful day. Check for a green run and the matched-track count.
6. After the first successful cloud run, turn off **Update automatically every day** in the local dashboard and save setup. Use GitHub's Run workflow button for subsequent manual runs so local/cloud writers do not race or reuse an old refresh token.

The existing Spotify playlist ID is mandatory. Cloud runs never create replacement playlists when the configured target is missing, and never clear the playlist when zero confident matches are found. Existing custom cover artwork is retained because only tracks and playlist details are changed.

## State, privacy, and credentials

`daily-relay-state` is a dedicated branch containing AES-256-GCM encrypted `state.enc`. It records the latest refresh token, playlist reference, and last successful date. The encryption key stays in GitHub Secrets. Token rotation is saved immediately, including before a later sync failure. This avoids relying on temporary runners or expiring caches. The branch is initialized from the workflow commit; its code snapshot is not used to execute future runs.

State is saved before external sync operations to check write permission, and after meaningful changes. Concurrent cloud runs are serialized. A wrong encryption key aborts rather than discarding state and falling back to a potentially expired seed token. Keep a backup of the key in a secure location. Access tokens, NetEase cookies, track history, and decrypted state are never uploaded as artifacts or committed. Public logs contain only aggregate counts and sanitized failures. GitHub Actions can access the stored secrets; repository collaborators with workflow-editing access must be trusted.

If an account authorization expires, reconnect in the local app, rerun the export, and update `DAILY_RELAY_CONFIG`. Its changed configuration causes the new seed credentials to replace the old encrypted credentials. Keep `DAILY_RELAY_STATE_KEY` unchanged. Local playlist/schedule settings are not automatically copied to GitHub after setup.

## Limits and troubleshooting

- Spotify currently requires user reauthorization after six months for Developer Dashboard apps; renewing access tokens does not extend that lifetime. NetEase sessions can also expire or be rejected by remote IP checks. Those require a fresh login, not repeated automated attempts.
- GitHub schedules may run late. Public repositories without activity for 60 days can have schedules disabled; inspect the Actions page if runs stop. Encrypted state updates are repository activity, but should not be treated as an uptime guarantee.
- Workflow failures appear in Actions; notification delivery follows your GitHub Actions notification preferences.
- No matching tracks: check catalog availability and account region. The existing playlist is kept.
- State-storage HTTP 403: check workflow permissions and rules protecting `daily-relay-state`.
- NetEase may not accept a GitHub-hosted runner's region/IP. If first-run testing shows that, use a trusted self-hosted runner or server in a supported region; do not assume the local success proves cloud connectivity.
- To pause cloud syncing, disable this workflow on the Actions page. To change the times, edit its UTC cron expression.

References: [GitHub schedules](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule), [workflow token permissions](https://docs.github.com/en/actions/tutorials/authenticate-with-github_token), [Spotify refresh tokens](https://developer.spotify.com/documentation/web-api/tutorials/refreshing-tokens).
