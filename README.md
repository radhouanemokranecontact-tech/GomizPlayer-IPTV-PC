# GomizPlayer PRO IPTV — Desktop (Windows)

[English](#english) | [العربية](#العربية)

📘 **الدليل التقني الشامل:** [TECHNICAL_GUIDE.md](TECHNICAL_GUIDE.md) — المميزات الكاملة، الاختبارات، الإحصائيات، الحدود المعروفة والخطط.
📘 **Full technical guide:** [TECHNICAL_GUIDE.md](TECHNICAL_GUIDE.md) — features, verification, statistics, limits and roadmap.

## English

**GomizPlayer PRO IPTV** is the Windows desktop companion for the Android TV player, built with **Electron**. Current release: **v1.0.38**.

### Features
- M3U / M3U8 playlist and Xtream Codes source management, with encrypted credentials
- Live TV, movies, series, favorites, search and TV Guide (EPG with now/next)
- Full player: HLS, MPEG-TS, DASH, subtitles, screenshot, recording, timer, mini-player
- **PRO Tools:** channel health scan (Library Doctor), auto-failover, dedupe, scheduled recordings, parental controls, catch-up and M3U export
- 6 themes, EN/AR localization, backups, signed differential updates
- **14/14 automated test suites pass**; built app verified via CDP with 0 JS errors

> **Note:** This repository contains the desktop/Windows application only. The Android TV application lives in the separate `GomizPlayer-IPTV-APK` repository.

### About the installer size (~144 MB)
The installer bundles the full Electron/Chromium runtime so the app runs **offline, standalone, with no external dependencies**. Updates are **differential** (`.blockmap`) so repeated updates download only the changed blocks, and every manifest is **Ed25519-signed** and verified before download. A web-installer was intentionally not used because it would require downloading unsigned payloads at install time.

### Run
```bash
npm install
npm start
```

### Latest release
https://github.com/radhouanemokranecontact-tech/GomizPlayer-IPTV-PC/releases/tag/v1.0.38

---

## العربية

**GomizPlayer PRO IPTV** هو التطبيق المرافق لنظام Windows لمشغّل Android TV، مبني بـ **Electron**. الإصدار الحالي: **v1.0.38**.

### المميزات
- إدارة قوائم M3U / M3U8 واشتراكات Xtream Codes مع كلمات مرور مُشفّرة
- البث المباشر، الأفلام، المسلسلات، المفضلة، البحث، ودليل البرامج (الآن/التالي)
- مشغّل كامل: HLS، MPEG-TS، DASH، ترجمة، لقطة شاشة، تسجيل، مؤقت، mini-player
- **أدوات PRO:** فحص صحة القنوات، تحويل تلقائي، إزالة تكرار، جدولة تسجيل، رقابة أبوية، مشاهدة ما فات، تصدير M3U
- 6 ثيمات، عربية/إنجليزية، نسخ احتياطي، تحديثات تفاضلية موقّعة
- **14/14 مجموعة اختبار تنجح** + تحقق واقعي بـ CDP بصفر أخطاء

> **ملاحظة:** يحتوي هذا المستودع على تطبيق سطح المكتب (Windows) فقط. تطبيق Android TV في مستودع منفصل `GomizPlayer-IPTV-APK`.

### حول حجم المُثبّت (~144 ميجابايت)
يضمّ المُثبّت تشغيل Electron/Chromium كاملاً ليعمل التطبيق **دون اتصال وبلا تبعيات خارجية**. التحديثات **تفاضلية** (`.blockmap`) وكل manifest **موقّع Ed25519**. لم نستخدم web-installer لأنه يتطلب تنزيل محتوى غير موقّع وقت التثبيت.

### أحدث إصدار
https://github.com/radhouanemokranecontact-tech/GomizPlayer-IPTV-PC/releases/tag/v1.0.38
