# Gomiz Player IPTV — الدليل التقني الشامل (Windows)

[English](#english) | [العربية](#العربية)

> مبني على فحص الكود الفعلي للنسخة **1.0.14** — ما هو مكتوب مُنجز ومُختبَر، وما ليس مذكوراً غير موجود.

## العربية

### 1) ما هو هذا التطبيق؟
تطبيق سطح مكتب Windows مبني بـ **Electron** + JavaScript، يعمل كمرافق لتطبيق الأندرويد. يوفّر تشغيل IPTV/VOD وإدارة المصادر على الكمبيوتر، بواجهة عربية/إنجليزية (EN/AR فقط — FR أُزيل لأنه غير مكتمل). الإصدار الحالي: **1.0.14**.

### 2) ماذا يفعل بالضبط؟ (من تجربة الاستخدام)

**القائمة الجانبية:** Home · Live TV · Movies · Series · My List TV · My Movies & Series · Downloads · Recordings · Sources · Settings + بحث علوي + زر «Add source» + «TV Guide».

**الرئيسية (Home):**
- ثلاثة مربعات widgets **بخلفيات ديناميكية** (كل مربع مستقل):
  - ساعة تناظرية عقاربها تتحرك + خلفية+Fجر/نهار/غروب/ليل.
  - طقس برسومات SVG واقعية (شمس بأشعة، قمر بفوهات ونجوم، غيوم، مطر، ثلج، برق) + خلفية تتبدل مع الحالة.
  - أوقات صلاة بعدّ تنازلي + خلفية ذهبية عند بقاء <30 دقيقة.
  - **كل مربع فيه زر تحديث** يُعيد تحديد الموقع ويُحدّث البيانات فوراً.
- أقسام قابلة للترتيب: بطل، أكمل المشاهدة، المفضلة، مباشر, أُضيف حديثاً، مجموعات — مع كثافة (compact/comfortable/large) وعدد عناصر قابل للضبط.

**المشغّل (Player):**
- تشغيل HLS (hls.js) وMPEG-TS (mpegts.js) وDASH، مع لوحة تحكم كاملة: play/pause، seek،全面提升 سرعة، جودة، صوت، ترجمة، نسبة أبعاد، ملء شاشة، كتم، لقطة شاشة، مؤقت نوم، A-B loop، mini-player، دائماً في المقدمة، إحصاءات.
- **درج القنوات** بمجموعات/بحث/مفضلة♥ + NOW/NEXT.
- عند فشل بث: نافذة error مع Retry / القناة التالية / **Close → يرجع لقائمة القنوات** (لا للرئيسية).

**الدليل (EPG):** جدول برامج مع «الآن/التالي» وتنقّل.

**المصادر:** M3U/M3U8 · Xtream Codes · رابط مفرد، مع رؤوس HTTP وبيانات دخول مُشفّرة (`secrets.js` عبر Electron `safeStorage`).

**الإعدادات (تبويبات):** General · Player · Subtitles · TV Guide · Storage · System · About + SourcesPanel/Profile
- اللغة EN/AR · الثيم · اللون · التخطيط · الشبكة/الوكيل · الترجمة · قفل التطبيق (Pin) · الخصوصية/القياس (موافقة صريحة) · النسخ الاحتياطي · التحديثات.
- تصدير/استيراد نسخة JSON + «Back up now» + «View recent errors».

**التحديثات:** فحص عند الإقلاع + نافذة تلقائية عند وجود إصدار + نسبة تنزيل مباشرة + زر تثبيت. **التحديث تفاضلي** (blockmap) و**manifest موقّع Ed25519** يُتحقَّق منه قبل التنزيل. تراجع آمن: نسخة بيانات قبل التثبيت + كشف تعطّل متكرر + حالة في About.

### 3) التفاصيل التقنية (للمطوّرين/الوكلاء)

| العنصر | الحقيقة في الكود |
|---|---|
| الإصدار | 1.0.14 |
| إطار العمل | Electron + JS · `electron-builder` 26 · `electron-updater` 6.8.11 |
| محرك الفيديو | hls.js + mpegts.js + DASH داخل الرندرر |
| التخزين | `gomizplayer.json` في `userData` + نسخ في `userData/backups` (3 دوّارة) |
| الأسرار | `safeStorage` + تشفير في `secrets.js` |
| IPC | **67 handler** (مصادر، مكتبة، تنزيلات، تسجيل، EPG، ملفات，إعدادات，نوافذ，تحديث，نسخ，تشخيص) |
| i18n | 482 مفتاح EN وAR متطابقان · RTL كامل |
| الأمان | CSP صارم · `assertTrustedSender` على كل IPC · توقيع manifest |
| التشخيص | `userData/logs/app.log` (دوّار 2MB) + عارض أخطاء محلي + تصدير شامل |
| البناء | `npm run dist` → NSIS + portable + blockmap + latest.yml (موقّع) |
| الاختبارات | **7 suites** في CI — كلها ناجحة |
| التنظيم | `postdist` يرتب المخرجات في مجلدات `dist/vX.Y.Z/` |

### 4) حدود معروفة (صدقاً)
- لا Catch-up كامل / Multiview / Stalker / Chromecast/DLNA (مؤجّلة — `ROADMAP.md`).
- لا قنوات beta ولا rollout تدريجي.
- المُثبّت 144MB مقصود (تشغيل مستقل بالكامل، بلا web installer — انظر README).
- التوقيع التجاري (Authenticode) يحتاج شهادة مدفوعة — لم يُنفّذ.

---

## English

Gomiz Player IPTV Desktop is a **Windows Electron** companion app (v1.0.14) for managing and playing IPTV/VOD, with full EN/AR UI (RTL). FR was removed because it was incomplete.

**What it actually does:** Home with three independent widgets — a live analog clock, realistic SVG weather, and prayer times — all with dynamic backgrounds following time/weather/prayer proximity and a per-card refresh button. A player with a full control chrome and a channel drawer (categories, search, favorites, NOW/NEXT); a stream-error dialog whose Close returns to the channel list. EPG guide, movies/series, favorites, profiles, downloads and HLS recordings with local MP4 remux. M3U/Xtream/single sources with encrypted credentials. 10+ settings tabs, backup/restore, signed differential updates with a startup update popup, safe rollback, and local diagnostics.

**Under the hood:** 67 IPC handlers · `gomizplayer.json` + rolling backups · Electron `safeStorage` · 482 matched EN/AR keys · strict CSP + trusted-sender checks · Ed25519-signed update manifest verified before download · 7 passing test suites in CI · signed local manifest (`RELEASE_MANIFEST.yml`).

**Known limits:** no Catch-up/Multiview/Stalker/Cast, no beta channels, 144MB installer (deliberate), no Authenticode signing yet. See ROADMAP.md.
