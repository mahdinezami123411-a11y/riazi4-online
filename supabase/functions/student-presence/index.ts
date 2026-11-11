import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" } });
}

function getJalaliDateParts(date: Date) {
  const parts = new Intl.DateTimeFormat("en-US-u-ca-persian-nu-latn", {
    timeZone: "Asia/Tehran",
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).formatToParts(date);
  const getPart = (type: string) => Number(parts.find((part) => part.type === type)?.value || 0);
  return { year: getPart("year"), month: getPart("month"), day: getPart("day") };
}

function attendanceSchoolStartYear(date: Date) {
  const current = getJalaliDateParts(date);
  return current.month >= 7 ? current.year : current.year - 1;
}

function isAllowedAttendanceMonth(year: number, month: number, schoolStartYear: number) {
  return (month >= 7 && month <= 12 && year === schoolStartYear) ||
    (month >= 1 && month <= 3 && year === schoolStartYear + 1);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "درخواست نامعتبر است." }, 405);

  try {
    const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
    if (!token) return json({ error: "ابتدا وارد حساب شو." }, 401);
    const url = Deno.env.get("SUPABASE_URL") || "";
    const serviceKey = Deno.env.get("APP_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    if (!url || !serviceKey) return json({ error: "تنظیمات امن سرور کامل نیست." }, 500);

    const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: authData, error: authError } = await admin.auth.getUser(token);
    if (authError || !authData.user) return json({ error: "نشست ورود معتبر نیست؛ دوباره وارد شو." }, 401);

    const { data: profile, error: profileError } = await admin.from("yare_profiles")
      .select("id, role, class_id")
      .eq("id", authData.user.id)
      .maybeSingle();
    if (profileError || !profile || !profile.class_id) return json({ error: "پروفایل یا کلاس این حساب پیدا نشد." }, 403);

    const body = await req.json().catch(() => ({}));
    const action = String(body.action || "heartbeat");

    if (action === "heartbeat") {
      if (profile.role !== "student") return json({ error: "ثبت حضور فقط برای حساب دانش‌آموز مجاز است." }, 403);
      const seenAt = new Date();
      const seenAtIso = seenAt.toISOString();
      const jalali = getJalaliDateParts(seenAt);
      const { error } = await admin.from("yare_student_presence").upsert({
        student_id: profile.id,
        class_id: profile.class_id,
        last_seen_at: seenAtIso,
      }, { onConflict: "student_id" });
      if (error) return json({ error: "ثبت آخرین حضور ممکن نشد." }, 500);

      const { error: attendanceError } = await admin.rpc("record_yare_student_attendance_heartbeat", {
        p_student_id: profile.id,
        p_class_id: profile.class_id,
        p_jalali_year: jalali.year,
        p_jalali_month: jalali.month,
        p_jalali_day: jalali.day,
        p_seen_at: seenAtIso,
      });
      if (attendanceError) {
        console.error("student attendance duration update failed", attendanceError);
        return json({ error: "ثبت مدت حضور ممکن نشد." }, 500);
      }
      return json({ success: true, last_seen_at: seenAtIso, jalali_date: jalali });
    }

    if (action === "list") {
      if (profile.role !== "teacher") return json({ error: "فقط معلم می‌تواند فهرست حضور کلاس را ببیند." }, 403);
      const { data: students, error: studentsError } = await admin.from("yare_profiles")
        .select("id, display_name, student_code")
        .eq("role", "student")
        .eq("class_id", profile.class_id)
        .order("display_name", { ascending: true });
      if (studentsError) return json({ error: "فهرست دانش‌آموزان بارگذاری نشد." }, 500);
      const { data: presences, error: presenceError } = await admin.from("yare_student_presence")
        .select("student_id, last_seen_at")
        .eq("class_id", profile.class_id);
      if (presenceError) return json({ error: "اطلاعات حضور بارگذاری نشد." }, 500);
      const seenByStudent = new Map((presences || []).map((item: { student_id: string; last_seen_at: string }) => [item.student_id, item.last_seen_at]));
      const result = (students || []).map((student: { id: string; display_name: string; student_code: string | null }) => ({
        id: student.id,
        display_name: student.display_name,
        student_code: student.student_code,
        last_seen_at: seenByStudent.get(student.id) || null,
      }));
      return json({ students: result });
    }

    if (action === "attendance_month") {
      if (profile.role !== "teacher") return json({ error: "فقط معلم می‌تواند گزارش حضور کلاس را ببیند." }, 403);
      const jalaliYear = Number(body.jalali_year);
      const jalaliMonth = Number(body.jalali_month);
      const schoolStartYear = attendanceSchoolStartYear(new Date());
      if (!Number.isInteger(jalaliYear) || !Number.isInteger(jalaliMonth) ||
          !isAllowedAttendanceMonth(jalaliYear, jalaliMonth, schoolStartYear)) {
        return json({ error: "ماه انتخاب‌شده در بازهٔ مهر تا خرداد سال تحصیلی جاری نیست." }, 400);
      }

      const [studentsResult, attendanceResult] = await Promise.all([
        admin.from("yare_profiles")
          .select("id, display_name, student_code")
          .eq("role", "student")
          .eq("class_id", profile.class_id)
          .order("display_name", { ascending: true }),
        admin.from("yare_student_attendance_days")
          .select("student_id, jalali_day, first_seen_at, last_seen_at, active_seconds")
          .eq("class_id", profile.class_id)
          .eq("jalali_year", jalaliYear)
          .eq("jalali_month", jalaliMonth)
          .order("jalali_day", { ascending: true }),
      ]);
      if (studentsResult.error) return json({ error: "فهرست دانش‌آموزان بارگذاری نشد." }, 500);
      if (attendanceResult.error) {
        console.error("student attendance month query failed", attendanceResult.error);
        return json({ error: "گزارش ماهانهٔ حضور بارگذاری نشد." }, 500);
      }
      return json({
        jalali_year: jalaliYear,
        jalali_month: jalaliMonth,
        students: studentsResult.data || [],
        attendance: attendanceResult.data || [],
      });
    }

    return json({ error: "عملیات نامعتبر است." }, 400);
  } catch (error) {
    console.error("student-presence error", error);
    return json({ error: "درخواست حضور قابل پردازش نیست." }, 400);
  }
});
