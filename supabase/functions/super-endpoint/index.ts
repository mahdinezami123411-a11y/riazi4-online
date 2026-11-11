import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "درخواست نامعتبر است." }, 405);

  try {
    const body = await req.json();
    const rawCode = String(body.student_code ?? "").trim().replace(/\s+/g, "");
    const pass = String(body.password ?? "");
    const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rawCode);
    const isUsername = /^[A-Za-z0-9._-]{4,64}$/.test(rawCode) && !rawCode.includes("..");
    if ((!isEmail && !isUsername) || pass.length < 1 || pass.length > 128) {
      return json({ error: "نام کاربری یا رمز عبور صحیح نیست." }, 400);
    }

    const url = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("APP_SERVICE_ROLE_KEY");
    const anonKey = Deno.env.get("APP_ANON_KEY");
    if (!url || !serviceKey || !anonKey) return json({ error: "تنظیمات سرور کامل نیست." }, 500);

    const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
    let profile: { id: string } | null = null;
    if (isEmail) {
      const email = rawCode.toLowerCase();
      const { data: teachers, error: teacherError } = await admin.from("yare_profiles")
        .select("id").eq("role", "teacher").limit(50);
      if (teacherError || !teachers) return json({ error: "ورود انجام نشد." }, 401);
      for (const t of teachers) {
        const { data: userData, error: userError } = await admin.auth.admin.getUserById(t.id);
        if (!userError && userData.user && String(userData.user.email || "").toLowerCase() === email) {
          profile = { id: t.id };
          break;
        }
      }
    } else {
      const { data: studentProfile, error: profileError } = await admin.from("yare_profiles")
        .select("id").eq("student_code", rawCode).eq("role", "student").maybeSingle();
      if (!profileError && studentProfile) profile = { id: studentProfile.id };
      if (!profile) {
        const { data: legacyProfile, error: legacyError } = await admin.from("profiles")
          .select("id").eq("student_code", rawCode).eq("role", "student").maybeSingle();
        if (!legacyError && legacyProfile) profile = { id: legacyProfile.id };
      }
    }

    if (!profile) return json({ error: "نام کاربری یا رمز عبور صحیح نیست." }, 401);
    const { data: userData, error: userError } = await admin.auth.admin.getUserById(profile.id);
    const email = userData?.user?.email;
    if (userError || !email) return json({ error: "ورود انجام نشد. با معلم خود تماس بگیر." }, 401);

    const authClient = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: sessionData, error: signInError } = await authClient.auth.signInWithPassword({ email, password: pass });
    if (signInError || !sessionData.session) return json({ error: "نام کاربری یا رمز عبور صحیح نیست." }, 401);

    return json({
      access_token: sessionData.session.access_token,
      refresh_token: sessionData.session.refresh_token,
      expires_in: sessionData.session.expires_in,
      token_type: sessionData.session.token_type,
    });
  } catch {
    return json({ error: "درخواست ورود قابل پردازش نیست." }, 400);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" },
  });
}
