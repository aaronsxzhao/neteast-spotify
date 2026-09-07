# Daily Relay — NetEase recommendations to Spotify

Daily Relay mirrors the current day's NetEase Cloud Music recommendations into a single Spotify playlist. Each sync replaces the playlist contents, preserves the NetEase order, and records tracks that could not be matched confidently.

## What it does

- Fetches the logged-in user's NetEase daily recommendations.
- Searches Spotify by title, artist, album, and duration.
- Rejects low-confidence matches instead of silently adding the wrong song.
- Creates one private Spotify playlist by default, then replaces it each day.
- Applies an original Daily Relay cover instead of Spotify's automatic album collage.
- Runs a manual sync from the dashboard or an automatic sync at a chosen local hour.
- Stores credentials and tokens only in `.data/state.json` with owner-only file permissions.

## Requirements

- Node.js 22 or newer.
- A NetEase Cloud Music account with daily recommendations.
- A Spotify account and a Spotify developer application.
- The service must remain running for the built-in daily scheduler to fire.

## Setup

1. Install and start the app:

   ```bash
   pnpm install
   pnpm start
   ```

2. Open <http://127.0.0.1:8787>.

3. In the [Spotify Developer Dashboard](https://developer.spotify.com/dashboard), create an app. Add this exact redirect URI to the app:

   ```text
   http://127.0.0.1:8787/auth/spotify/callback
   ```

   Paste the app's Client ID into Daily Relay and connect Spotify. The app uses Authorization Code with PKCE, so a client secret is not needed.

4. Press **Connect with QR code** and scan it with the NetEase mobile app. Confirm the login on your phone. Daily Relay saves the resulting session locally.

   Manual fallback: log in at [music.163.com](https://music.163.com), open browser developer tools, select a request to `music.163.com`, and copy its `Cookie` request header. Paste the full value under **Use MUSIC_U cookie instead**. It must contain `MUSIC_U=`. Do not share this value—it provides access to your NetEase session.

5. Save setup and press **Sync today's mix**. Keep the process running to receive automatic daily updates.

6. Under **Set the rhythm**, press **Authorize & apply cover**. Spotify asks once for the additional image-upload permission, then Daily Relay applies the custom cover to the existing playlist.

## Running continuously on macOS

For a quick local setup, keep `pnpm start` running in a terminal. For unattended use, configure a macOS LaunchAgent or run the app on a private server. The state file contains login tokens, so do not deploy it to a public host without adding authentication and a proper secrets store.

## Configuration

- `HOST` defaults to `127.0.0.1`. Binding to a public interface is not recommended because the dashboard has no login screen.
- `PORT` defaults to `8787`.
- `APP_ORIGIN` defaults to `http://HOST:PORT`. If changed, update the Spotify redirect URI to match exactly.

## Notes and limitations

NetEase does not offer a public official API for daily recommendations. This project uses the community-maintained `@neteasecloudmusicapienhanced/api` package, so NetEase changes may occasionally require a dependency update. Spotify authorization refresh tokens currently expire after six months; the dashboard will ask you to reconnect when necessary.

This project does not download or transfer audio. It only recreates a list of matching tracks that already exist on Spotify.
