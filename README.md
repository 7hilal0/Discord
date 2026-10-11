# Discord Worker

Cloudflare Worker endpoint for Discord Interactions.

## Endpoints
- `GET /` – service information
- `GET /health` – health check
- `POST /interactions` – Discord interactions endpoint (Ed25519 signature verified)

## Cloudflare setup
1. Connect this repository to a Cloudflare Worker named `discord`.
2. Add a Worker secret/variable named `DISCORD_PUBLIC_KEY` containing the **Application Public Key** from Discord Developer Portal. It is a public key, but configure it in Worker settings for convenience.
3. Deploy the Worker.
4. In Discord Developer Portal, set Interactions Endpoint URL to `https://discord.<your-subdomain>.workers.dev/interactions`.
5. Register slash commands `/hello` and `/status` separately; endpoint code handles these command names.
6. Keep any Bot Token only in Cloudflare Worker secrets. Never commit tokens or other credentials to GitHub.

This is a minimal interactions endpoint. It does not yet perform privileged guild moderation actions or automatically register slash commands.