import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json; charset=utf-8",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: cors });

const url = Deno.env.get("SUPABASE_URL")!;
const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const admin = createClient(url, service, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const fa = (v: number) => Number(v).toLocaleString("fa-IR");
const normalize = (v: unknown) =>
  String(v ?? "")
    .normalize("NFKC")
    .replace(/[۰-۹]/g, d => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)))
    .replace(/[٠-٩]/g, d => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
    .replace(/[٫]/g, ".")
    .replace(/[٬،,\s]/g, "")
    .toLowerCase();

function explanation(kind: string, a: number, b: number, answer: number): string {
  if (kind === "divide") {
    return `${fa(a)} ÷ ${fa(b)} = ${fa(answer)}؛ چون ${fa(answer)} × ${fa(b)} = ${fa(a)}. پس حاصل تقسیم ${fa(answer)} است.`;
  }
  if (kind === "multiply" || kind === "concept") {
    const repeated = Array.from({ length: b }, () => fa(a)).join(" + ");
    return kind === "concept"
      ? `${fa(a)} گروهِ ${fa(b)}تایی داریم؛ یعنی ${fa(b)} گروه که در هرکدام ${fa(a)} تاست. پس ${fa(a)} × ${fa(b)} = ${fa(answer)}.`
      : `ضرب یعنی جمع تکراری: ${fa(a)} را ${fa(b)} بار جمع می‌کنیم: ${repeated} = ${fa(answer)}.`;
  }
  // Show carrying column by column for 2–4 digit additions.
  const names = ["یکان", "دهگان", "صدگان", "هزارگان", "ده‌هزارگان", "صد‌هزارگان"];
  const steps: string[] = [];
  let carry = 0;
  let place = 1;
  let idx = 0;
  while (place <= a || place <= b || carry > 0) {
    const da = Math.floor(a / place) % 10;
    const db = Math.floor(b / place) % 10;
    const total = da + db + carry;
    const digit = total % 10;
    const nextCarry = Math.floor(total / 10);
    const col = names[idx] ?? "ستون بعدی";
    let sentence = `${col}: ${fa(da)} + ${fa(db)}${carry ? ` + ${fa(carry)} (انتقالی)` : ""} = ${fa(total)}`;
    if (nextCarry > 0) sentence += `؛ ${fa(digit)} را می‌نویسیم و ${fa(nextCarry)} را به ستون بعد می‌بریم`;
    else sentence += `؛ ${fa(digit)} را می‌نویسیم`;
    steps.push(sentence);
    carry = nextCarry;
    place *= 10;
    idx++;
  }
  return `${steps.join("؛ ")}. بنابراین ${fa(a)} + ${fa(b)} = ${fa(answer)}.`;
}

Deno.serve(async req => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const auth = req.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) {
    return json({ error: "برای ثبت تمرین باید وارد حساب دانش‌آموز شوی." }, 401);
  }
  try {
    const client = createClient(url, anon, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: auth } },
    });
    const { data: u, error: ue } = await client.auth.getUser();
    if (ue || !u.user) return json({ error: "نشست ورود معتبر نیست." }, 401);

    const { data: p, error: pe } = await admin
      .from("yare_profiles")
      .select("role,class_id")
      .eq("id", u.user.id)
      .maybeSingle();
    if (pe || !p || !(p.role === "student" || p.role === "teacher") || !p.class_id) {
      return json({ error: "این حساب به کلاس اختصاص داده نشده است." }, 403);
    }

    const b = await req.json();
    const kind = String(b.kind ?? "");
    const a = Number(b.a);
    const n = Number(b.b);
    if (!["multiply", "divide", "concept", "addition"].includes(kind) ||
        !Number.isSafeInteger(a) || !Number.isSafeInteger(n) ||
        a < 1 || n < 1 || a > 9999 || n > 9999) {
      return json({ error: "صورت سؤال نامعتبر است." }, 400);
    }
    if (["multiply", "concept"].includes(kind) && (a > 10 || n > 10)) {
      return json({ error: "محدوده تمرین ضرب نامعتبر است." }, 400);
    }
    if (kind === "divide" && (a % n !== 0 || a / n > 10 || n > 10)) {
      return json({ error: "تقسیم باید دقیق و در محدوده جدول ضرب باشد." }, 400);
    }
    if (kind === "addition" && (a < 10 || n < 10 || a > 9999 || n > 9999)) {
      return json({ error: "اعداد جمع خارج از محدوده‌اند." }, 400);
    }

    const submitted = String(b.submitted_answer ?? "").slice(0, 100);
    if (!submitted.trim()) return json({ error: "پاسخت را وارد کن." }, 400);

    const answer = kind === "divide" ? a / n : kind === "addition" ? a + n : a * n;
    const correct = normalize(submitted) === String(answer);
    const questionText = String(b.question_text ?? "").slice(0, 500) ||
      ({ multiply: `${a} × ${n} = ؟`, divide: `${a} ÷ ${n} = ؟`,
        concept: `${a} گروهِ ${n}تایی چندتا می‌شود؟`, addition: `${a} + ${n} = ؟` } as Record<string, string>)[kind];

    const { data: attempt, error: ie } = await admin
      .from("yare_practice_attempts")
      .insert({
        student_id: u.user.id,
        class_id: p.class_id,
        question_id: null,
        source: "reminder:" + kind,
        chapter_id: 0,
        question_text: questionText,
        question_type: "input",
        submitted_answer: submitted,
        is_correct: correct,
        scoring_source: "server",
      })
      .select("id,created_at")
      .single();

    if (ie) {
      console.error(ie);
      return json({ error: "ثبت نتیجه در سرور انجام نشد." }, 500);
    }
    return json({
      correct,
      correct_answer: answer,
      explanation: explanation(kind, a, n, answer),
      attempt_id: attempt.id,
      created_at: attempt.created_at,
    });
  } catch (e) {
    console.error(e);
    return json({ error: "خطای غیرمنتظره در بررسی تمرین." }, 400);
  }
});
