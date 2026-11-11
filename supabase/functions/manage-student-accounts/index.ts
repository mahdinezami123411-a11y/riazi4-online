import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "درخواست نامعتبر است." }, 405);

  try {
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (!token) return json({ error: "ابتدا وارد حساب معلم شو." }, 401);

    const url = Deno.env.get("SUPABASE_URL") || "";
    const serviceKey = Deno.env.get("APP_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    if (!url || !serviceKey) return json({ error: "تنظیمات امن سرور کامل نیست." }, 500);

    const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: authData, error: authError } = await admin.auth.getUser(token);
    if (authError || !authData.user) return json({ error: "نشست ورود معتبر نیست؛ دوباره وارد شو." }, 401);

    const { data: teacher, error: teacherError } = await admin
      .from("yare_profiles")
      .select("id, role, class_id")
      .eq("id", authData.user.id)
      .maybeSingle();

    if (teacherError || !teacher || teacher.role !== "teacher" || !teacher.class_id) {
      return json({ error: "فقط معلمی که به یک کلاس متصل است می‌تواند حساب‌های دانش‌آموزان را مدیریت کند." }, 403);
    }

    const body = await req.json().catch(() => ({}));
    const action = String(body.action || "list");

    if (action === "list") {
      const { data: students, error } = await admin.from("yare_profiles")
        .select("id, display_name, student_code, created_at")
        .eq("role", "student")
        .eq("class_id", teacher.class_id)
        .order("display_name", { ascending: true });
      if (error) return json({ error: "فهرست دانش‌آموزان بارگذاری نشد." }, 500);

      const { data: credentials, error: credentialsError } = await admin.rpc("yare_list_student_credential_status", {
        p_class_id: teacher.class_id,
      });
      if (credentialsError) return json({ error: "وضعیت رمزهای تعیین‌شده بارگذاری نشد." }, 500);
      const statusByStudent = new Map((credentials || []).map((item: { student_id: string; has_password: boolean }) => [item.student_id, item.has_password === true]));
      return json({
        students: (students || []).map((student: { id: string; display_name: string; student_code: string | null; created_at: string }) => ({
          ...student,
          has_initial_password: statusByStudent.get(student.id) === true,
        })),
      });
    }

    if (action === "set_password") {
      const studentId = String(body.student_id || "");
      const password = String(body.password || "");
      if (!studentId) return json({ error: "دانش‌آموز انتخاب‌شده معتبر نیست." }, 400);
      if (password.length < 6 || password.length > 128) return json({ error: "رمز عبور باید حداقل ۶ نویسه داشته باشد." }, 400);

      const { data: student, error: studentError } = await admin.from("yare_profiles")
        .select("id, student_code")
        .eq("id", studentId)
        .eq("role", "student")
        .eq("class_id", teacher.class_id)
        .maybeSingle();
      if (studentError || !student || !student.student_code) return json({ error: "دانش‌آموز در کلاس شما پیدا نشد." }, 404);

      const { error: updateAuthError } = await admin.auth.admin.updateUserById(student.id, { password });
      if (updateAuthError) return json({ error: "تغییر رمز حساب ورود ناموفق بود." }, 500);

      const { error: credentialError } = await admin.rpc("yare_store_student_credential", {
        p_student_id: student.id,
        p_class_id: teacher.class_id,
        p_username: student.student_code,
        p_password: password,
      });
      if (credentialError) return json({ error: "رمز ورود تغییر کرد، اما ذخیرهٔ دفتر رمز ناموفق بود. دوباره یک رمز تعیین کن." }, 500);
      return json({ success: true, student_id: student.id });
    }

    if (action !== "create") return json({ error: "عملیات نامعتبر است." }, 400);

    const displayName = String(body.display_name || "").trim().replace(/\s+/g, " ");
    const username = String(body.username || "").trim().toLowerCase();
    const password = String(body.password || "");
    if (displayName.length < 2 || displayName.length > 80) return json({ error: "نام دانش‌آموز را کامل وارد کن." }, 400);
    if (!/^[a-z0-9][a-z0-9._-]{3,31}$/.test(username) || username.includes("..") || username.endsWith(".")) {
      return json({ error: "نام کاربری باید ۴ تا ۳۲ حرف انگلیسی، عدد یا یکی از . _ - باشد." }, 400);
    }
    if (password.length < 6 || password.length > 128) return json({ error: "رمز عبور باید حداقل ۶ نویسه داشته باشد." }, 400);

    const { data: existingProfile, error: existingError } = await admin.from("yare_profiles")
      .select("id")
      .eq("student_code", username)
      .maybeSingle();
    if (existingError) return json({ error: "بررسی نام کاربری ممکن نشد." }, 500);
    if (existingProfile) return json({ error: "این نام کاربری قبلاً ثبت شده است." }, 409);

    const email = username + "@students.example.com";
    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { display_name: displayName },
    });

    if (createError || !created.user) {
      const msg = String(createError?.message || "");
      if (/already|registered|exists|duplicate/i.test(msg)) return json({ error: "این نام کاربری قبلاً استفاده شده است." }, 409);
      return json({ error: "ساخت حساب ورود ناموفق بود. تنظیمات احراز هویت Supabase را بررسی کن." }, 500);
    }

    const { error: profileError } = await admin.from("yare_profiles").insert({
      id: created.user.id,
      role: "student",
      display_name: displayName,
      nickname: "",
      favorite_skill: "",
      class_id: teacher.class_id,
      student_code: username,
    });

    if (profileError) {
      await admin.auth.admin.deleteUser(created.user.id);
      if (profileError.code === "23505") return json({ error: "این نام کاربری قبلاً ثبت شده است." }, 409);
      return json({ error: "حساب ورود ساخته شد، اما ثبت پروفایل کامل نشد؛ عملیات برگشت داده شد." }, 500);
    }

    const { error: credentialError } = await admin.rpc("yare_store_student_credential", {
      p_student_id: created.user.id,
      p_class_id: teacher.class_id,
      p_username: username,
      p_password: password,
    });
    if (credentialError) {
      await admin.from("yare_profiles").delete().eq("id", created.user.id);
      await admin.auth.admin.deleteUser(created.user.id);
      return json({ error: "دفتر رمز امن ذخیره نشد؛ ساخت حساب برگشت داده شد. دوباره تلاش کن." }, 500);
    }

    return json({
      success: true,
      student: { id: created.user.id, display_name: displayName, student_code: username },
      login_email: email,
    }, 201);
  } catch (error) {
    console.error("manage-student-accounts error", error);
    return json({ error: "درخواست قابل پردازش نیست. اگر مشکل ادامه داشت، تنظیمات سرور را بررسی کن." }, 400);
  }
});
