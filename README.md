# GomizPlayer PRO IPTV — Desktop (Windows)

[English](#english) | [العربية](#العربية)

📘 **الدليل التقني الشامل:** [TECHNICAL_GUIDE.md](TECHNICAL_GUIDE.md) — يشرح التطبيق كما يُستخدم فعلياً، مع كل الميزات والتفاصيل التقنية والحدود المعروفة.
📘 **Full technical guide:** [TECHNICAL_GUIDE.md](TECHNICAL_GUIDE.md) — what the app really does, internals and known limits.


## GomizPlayer PRO — what's new in 2.0

| Feature | What it does |
|---|---|
| **Library Doctor** | Tests every live channel (HLS / TS / media), shows Working / Dead / Untested, can hide dead channels |
| **Smart failover** | When a live stream fails, silently switches to another source of the *same* channel (up to 3 hops) |
| **Duplicate detection** | Finds the same channel across sources (tvg-id, normalised name, quality tags) and exports a clean playlist |
| **Catch-up** | Reads `catchup*` M3U attributes and Xtream timeshift; past programmes in the TV Guide are playable |
| **Scheduled recordings** | Record a channel at a chosen time (persisted, survives restarts, conflict + early-stop detection) |
| **Parental controls** | Hide adult keywords / categories; changes require the app-lock PIN |
| **Export** | Clean M3U (de-duplicated and/or verified-working only) |

Everything runs locally. Your data folder is unchanged, so upgrading from 1.x keeps sources, favourites and settings.


> **Release-integrity note (2.0.1):** `RELEASE_MANIFEST.yml` in this source archive is a previously signed 1.0.33 manifest and points to the 1.0.33 installer. It is intentionally preserved byte-for-byte because changing signed fields invalidates its Ed25519 signature. The app verifies the signed `latest.yml` attached to the newest published GitHub release; the release workflow generates that manifest from the actual Windows artifacts and requires Authenticode-signed installers.

## English

Gomiz Player IPTV Desktop is the Windows companion application for the Android TV player. It is built with **Electron** and JavaScript and provides a desktop experience for managing IPTV sources.

### Features
- M3U / M3U8 playlist and Xtream Codes source management
- Live TV, movies, series, favorites and search
- Electron-based desktop interface
- Shared classification logic with the Android app

> **Note:** This repository contains the desktop/Windows application only. The Android TV application lives in the separate `GomizPlayer-IPTV-APK` repository.

### About the installer size (~144 MB)
The installer bundles the full Electron/Chromium runtime so the app runs **offline, standalone, with no external dependencies**. The application code itself is small (~1.4 MB of JS); the rest is Chromium. Updates are **differential** (`.blockmap`) so repeated updates download only the changed blocks, and every manifest is **Ed25519-signed** and verified before download. A web-installer was intentionally not used because it would require downloading unsigned payloads at install time.

### Run
```bash
npm install
npm start
```

---


## GomizPlayer PRO — الجديد في 2.0

- **طبيب القنوات:** يختبر كل قناة مباشرة ويُظهر (تعمل / معطّلة / لم تُفحص) مع إمكانية إخفاء المعطّلة.
- **تحويل ذكي:** عند فشل بث مباشر ينتقل تلقائياً إلى مصدر آخر لنفس القناة (حتى 3 محاولات).
- **كشف التكرار:** يجد القناة نفسها عبر المصادر ويصدّر قائمة نظيفة.
- **مشاهدة ما فات (Catch-up):** يدعم سمات `catchup` وXtream timeshift، والبرامج السابقة قابلة للتشغيل من الدليل.
- **التسجيل المجدول:** سجّل قناة في وقت محدد (يبقى بعد إعادة التشغيل).
- **رقابة أبوية:** إخفاء كلمات/تصنيفات؛ التغيير يتطلب PIN قفل التطبيق.
- **تصدير M3U** نظيف (بدون تكرار و/أو القنوات العاملة فقط).

بياناتك لا تتغير عند الترقية من 1.x.

## العربية

**Gomiz Player IPTV — سطح المكتب** هو التطبيق المرافق لنظام Windows لمشغّل Android TV، مبني بـ **Electron** وJavaScript، ويوفّر تجربة سطح مكتب لإدارة مصادر IPTV.

### المميزات
- إدارة قوائم M3U / M3U8 واشتراكات Xtream Codes
- البث المباشر والأفلام والمسلسلات والمفضلة والبحث
- واجهة سطح مكتب مبنية بـ Electron
- منطق تصنيف مشترك مع تطبيق الأندرويد

> **ملاحظة:** يحتوي هذا المستودع على تطبيق سطح المكتب (Windows) فقط. تطبيق Android TV موجود في مستودع منفصل باسم `GomizPlayer-IPTV-APK`.

### حول حجم المُثبّت (~144 ميجابايت)
يضمّ المُثبّت تشغيل Electron/Chromium كاملاً ليعمل التطبيق **دون اتصال وبلا تبعيات خارجية**. كود التطبيق نفسه صغير (~1.4 ميجابايت) والباقي هو Chromium. التحديثات **تفاضلية** (`.blockmap`) فتنزّل الكتل المغيّرة فقط، وكل manifest **موقّع Ed25519** ويُتحقَّق منه قبل التنزيل. لم نستخدم web installer عن قصد لأنه يتطلب تنزيل حمولة غير موقّعة وقت التثبيت.

### التشغيل
```bash
npm install
npm start
```

## Engineering audit status (2026-11-27)

The source repair package includes a second-stage Player/Multiview patch and a focused regression suite (`npm run test:player-engine`). MPEG-TS request headers are now filtered and passed to mpegts.js; M2TS is recognized; Multiview capability checks are exception-safe; and diagnostics identify DASH separately when a DASH engine is present. MPEG-DASH is **not yet bundled**: dash.js is absent from the current dependencies and renderer HTML, so DASH playback must not be advertised as fully supported until the library is integrated and tested.
