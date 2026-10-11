const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });

async function verifyDiscordRequest(request, body, publicKeyHex) {
  const signature = request.headers.get("x-signature-ed25519");
  const timestamp = request.headers.get("x-signature-timestamp");
  if (!signature || !timestamp || !publicKeyHex) return false;

  try {
    const hexToBytes = (hex) => {
      if (!/^[0-9a-f]+$/i.test(hex) || hex.length % 2) throw new Error("Invalid hex");
      return new Uint8Array(hex.match(/.{2}/g).map((b) => parseInt(b, 16)));
    };
    const key = await crypto.subtle.importKey(
      "raw",
      hexToBytes(publicKeyHex),
      { name: "Ed25519" },
      false,
      ["verify"]
    );
    return await crypto.subtle.verify(
      { name: "Ed25519" },
      key,
      hexToBytes(signature),
      new TextEncoder().encode(timestamp + body)
    );
  } catch {
    return false;
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/") {
      return json({
        name: "Discord Worker",
        status: "online",
        endpoints: ["/", "/health", "/interactions"],
      });
    }

    if (request.method === "GET" && url.pathname === "/health") {
      return json({ ok: true, service: "discord-worker" });
    }

    // Register the slash commands with Discord when /register is requested.
    // Keep DISCORD_BOT_TOKEN configured as a Cloudflare Secret, never in GitHub.
    if (request.method === "POST" && url.pathname === "/register") {
      if (!env.DISCORD_BOT_TOKEN) {
        return json({ error: "Missing DISCORD_BOT_TOKEN secret in Cloudflare" }, 500);
      }
      const appId = "1558897599287656457";
      const commands = [
        { name: "123", description: "اختبار بوت محمود", type: 1 },
        { name: "status", description: "عرض حالة بوت محمود", type: 1 }
      ];
      const discordResponse = await fetch(`https://discord.com/api/v10/applications/${appId}/commands`, {
        method: "PUT",
        headers: {
          "Authorization": `Bot ${env.DISCORD_BOT_TOKEN}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(commands)
      });
      const resultText = await discordResponse.text();
      if (!discordResponse.ok) {
        return json({ error: "Discord command registration failed", status: discordResponse.status, details: resultText.slice(0, 500) }, 502);
      }
      return json({ ok: true, registered: commands.map(command => command.name) });
    }

    if (request.method !== "POST" || url.pathname !== "/interactions") {
      return json({ error: "Not found" }, 404);
    }

    const body = await request.text();
    if (!(await verifyDiscordRequest(request, body, env.DISCORD_PUBLIC_KEY))) {
      return json({ error: "Invalid request signature" }, 401);
    }

    let interaction;
    try {
      interaction = JSON.parse(body);
    } catch {
      return json({ error: "Invalid JSON" }, 400);
    }

    // Discord sends type 1 (PING) when validating the interactions endpoint.
    if (interaction.type === 1) return json({ type: 1 });

    // Application command interactions use type 2.
    if (interaction.type === 2) {
      const command = interaction.data?.name;
      const replies = {
        "123": "مرحبًا! محمود يعمل بنجاح ✅",
        status: "حالة البوت: متصل ويعمل ✅",
      };
      const content = replies[command] ?? "هذا الأمر غير معروف حاليًا.";
      return json({
        type: 4,
        data: { content, flags: 64 },
      });
    }

    return json({ type: 1 });
  },
};