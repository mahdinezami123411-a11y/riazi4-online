# riazi4-online

آموزش آنلاین ریاضی چهارم ابتدایی — PWA «چهارمی‌ها»

## اجرا

یک سرور استاتیک در ریشهٔ پروژه اجرا کنید (مثلاً `python3 -m http.server 8765`) و `index.html` را باز کنید. برای قابلیت PWA و سرویس‌ورکر، مرورگر باید از `http://localhost` یا HTTPS استفاده کند.

## آزمون‌ها

```bash
node tests/quiz-regression.mjs
node --check offline.js
node --check sw.js
```

تست‌های مرورگری با Playwright در `.github/workflows/question-regression.yml` اجرا می‌شوند و شامل کنترل واقعی سرویس‌ورکر، بارگذاری آفلاین، گالری و رگرسیون بانک سؤال هستند.

## بک‌اند

source توابع Edge، migrationها، snapshot پایهٔ schema و تایپ‌های دیتابیس در `supabase/` قرار دارند. راهنمای بازسازی و deploy در [`supabase/README.md`](supabase/README.md) آمده است.
