import { createClient } from "npm:@supabase/supabase-js@2";
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info, prefer",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json; charset=utf-8"
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: corsHeaders });
const url = Deno.env.get("SUPABASE_URL")!;
const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const subjects = new Set(["math", "persian", "dictation", "science", "social", "gifts"]);
const validDate = (value: unknown): string | null => {
  if (value === null || value === undefined || value === "") return null;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};
function sanitizeSettings(input: unknown, existing: Record<string, any> = {}) {
  const raw = input && typeof input === "object" && !Array.isArray(input) ? input as Record<string, any> : {};
  const out: Record<string, any> = { ...existing };
  if ("courseEnabled" in raw) out.courseEnabled = raw.courseEnabled === true;
  if ("defaultLocked" in raw) out.defaultLocked = raw.defaultLocked === true;
  if ("releaseMode" in raw) out.releaseMode = raw.releaseMode === "scheduled" ? "scheduled" : "manual";
  if ("courseTitle" in raw) out.courseTitle = String(raw.courseTitle ?? "").trim().slice(0, 160);
  if ("maxAttempts" in raw) out.maxAttempts = Math.max(1, Math.min(100, Math.floor(Number(raw.maxAttempts) || 1)));
  if ("feedbackMode" in raw) out.feedbackMode = ["immediate", "after-submit", "hidden"].includes(raw.feedbackMode) ? raw.feedbackMode : "immediate";
  if ("allowPractice" in raw) out.allowPractice = raw.allowPractice !== false;
  if ("allowExam" in raw) out.allowExam = raw.allowExam !== false;
  if ("defaultRandomQuestions" in raw) out.defaultRandomQuestions = raw.defaultRandomQuestions !== false;
  if ("defaultRandomOptions" in raw) out.defaultRandomOptions = raw.defaultRandomOptions !== false;
  if ("defaultHideScores" in raw) out.defaultHideScores = raw.defaultHideScores !== false;
  if ("defaultFeedback" in raw) out.defaultFeedback = raw.defaultFeedback !== false;
  if ("showCorrectAnswers" in raw) out.showCorrectAnswers = raw.showCorrectAnswers !== false;
  if ("allowReview" in raw) out.allowReview = raw.allowReview !== false;
  if ("showProgress" in raw) out.showProgress = raw.showProgress !== false;
  if ("allowRetryPractice" in raw) out.allowRetryPractice = raw.allowRetryPractice !== false;
  if ("releaseAt" in raw) out.releaseAt = validDate(raw.releaseAt);
  if ("bookFilePath" in raw) out.bookFilePath = String(raw.bookFilePath ?? "").slice(0, 500);
  if ("bookFileName" in raw) out.bookFileName = String(raw.bookFileName ?? "").slice(0, 180);
  if (Array.isArray(raw.customLessons)) {
    if (raw.customLessons.length > 100) throw new Error("حداکثر ۱۰۰ درس سفارشی برای هر کتاب مجاز است.");
    const seenCustom = new Set<number>();
    out.customLessons = raw.customLessons.map((item: any) => {
      const id = Number(item?.id);
      const title = String(item?.title ?? "").trim().slice(0, 160);
      if (!Number.isInteger(id) || id < 1 || id > 100 || seenCustom.has(id) || !title) throw new Error("شماره یا عنوان درس سفارشی معتبر نیست یا تکراری است.");
      seenCustom.add(id);
      return { id, title, page: String(item?.page ?? "").trim().slice(0, 40) };
    }).sort((a: any, b: any) => a.id - b.id);
  }
  if (Array.isArray(raw.lessons)) {
    if (raw.lessons.length > 100) throw new Error("حداکثر ۱۰۰ درس برای هر کتاب مجاز است.");
    const seen = new Set<number>();
    out.lessons = raw.lessons.map((item: any, index: number) => {
      const id = Number(item?.id);
      if (!Number.isInteger(id) || id < 1 || id > 100 || seen.has(id)) throw new Error("شماره درس نامعتبر یا تکراری است.");
      seen.add(id);
      const availableFrom = item.availableFrom ? validDate(item.availableFrom) : null;
      const availableUntil = item.availableUntil ? validDate(item.availableUntil) : null;
      if ((item.availableFrom && !availableFrom) || (item.availableUntil && !availableUntil)) throw new Error("تاریخ بازشدن یا بسته‌شدن یک درس معتبر نیست.");
      if (availableFrom && availableUntil && Date.parse(availableUntil) < Date.parse(availableFrom)) throw new Error("زمان بسته‌شدن نمی‌تواند قبل از زمان بازشدن باشد.");
      return {
        id,
        title: String(item.title ?? ("درس " + id)).trim().slice(0, 160),
        isUnlocked: item.isUnlocked === true,
        availableFrom,
        availableUntil,
        sortOrder: Math.max(1, Math.min(100, Math.floor(Number(item.sortOrder) || index + 1)))
      };
    }).sort((a: any, b: any) => a.sortOrder - b.sortOrder);
  }
  return out;
}
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  const auth = req.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) return json({ error: "نشست ورود معتبر نیست." }, 401);
  try {
    const userClient = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false }, global: { headers: { Authorization: auth } } });
    const { data: authData, error: authError } = await userClient.auth.getUser();
    const user = authData?.user;
    if (authError || !user) return json({ error: "نشست کاربر تأیید نشد." }, 401);
    const { data: profile, error: profileError } = await admin.from("yare_profiles").select("role,class_id").eq("id", user.id).maybeSingle();
    if (profileError || !profile?.class_id || !["teacher", "student"].includes(profile.role)) return json({ error: "حساب کاربری به کلاس متصل نیست." }, 403);
    const body = await req.json();
    const action = String(body.action ?? "");
    if (action === "list") {
      const { data, error } = await admin.from("yare_course_settings").select("subject,settings,updated_at").eq("class_id", profile.class_id);
      if (error) return json({ error: "تنظیمات کتاب‌ها خوانده نشد." }, 500);
      const settings: Record<string, any> = {};
      for (const row of data ?? []) settings[row.subject] = row.settings ?? {};
      return json({ class_id: profile.class_id, settings });
    }
    if (profile.role !== "teacher") return json({ error: "فقط معلم می‌تواند تنظیمات کتاب‌ها را تغییر دهد." }, 403);
    const subject = String(body.subject ?? "");
    if (!subjects.has(subject)) return json({ error: "شناسهٔ کتاب معتبر نیست." }, 400);
    const { data: previous } = await admin.from("yare_course_settings").select("settings").eq("class_id", profile.class_id).eq("subject", subject).maybeSingle();
    const existing = previous?.settings && typeof previous.settings === "object" ? previous.settings : {};
    if (action === "save") {
      const incoming = sanitizeSettings(body.settings, existing);
      const { data, error } = await admin.from("yare_course_settings").upsert({
        class_id: profile.class_id, subject, settings: incoming, updated_by: user.id, updated_at: new Date().toISOString()
      }, { onConflict: "class_id,subject" }).select("subject,settings,updated_at").single();
      if (error || !data) { console.error("course settings save failed", error); return json({ error: "ذخیرهٔ تنظیمات کتاب ناموفق بود." }, 500); }
      return json({ ok: true, setting: data });
    }
    if (action === "set_book_file") {
      const path = String(body.file_path ?? "");
      const prefix = String(profile.class_id) + "/books/" + subject + "/";
      if (!path.startsWith(prefix) || path.includes("..") || path.length > 500) return json({ error: "مسیر فایل کتاب معتبر نیست." }, 400);
      const name = String(body.file_name ?? "book.pdf").slice(0, 180);
      const incoming = { ...existing, bookFilePath: path, bookFileName: name, bookUploadedAt: new Date().toISOString() };
      const { error } = await admin.from("yare_course_settings").upsert({
        class_id: profile.class_id, subject, settings: incoming, updated_by: user.id, updated_at: new Date().toISOString()
      }, { onConflict: "class_id,subject" });
      if (error) return json({ error: "ثبت مسیر فایل کتاب ناموفق بود." }, 500);
      return json({ ok: true, subject, bookFilePath: path, bookFileName: name });
    }
    if (action === "clear_book_file") {
      const incoming = { ...existing, bookFilePath: null, bookFileName: null, bookUploadedAt: null };
      const { error } = await admin.from("yare_course_settings").upsert({
        class_id: profile.class_id, subject, settings: incoming, updated_by: user.id, updated_at: new Date().toISOString()
      }, { onConflict: "class_id,subject" });
      if (error) return json({ error: "حذف ارجاع فایل کتاب ناموفق بود." }, 500);
      return json({ ok: true, subject });
    }
    return json({ error: "action نامعتبر است." }, 400);
  } catch (error) {
    console.error("manage-course-settings failed", error);
    return json({ error: error instanceof Error ? error.message : "خطای تنظیمات کتاب." }, 400);
  }
});