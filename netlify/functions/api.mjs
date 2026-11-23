// Backend Cellestial Market: Netlify Functions + Netlify Blobs (tanpa database / Supabase).
// Env di Netlify: ADMIN_PASSWORD (wajib), SESSION_SECRET (disarankan, string acak panjang).
import { getStore } from "@netlify/blobs";
import crypto from "node:crypto";

export const config = { path: "/api/*" };

const db = () => getStore({ name: "cm", consistency: "strong" });
const imgDb = () => getStore({ name: "cm-img", consistency: "strong" });

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
const bad = (m, s = 400) => new HttpError(s, m);

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });

/* ---------- auth: token bertanda tangan HMAC ---------- */
const SECRET = () => process.env.SESSION_SECRET || process.env.ADMIN_PASSWORD || "";
const hmac = (s) => crypto.createHmac("sha256", SECRET()).update(s).digest("base64url");
function makeToken(ttlMs) {
  const body = Buffer.from(JSON.stringify({ role: "admin", exp: Date.now() + ttlMs })).toString("base64url");
  return `${body}.${hmac(body)}`;
}
function isAdmin(req) {
  const t = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const [body, sig] = t.split(".");
  if (!body || !sig || !SECRET()) return false;
  const a = Buffer.from(sig);
  const b = Buffer.from(hmac(body));
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return false;
  try {
    const p = JSON.parse(Buffer.from(body, "base64url").toString());
    return p.role === "admin" && p.exp > Date.now();
  } catch {
    return false;
  }
}
const needAdmin = (admin) => {
  if (!admin) throw bad("Perlu login admin", 401);
};
const sha = (s) => crypto.createHash("sha256").update(String(s)).digest();
const samePw = (a, b) => crypto.timingSafeEqual(sha(a), sha(b));

/* ---------- util ---------- */
const hits = new Map();
function limit(key, max, ms) {
  const now = Date.now();
  const a = (hits.get(key) || []).filter((t) => now - t < ms);
  if (a.length >= max) {
    hits.set(key, a);
    throw bad("Terlalu banyak permintaan, coba lagi nanti", 429);
  }
  a.push(now);
  hits.set(key, a);
  if (hits.size > 2000) for (const [k, v] of hits) if (!v.some((t) => now - t < ms)) hits.delete(k);
}
const str = (v, max) => String(v ?? "").slice(0, max);
const num = (v, max = 1e12) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(Math.max(0, Math.round(n)), max) : 0;
};
const ab = (buf) => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);

// baca-ubah-tulis dengan pengecekan versi (etag) supaya dua pengunjung tidak saling menimpa
async function mutate(key, fallback, fn) {
  const s = db();
  for (let i = 0; i < 6; i++) {
    const cur = await s.getWithMetadata(key, { type: "json" });
    const data = cur ? cur.data : structuredClone(fallback);
    const out = await fn(data);
    const res = await s.setJSON(key, data, cur ? { onlyIfMatch: cur.etag } : { onlyIfNew: true });
    if (!res || res.modified !== false) return out;
  }
  throw bad("Server sedang sibuk, coba lagi", 409);
}
const read = async (key, fallback) => (await db().get(key, { type: "json" })) ?? structuredClone(fallback);

/* ---------- moderasi teks ---------- */
const WORDS = ["anjing","anjg","bangsat","bajingan","kontol","memek","pepek","ngentot","jancok","jancuk","goblok","tolol","kampret","brengsek","sialan","pelacur","bokep","porno","keparat","kimak","asu","babi","kafir","judi","slot","gacor","togel","pinjol","casino"];
const nz = (s) =>
  s.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[@4]/g, "a").replace(/3/g, "e").replace(/[1!|]/g, "i").replace(/0/g, "o").replace(/[5$]/g, "s").replace(/7/g, "t");
