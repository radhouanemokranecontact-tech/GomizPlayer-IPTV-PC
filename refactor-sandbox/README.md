# Gomiz Player IPTV — Desktop (Windows)

[English](#english) | [العربية](#العربية)

📘 **الدليل التقني الشامل:** [TECHNICAL_GUIDE.md](TECHNICAL_GUIDE.md) — يشرح التطبيق كما يُستخدم فعلياً، مع كل الميزات والتفاصيل التقنية والحدود المعروفة.
📘 **Full technical guide:** [TECHNICAL_GUIDE.md](TECHNICAL_GUIDE.md) — what the app really does, internals and known limits.

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
