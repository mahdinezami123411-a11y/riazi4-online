# Supabase backend

این پوشه قرارداد قابل‌بازسازی بک‌اند «چهارمی‌ها» را نگه می‌دارد:

- `schema.sql` — snapshot پایهٔ schema عمومی (جدول‌ها، enumها، کلیدها، RLS، policyها، grants و توابع SQL) که از پروژهٔ زندهٔ `wcntoueuhgsfkunannpx` در ۱۱ نوامبر ۲۰۲۶ تولید شده است. این فایل ردیف یا secret ندارد.
- `database.types.ts` — تایپ‌های TypeScript تولیدشده از همان schema برای کلاینت و Edge Functions.
- `migrations/` — تغییرهای نسخه‌دار بعد از snapshot پایه. migrationهای قدیمی `202610160001` به بعد فرض می‌کنند جدول‌های پایه از قبل وجود دارند؛ برای محیط خالی ابتدا `schema.sql` را اجرا کنید.
- `functions/` — source کامل همهٔ Edge Functionهای مستقر. توابع حساس (`yare_*` credential/question RPC) فقط با service role اجرا می‌شوند.

## بازسازی محیط خالی

```bash
# 1) یک پروژهٔ Supabase تازه بسازید و auth را فعال کنید.
# 2) snapshot پایه را اجرا کنید (Supabase SQL Editor یا psql).
psql "$SUPABASE_DB_URL" -f supabase/schema.sql

# 3) migrationهای بعد از snapshot را اجرا کنید.
npx supabase link --project-ref <project-ref>
npx supabase db push

# 4) secretهای سمت سرور را در Dashboard > Edge Functions > Secrets تنظیم کنید:
#    APP_SERVICE_ROLE_KEY یا SUPABASE_SERVICE_ROLE_KEY
#    و secret مربوط به Vault با نام yare_student_password_encryption_key
#    (هرگز در Git قرار ندهید).

# 5) توابع را deploy کنید. super-endpoint عمداً verify_jwt=false است؛
#    بقیه verify_jwt=true هستند.
npx supabase functions deploy super-endpoint --no-verify-jwt
npx supabase functions deploy submit-practice-answer
npx supabase functions deploy manage-assignments
npx supabase functions deploy manage-student-accounts
npx supabase functions deploy manage-question-bank
npx supabase functions deploy manage-course-settings
npx supabase functions deploy submit-reminder-answer
npx supabase functions deploy student-presence
```

## قاعدهٔ تغییر

1. DDL جدید را به‌صورت migration نسخه‌دار اضافه کنید؛ `schema.sql` را دستی ویرایش نکنید.
2. source تابع را در `functions/<slug>/index.ts` تغییر دهید و همان نسخه را deploy کنید.
3. قبل از merge، `node tests/quiz-regression.mjs` و در صورت امکان تست‌های Playwright را اجرا کنید.
4. پس از تغییر schema، `supabase/database.types.ts` را دوباره از پروژه تولید و commit کنید.

## نکتهٔ امنیتی

`yare_list_student_credentials` رمزهای ذخیره‌شده را رمزگشایی می‌کند و فقط برای service role مجاز است. هیچ مسیر کلاینتی نباید آن را صدا بزند. وضعیت «رمز تعیین شده» از `yare_list_student_credential_status` خوانده می‌شود که فقط boolean برمی‌گرداند.