const col = (w) => w.replace(/(.)\1+/g, "$1");
const badWords = (t) => {
  const n = nz(t), toks = n.split(/[^a-z]+/).map(col), comp = col(n.replace(/[^a-z]/g, ""));
  return WORDS.map(col).some((c) => toks.includes(c) || (c.length >= 5 && comp.includes(c)));
};
const LINK = /(https?:\/\/|www\.|\b[a-z0-9-]+\.(com|net|id|co|me|link|xyz|gg|io|shop|store|site|online)\b|wa\.me|t\.me|bit\.ly)/i;
const PHONE = (s) => /(\+?62|\b0)[\s.-]*8[\d\s.-]{7,}/.test(s) || /\d[\d\s.-]{9,}\d/.test(s);
function checkText(t, max, admin) {
  if (typeof t !== "string") throw bad("Teks tidak valid");
  const s = t.trim();
  if (!s) throw bad("Tulis sesuatu dulu");
  if (s.length > max) throw bad("Terlalu panjang");
  if (badWords(s)) throw bad("Pesan mengandung kata yang tidak diizinkan");
  if (!admin && (LINK.test(s) || PHONE(s))) throw bad("Tautan / nomor telepon tidak diizinkan");
  return s;
}
function checkName(n, admin) {
  const s = checkText(n ?? "Tamu", 24, admin);
  if (s.length < 2) throw bad("Nama minimal 2 huruf");
  if (!admin && /admin|owner|cellestial/i.test(s)) throw bad("Nama tidak boleh meniru admin/toko");
  return s;
}

/* ---------- akun & foto ---------- */
async function cleanAccount(a) {
  const out = [];
  for (const s of (Array.isArray(a.imgs) ? a.imgs : []).slice(0, 10)) {
    if (typeof s !== "string") continue;
    if (/^\/api\/img\/[a-f0-9]{40}$/.test(s)) {
      out.push(s);
      continue;
    }
    const m = /^data:(image\/(?:jpeg|png|webp|gif));base64,([A-Za-z0-9+/=]+)$/.exec(s);
    if (!m) continue;
    const buf = Buffer.from(m[2], "base64");
    if (buf.length > 900_000) throw bad("Foto terlalu besar (maks ~900KB per foto)", 413);
    const key = crypto.createHash("sha1").update(buf).digest("hex");
    await imgDb().set(key, ab(buf), { metadata: { type: m[1] } });
    out.push("/api/img/" + key);
  }
  return {
    id: num(a.id, 9e15),
    user: true,
    sold: !!a.sold,
    title: str(a.title, 120),
    price: num(a.price),
    category: str(a.category, 40),
    login: str(a.login, 40),
    label: str(a.label, 20),
    desc: str(a.desc, 3000),
    imgs: out,
    sellerName: str(a.sellerName, 60),
    sellerWa: str(a.sellerWa, 20).replace(/\D/g, ""),
    level: num(a.level, 9999),
    skins: num(a.skins, 99999),
    vault: num(a.vault, 99999),
  };
}

/* ---------- forum ---------- */
const hidden = (x) => x.hid || (x.rp || 0) >= 3;
const pubC = (r) => ({ id: r.id, uid: r.uid, name: r.name, adm: !!r.adm, text: r.text, t: r.t, likes: r.likes || 0, rp: r.rp || 0 });
const pubP = (p, admin) => ({
  id: p.id, uid: p.uid, name: p.name, adm: !!p.adm, text: p.text, t: p.t,
  likes: p.likes || 0, rp: p.rp || 0, hid: !!p.hid,
  reps: p.reps.filter((r) => admin || !hidden(r)).map(pubC),
});
const findItem = (d, kind, id) => {
  id = String(id);
  if (kind === "post") return d.posts.find((p) => String(p.id) === id);
  for (const p of d.posts) {
    const c = p.reps.find((x) => String(x.id) === id);
    if (c) return c;
  }
};

