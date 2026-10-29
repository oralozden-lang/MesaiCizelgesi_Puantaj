import { createClient } from 'npm:@supabase/supabase-js@2';

const DOMAIN = 'puantaj-merkezi.app';
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};

const emailOf = (kullaniciAdi: string) =>
  `${kullaniciAdi.trim().toLowerCase()}@${DOMAIN}`;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: CORS });

Deno.serve(async (req) => {
  const rid = crypto.randomUUID();
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Yöntem desteklenmiyor' }, 405);

  const url = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  const profiles = 'app_8524c8f4f5_profiles';
  const userBranches = 'app_8524c8f4f5_user_branches';

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Geçersiz istek gövdesi' }, 400);
  }
  const action = String(body.action ?? '');
  console.log(JSON.stringify({ rid, action }));

  async function callerProfile() {
    const auth = req.headers.get('Authorization') ?? '';
    const token = auth.replace('Bearer ', '').trim();
    if (!token) return null;
    const { data, error } = await admin.auth.getUser(token);
    if (error || !data?.user) return null;
    const { data: p } = await admin
      .from(profiles)
      .select('id, rol, aktif, ad_soyad')
      .eq('id', data.user.id)
      .maybeSingle();
    if (!p || !p.aktif) return null;
    return p as { id: string; rol: string; aktif: boolean; ad_soyad: string };
  }

  try {
    if (action === 'durum') {
      const { count, error } = await admin
        .from(profiles)
        .select('id', { count: 'exact', head: true });
      if (error) throw error;
      return json({ kurulum_gerekli: (count ?? 0) === 0 });
    }

    if (action === 'bootstrap') {
      const { count, error } = await admin
        .from(profiles)
        .select('id', { count: 'exact', head: true });
      if (error) throw error;
      if ((count ?? 0) > 0) return json({ error: 'Kurulum daha önce tamamlanmış' }, 409);

      const kullaniciAdi = String(body.kullanici_adi ?? '').trim().toLowerCase();
      const adSoyad = String(body.ad_soyad ?? '').trim();
      const sifre = String(body.sifre ?? '');
      if (!/^[a-z0-9._-]{3,32}$/.test(kullaniciAdi)) return json({ error: 'Kullanıcı adı 3-32 karakter olmalı (harf, rakam, . _ -)' }, 400);
      if (adSoyad.length < 3) return json({ error: 'Ad soyad gerekli' }, 400);
      if (sifre.length < 6) return json({ error: 'Şifre en az 6 karakter olmalı' }, 400);

      const email = emailOf(kullaniciAdi);
      let userId: string | null = null;

      const { data: created, error: cErr } = await admin.auth.admin.createUser({
        email,
        password: sifre,
        email_confirm: true,
      });

      if (cErr || !created?.user) {
        // Önceki yarım kalmış denemeden kalan hesap varsa onar, yoksa hata döndür.
        const mesaj = (cErr?.message ?? '').toLowerCase();
        const zatenVar = mesaj.includes('already') || mesaj.includes('registered') || mesaj.includes('exists');
        if (!zatenVar) return json({ error: 'Hesap oluşturulamadı. Lütfen tekrar deneyin.' }, 500);

        const { data: liste } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
        const mevcut = liste?.users?.find((u) => u.email?.toLowerCase() === email);
        if (!mevcut) return json({ error: 'Bu kullanıcı adı başka bir hesaba ait.' }, 409);

        const { data: sahipVar } = await admin
          .from(profiles)
          .select('id')
          .eq('id', mevcut.id)
          .maybeSingle();
        if (sahipVar) return json({ error: 'Kurulum daha önce tamamlanmış' }, 409);

        const { error: updErr } = await admin.auth.admin.updateUserById(mevcut.id, {
          password: sifre,
          email_confirm: true,
        });
        if (updErr) return json({ error: 'Önceki deneme temizlenemedi. Farklı bir kullanıcı adı deneyin.' }, 500);
        userId = mevcut.id;
      } else {
        userId = created.user.id;
      }

      const { error: pErr } = await admin.from(profiles).insert({
        id: userId,
        kullanici_adi: kullaniciAdi,
        ad_soyad: adSoyad,
        rol: 'isveren',
        aktif: true,
        sifre_degistirmeli: false,
      });
      if (pErr) {
        console.error(JSON.stringify({ rid, step: 'profil', err: pErr.message }));
        return json({ error: 'Profil kaydı oluşturulamadı.' }, 500);
      }
      return json({ ok: true, kullanici_adi: kullaniciAdi });
    }

    const caller = await callerProfile();
    if (!caller) return json({ error: 'Yetkisiz' }, 401);
    if (caller.rol !== 'isveren') return json({ error: 'Bu işlem için işveren yetkisi gerekli' }, 403);

    if (action === 'create') {
      const kullaniciAdi = String(body.kullanici_adi ?? '').trim().toLowerCase();
      const adSoyad = String(body.ad_soyad ?? '').trim();
      const rol = String(body.rol ?? '');
      const sifre = String(body.sifre ?? '');
      const branchIds = Array.isArray(body.branch_ids) ? (body.branch_ids as string[]) : [];
      if (!/^[a-z0-9._-]{3,32}$/.test(kullaniciAdi)) return json({ error: 'Kullanıcı adı 3-32 karakter olmalı (harf, rakam, . _ -)' }, 400);
      if (adSoyad.length < 3) return json({ error: 'Ad soyad gerekli' }, 400);
      if (!['isveren', 'bolge', 'sube'].includes(rol)) return json({ error: 'Geçersiz rol' }, 400);
      if (sifre.length < 6) return json({ error: 'Geçici şifre en az 6 karakter olmalı' }, 400);

      const { data: created, error: cErr } = await admin.auth.admin.createUser({
        email: emailOf(kullaniciAdi),
        password: sifre,
        email_confirm: true,
      });
      if (cErr || !created?.user) {
        return json({ error: cErr?.message?.includes('already') ? 'Bu kullanıcı adı zaten kayıtlı' : (cErr?.message ?? 'Kullanıcı oluşturulamadı') }, 400);
      }
      await admin.from(profiles).insert({
        id: created.user.id,
        kullanici_adi: kullaniciAdi,
        ad_soyad: adSoyad,
        rol,
        aktif: true,
        sifre_degistirmeli: true,
      });
      if (branchIds.length && rol !== 'isveren') {
        await admin.from(userBranches).insert(branchIds.map((b) => ({ user_id: created.user.id, branch_id: b })));
      }
      return json({ ok: true, id: created.user.id });
    }

    if (action === 'reset') {
      const userId = String(body.user_id ?? '');
      const sifre = String(body.sifre ?? '');
      if (!userId) return json({ error: 'Kullanıcı seçilmedi' }, 400);
      if (sifre.length < 6) return json({ error: 'Geçici şifre en az 6 karakter olmalı' }, 400);
      const { error } = await admin.auth.admin.updateUserById(userId, { password: sifre });
      if (error) throw error;
      await admin.from(profiles).update({ sifre_degistirmeli: true }).eq('id', userId);
      return json({ ok: true });
    }

    if (action === 'sil') {
      const userId = String(body.user_id ?? '');
      if (!userId) return json({ error: 'Kullanıcı seçilmedi' }, 400);
      if (userId === caller.id) return json({ error: 'Kendi hesabınızı silemezsiniz' }, 400);
      const { count } = await admin.from(profiles).select('id', { count: 'exact', head: true }).eq('rol', 'isveren').eq('aktif', true);
      const { data: target } = await admin.from(profiles).select('rol').eq('id', userId).maybeSingle();
      if (target?.rol === 'isveren' && (count ?? 0) <= 1) return json({ error: 'Son işveren hesabı silinemez' }, 400);
      await admin.from(profiles).delete().eq('id', userId);
      const { error } = await admin.auth.admin.deleteUser(userId);
      if (error) throw error;
      return json({ ok: true });
    }

    return json({ error: 'Bilinmeyen işlem' }, 400);
  } catch (err) {
    console.error(JSON.stringify({ rid, err: String(err) }));
    return json({ error: 'İşlem tamamlanamadı' }, 500);
  }
});
