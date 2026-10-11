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
      "raw", hexToBytes(publicKeyHex), { name: "Ed25519" }, false, ["verify"]
    );
    return await crypto.subtle.verify(
      { name: "Ed25519" }, key, hexToBytes(signature),
      new TextEncoder().encode(timestamp + body)
    );
  } catch {
    return false;
  }
}

const APP_ID = "1558897599287656457";
const DISCORD_API = "https://discord.com/api/v10";

async function discordRequest(env, path, method = "GET", body) {
  return fetch(DISCORD_API + path, {
    method,
    headers: {
      Authorization: `Bot ${env.DISCORD_BOT_TOKEN}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

function option(interaction, name) {
  return interaction.data?.options?.find((item) => item.name === name)?.value;
}

function isManager(interaction) {
  const permissions = BigInt(interaction.member?.permissions ?? "0");
  const ADMINISTRATOR = 1n << 3n;
  const MANAGE_GUILD = 1n << 5n;
  return (permissions & ADMINISTRATOR) !== 0n || (permissions & MANAGE_GUILD) !== 0n;
}

function reply(content, ephemeral = true) {
  return { type: 4, data: { content, ...(ephemeral ? { flags: 64 } : {}) } };
}

const commands = [
  {
    name: "123",
    description: "اختبار بوت محمود",
    type: 1
  },
  {
    name: "status",
    description: "عرض حالة بوت محمود",
    type: 1
  },
  {
    name: "ask",
    description: "اسأل الذكاء الاصطناعي",
    type: 1,
    options: [{ name: "question", description: "اكتب سؤالك", type: 3, required: true, max_length: 1500 }]
  },
  {
    name: "create-room",
    description: "إنشاء روم في السيرفر",
    type: 1,
    default_member_permissions: "32",
    options: [
      { name: "name", description: "اسم الروم", type: 3, required: true, max_length: 90 },
      { name: "type", description: "نوع الروم", type: 3, required: true, choices: [
        { name: "كتابي", value: "text" }, { name: "صوتي", value: "voice" }
      ]}
    ]
  },
  {
    name: "create-role",
    description: "إنشاء رتبة جديدة",
    type: 1,
    default_member_permissions: "32",
    options: [
      { name: "name", description: "اسم الرتبة", type: 3, required: true, max_length: 90 },
      { name: "color", description: "لون Hex مثل #FFFF00", type: 3, required: false, max_length: 7 }
    ]
  }
];

async function answerWithAI(interaction, env) {
  const question = option(interaction, "question");
  if (!env.OPENROUTER_API_KEY) {
    await fetch(`${DISCORD_API}/webhooks/${APP_ID}/${interaction.token}/messages/@original`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: "الذكاء الاصطناعي غير مضبوط بعد. أضف OPENROUTER_API_KEY كـ Secret في Cloudflare." })
    });
    return;
  }
  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://discord.gggy6vvv.workers.dev/",
        "X-Title": "Mahmoud Discord Bot"
      },
      body: JSON.stringify({
        model: env.OPENROUTER_MODEL || "openrouter/auto",
        messages: [
          { role: "system", content: "أنت محمود، مساعد ودود داخل Discord. أجب بالعربية الواضحة وباختصار. لا تدّع تنفيذ إجراءات داخل السيرفر؛ الأوامر الإدارية تحتاج أدوات Discord مخصصة." },
          { role: "user", content: question }
        ],
        max_tokens: 700
      })
    });
    const data = await response.json();
    const answer = response.ok
      ? (data.choices?.[0]?.message?.content || "لم أتمكن من صياغة رد.")
      : "تعذّر الاتصال بنموذج الذكاء الاصطناعي. تحقق من مفتاح OpenRouter والنموذج المحدد.";
    await fetch(`${DISCORD_API}/webhooks/${APP_ID}/${interaction.token}/messages/@original`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: answer.slice(0, 1900) })
    });
  } catch {
    await fetch(`${DISCORD_API}/webhooks/${APP_ID}/${interaction.token}/messages/@original`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: "حدث خطأ أثناء الاتصال بالذكاء الاصطناعي. حاول مرة أخرى." })
    });
  }
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/") {
      return json({ name: "Mahmoud Discord Worker", status: "online", endpoints: ["/", "/health", "/interactions"] });
    }
    if (request.method === "GET" && url.pathname === "/health") {
      return json({ ok: true, service: "discord-worker" });
    }

    // Protect command registration with a separate secret. Never expose bot tokens.
    if (request.method === "POST" && url.pathname === "/register") {
      const supplied = request.headers.get("authorization") || "";
      if (!env.REGISTER_SECRET || supplied !== `Bearer ${env.REGISTER_SECRET}`) {
        return json({ error: "Unauthorized. Configure REGISTER_SECRET and send Authorization: Bearer <secret>." }, 401);
      }
      if (!env.DISCORD_BOT_TOKEN) return json({ error: "Missing DISCORD_BOT_TOKEN secret in Cloudflare" }, 500);
      const discordResponse = await discordRequest(env, `/applications/${APP_ID}/commands`, "PUT", commands);
      const resultText = await discordResponse.text();
      if (!discordResponse.ok) return json({ error: "Discord command registration failed", status: discordResponse.status, details: resultText.slice(0, 500) }, 502);
      return json({ ok: true, registered: commands.map((command) => command.name) });
    }

    if (request.method !== "POST" || url.pathname !== "/interactions") return json({ error: "Not found" }, 404);
    const body = await request.text();
    if (!(await verifyDiscordRequest(request, body, env.DISCORD_PUBLIC_KEY))) return json({ error: "Invalid request signature" }, 401);

    let interaction;
    try { interaction = JSON.parse(body); } catch { return json({ error: "Invalid JSON" }, 400); }
    if (interaction.type === 1) return json({ type: 1 });
    if (interaction.type !== 2) return json({ type: 1 });

    const command = interaction.data?.name;
    if (command === "123") return json(reply("مرحبًا! محمود يعمل بنجاح ✅"));
    if (command === "status") return json(reply("حالة محمود: يعمل عبر Cloudflare Workers ✅"));

    if (command === "ask") {
      // Acknowledge immediately; Discord requires an initial response within 3 seconds.
      ctx.waitUntil(answerWithAI(interaction, env));
      return json({ type: 5, data: { flags: 64 } });
    }

    if (command === "create-room" || command === "create-role") {
      if (!isManager(interaction)) return json(reply("هذا الأمر متاح فقط لمن لديه صلاحية إدارة السيرفر." ));
      if (!env.DISCORD_BOT_TOKEN) return json(reply("إعداد DISCORD_BOT_TOKEN غير موجود في Cloudflare."));
      const guildId = interaction.guild_id;
      if (!guildId) return json(reply("هذا الأمر يعمل داخل السيرفر فقط."));
      try {
        if (command === "create-room") {
          const name = String(option(interaction, "name") || "").trim().toLowerCase().replace(/\s+/g, "-");
          const type = option(interaction, "type") === "voice" ? 2 : 0;
          if (!name) return json(reply("اكتب اسمًا صالحًا للروم."));
          const res = await discordRequest(env, `/guilds/${guildId}/channels`, "POST", { name, type });
          if (!res.ok) return json(reply("تعذّر إنشاء الروم. تأكد أن محمود يملك Manage Channels وأن ترتيب صلاحياته مناسب."));
          const channel = await res.json();
          return json(reply(`تم إنشاء الروم بنجاح: ${type === 2 ? "صوتي" : "كتابي"} — #${channel.name} ✅`));
        }
        const name = String(option(interaction, "name") || "").trim();
        const colorText = String(option(interaction, "color") || "#FFFF00").trim();
        if (!name) return json(reply("اكتب اسمًا صالحًا للرتبة."));
        if (!/^#?[0-9a-fA-F]{6}$/.test(colorText)) return json(reply("صيغة اللون غير صحيحة. استخدم مثلًا #FFFF00."));
        const color = Number.parseInt(colorText.replace("#", ""), 16);
        const res = await discordRequest(env, `/guilds/${guildId}/roles`, "POST", { name, color, hoist: false, mentionable: false });
        if (!res.ok) return json(reply("تعذّر إنشاء الرتبة. تأكد أن محمود يملك Manage Roles."));
        const role = await res.json();
        return json(reply(`تم إنشاء الرتبة «${role.name}» باللون #${color.toString(16).padStart(6, "0").toUpperCase()} ✅`));
      } catch {
        return json(reply("حدث خطأ أثناء تنفيذ الأمر. تحقق من صلاحيات محمود."));
      }
    }
    return json(reply("هذا الأمر غير معروف حاليًا."));
  }
};