/* ---------- handler ---------- */
export default async (req, context) => {
  try {
    const url = new URL(req.url);
    const [r, a, c] = url.pathname.replace(/^\/api\/?/, "").split("/").filter(Boolean);
    const m = req.method;
    const ip = context?.ip || req.headers.get("x-nf-client-connection-ip") || "x";
    const admin = isAdmin(req);
    const body = ["POST", "PUT", "PATCH"].includes(m) ? await req.json().catch(() => ({})) : {};

    if (r === "ping") return json({ ok: true });
    if (r === "me") return json({ admin });

    if (r === "login" && m === "POST") {
      const pw = process.env.ADMIN_PASSWORD;
      if (!pw) throw bad("ADMIN_PASSWORD belum diatur di Netlify", 500);
      limit(`login:${ip}`, 8, 10 * 60 * 1000);
      if (typeof body.password !== "string" || !samePw(body.password, pw)) {
        await new Promise((res) => setTimeout(res, 700));
        throw bad("Password salah", 401);
      }
      return json({ token: makeToken(12 * 3600e3) });
    }

    if (r === "img" && m === "GET") {
      if (!/^[a-f0-9]{40}$/.test(a || "")) throw bad("Tidak ditemukan", 404);
      const f = await imgDb().getWithMetadata(a, { type: "arrayBuffer" });
      if (!f) throw bad("Tidak ditemukan", 404);
      return new Response(f.data, {
        headers: {
          "content-type": f.metadata?.type || "image/jpeg",
          "cache-control": "public, max-age=31536000, immutable",
        },
      });
    }

    if (r === "accounts") {
      if (m === "GET") return json(await read("accounts", []));
      if (m === "PUT") {
        needAdmin(admin);
        const list = Array.isArray(body.accounts) ? body.accounts : null;
        if (!list || list.length > 500) throw bad("Data akun tidak valid");
        const clean = [], seen = new Set();
        for (const raw of list) {
          const acc = await cleanAccount(raw || {});
          if (!acc.id || seen.has(acc.id) || !acc.title) continue;
          seen.add(acc.id);
          clean.push(acc);
        }
        await db().setJSON("accounts", clean);
        // hapus foto yang tidak dipakai lagi
        const used = new Set(clean.flatMap((x) => x.imgs.map((u) => u.slice(9))));
        const { blobs } = await imgDb().list();
        await Promise.all(blobs.filter((b) => !used.has(b.key)).map((b) => imgDb().delete(b.key)));
        return json({ accounts: clean });
      }
    }

    if (r === "config") {
      if (m === "GET") return json(await read("config", {}));
      if (m === "PUT") {
        needAdmin(admin);
        await db().setJSON("config", {
          waNumber: str(body.waNumber, 20).replace(/\D/g, ""),
          payNumber: str(body.payNumber, 30),
          payName: str(body.payName, 80),
        });
        return json({ ok: true });
      }
    }

    if (r === "testimonials") {
      const K = "testimonials";
      if (m === "GET") {
        const all = await read(K, []);
        const adm = admin && url.searchParams.get("all") === "1";
        const list = (adm ? all : all.filter((t) => t.approved)).sort((x, y) => y.t - x.t).slice(0, adm ? 200 : 30);
        return json(list.map((t) => ({ id: t.id, name: t.name, rating: t.rating, message: t.message, approved: !!t.approved })));
      }
      if (m === "POST" && !a) {
        limit(`t:${ip}`, 3, 3600e3);
        const name = checkName(body.name, false);
        const message = checkText(body.message, 240, false);
        if (message.length < 3) throw bad("Pesan terlalu pendek");
        const rating = Math.min(5, Math.max(1, num(body.rating, 5) || 5));
        await mutate(K, [], (d) => {
          d.push({ id: crypto.randomUUID(), name, rating, message, approved: false, t: Date.now() });
          while (d.length > 300) {
            const i = d.findIndex((x) => !x.approved);
            d.splice(i < 0 ? 0 : i, 1);
          }
        });
        return json({ ok: true });
      }
      if (m === "POST" && a && c === "approve") {
        needAdmin(admin);
        await mutate(K, [], (d) => {
          const t = d.find((x) => x.id === a);
          if (t) t.approved = true;
        });
        return json({ ok: true });
      }
      if (m === "DELETE" && a) {
        needAdmin(admin);
        await mutate(K, [], (d) => {
          const i = d.findIndex((x) => x.id === a);
          if (i >= 0) d.splice(i, 1);
        });
        return json({ ok: true });
      }
    }

    if (r === "forum") {
      const F = "forum", empty = { posts: [] };
      if (m === "GET" && !a) {
        const d = await read(F, empty);
        const posts = d.posts.filter((p) => admin || !hidden(p)).sort((x, y) => y.t - x.t).slice(0, 200);
        return json({ posts: posts.map((p) => pubP(p, admin)) });
      }
      if (m !== "POST") throw bad("Metode tidak didukung", 405);

      if (a === "posts") {
        limit(`post:${ip}`, 6, 10 * 60 * 1000);
        const text = checkText(body.text, 400, admin);
        const name = checkName(body.name, admin);
        const key = str(body.key, 80);
        if (key.length < 8) throw bad("Kunci tidak valid");
        const id = num(body.id, 9e15) || Date.now();
        await mutate(F, empty, (d) => {
          if (d.posts.some((p) => String(p.id) === String(id))) throw bad("Duplikat", 409);
          d.posts.unshift({ id, uid: str(body.uid, 40) || "anon", ukey: key, name, adm: admin, text, t: Date.now(), likes: 0, rp: 0, hid: false, reps: [] });
          d.posts = d.posts.slice(0, 500);
        });
        return json({ ok: true });
      }
      if (a === "comments") {
        limit(`cmt:${ip}`, 20, 10 * 60 * 1000);
        const text = checkText(body.text, 300, admin);
        const name = checkName(body.name, admin);
        const key = str(body.key, 80);
        if (key.length < 8) throw bad("Kunci tidak valid");
        const id = str(body.id, 60) || "c" + Date.now();
        await mutate(F, empty, (d) => {
          const p = d.posts.find((x) => String(x.id) === String(body.post_id));
          if (!p) throw bad("Postingan tidak ditemukan", 404);
          if (p.reps.length >= 300) throw bad("Komentar sudah penuh");
          if (p.reps.some((x) => String(x.id) === id)) throw bad("Duplikat", 409);
          p.reps.push({ id, uid: str(body.uid, 40) || "anon", ukey: key, name, adm: admin, text, t: Date.now(), likes: 0, rp: 0 });
        });
        return json({ ok: true });
      }
      if (a === "like") {
        limit(`like:${ip}`, 60, 60 * 1000);
        const delta = Number(body.delta) > 0 ? 1 : -1;
        await mutate(F, empty, (d) => {
          const it = findItem(d, body.kind, body.id);
          if (it) it.likes = Math.max(0, (it.likes || 0) + delta);
        });
        return json({ ok: true });
      }
      if (a === "report") {
        limit(`rep:${ip}`, 20, 10 * 60 * 1000);
        await mutate(F, empty, (d) => {
          const it = findItem(d, body.kind, body.id);
          if (it) it.rp = (it.rp || 0) + 1;
        });
        return json({ ok: true });
      }
      if (a === "mod") {
        needAdmin(admin);
        await mutate(F, empty, (d) => {
          const p = findItem(d, "post", body.id);
          if (p) {
            p.hid = !!body.hid;
            p.rp = num(body.rp, 9999);
          }
        });
        return json({ ok: true });
      }
      if (a === "delete") {
        const key = str(body.key, 80), id = String(body.id);
        await mutate(F, empty, (d) => {
          if (body.kind === "post") {
            const p = d.posts.find((x) => String(x.id) === id);
            if (!p) return;
            if (!admin && (!key || p.ukey !== key)) throw bad("Bukan postinganmu", 403);
            d.posts = d.posts.filter((x) => x !== p);
            return;
          }
          for (const p of d.posts) {
            const cm = p.reps.find((x) => String(x.id) === id);
            if (!cm) continue;
            if (!admin && (!key || cm.ukey !== key)) throw bad("Bukan komentarmu", 403);
            p.reps = p.reps.filter((x) => x !== cm);
            return;
          }
        });
        return json({ ok: true });
      }
      if (a === "rename") {
        limit(`rn:${ip}`, 10, 3600e3);
        const key = str(body.key, 80);
        if (key.length < 8) throw bad("Kunci tidak valid");
        const name = checkName(body.name, admin);
        await mutate(F, empty, (d) => {
          for (const p of d.posts) {
            if (p.ukey === key) p.name = name;
            for (const cm of p.reps) if (cm.ukey === key) cm.name = name;
          }
        });
        return json({ ok: true });
      }
    }

    throw bad("Tidak ditemukan", 404);
  } catch (e) {
    if (e instanceof HttpError) return json({ error: e.message }, e.status);
    console.error(e);
    return json({ error: "Kesalahan server" }, 500);
  }
};
