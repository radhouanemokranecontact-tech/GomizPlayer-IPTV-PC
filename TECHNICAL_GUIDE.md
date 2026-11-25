# GomizPlayer PRO IPTV — الدليل التقني الشامل (Windows)

[العربية](#العربية) | [English](#english)

> **الإصدار الحالي: v1.0.37 (PRO)** — مبني على فحص الكود الفعلي وتشغيل النسخة المبنية داخل نافذة حقيقية (CDP). كل ما هو مذكور هنا مُنجز ومُختبَر؛ وما ليس مذكوراً غير موجود.

---

## العربية

### 1) تعريف التطبيق
**GomizPlayer PRO IPTV** هو تطبيق سطح مكتب Windows مبني بـ **Electron 45.3.2** + JavaScript، يعمل كمرافق متقدم لمشغّل Android TV. يوفّر تشغيل IPTV/VOD وإدارة المصادر وصيانة المكتبة على الكمبيوتر، بواجهة عربية/إنجليزية كاملة (EN/AR). الإصدار: **1.0.37**.

النسخة **PRO** تضيف طبقة «أدوات صيانة ذكية» فوق المشغّل الأساسي: فحص صحة القنوات، تحويل تلقائي عند الفشل، إزالة التكرار، جدولة التسجيل، رقابة أبوية، مشاهدة ما فات (Catch-up)، وتصدير قائمة M3U.

### 2) المميزات الشاملة

#### أ) الواجهة
- شريط جانبي: الشعار أعلى، **القائمة متوسطة عمودياً**، زر اللغة (EN/AR) وأيقونات التواصل أسفل الشريط.
- القائمة: Home · Live TV · TV Guide · Movies · Series · My List TV · My Movies & Series · Downloads · Recordings · **PRO Tools** · Sources · Settings + بحث علوي.
- الرئيسية: widgets مستقلة (ساعة تناظرية، طقس برسوم SVG، أوقات صلاة بعدّ تنازلي) مع خلفيات ديناميكية وزر تحديث لكل widget.
- أقسام قابلة للترتيب: بطل، أكمل المشاهدة، المفضلة، مباشر، أُضيف حديثاً، مجموعات — بكثافة قابلة للضبط.
- **6 ثيمات** + ألوان Accent مخصصة + إعدادات إتاحة (Accessibility).

#### ب) المشغّل (Player)
- تشغيل **HLS (hls.js 1.5.20)** و**MPEG-TS (mpegts.js 1.7.3)** وDASH، مع FFmpeg 5.3.0 للتسجيل/التحويل.
- تحكم كامل: play/pause، seek، سرعة، جودة، صوت، ترجمة، نسبة أبعاد، ملء شاشة، كتم، لقطة شاشة، مؤقت نوم، A-B loop، mini-player، دائماً في المقدمة، إحصائيات.
- **درج القنوات** بمجموعات/بحث/إزالة تكرار/مفضلة ♥ + NOW/NEXT، مع حفظ التصنيف `(drawerLive / drawerFavorites)` بين الجلسات.
- عند فشل البث في الوضع PRO: تحويل تلقائي إلى مصدر بديل لنفس القناة (Auto-failover) مع إشعار.
- إغلاق المشغّل من المفضلة يعود مباشرة إلى **Home**.

#### ج) الدليل (EPG) والقنوات
- جدول برامج مع «الآن/التالي» وتنقّل، محلل EPG متدفق (streaming parser).
- **Catch-up**: بناء رابط برنامج سابق من EPG + قالب المزوّد (Xtream timeshift) عند توفره.

#### د) المصادر والأمان
- مصادر: M3U/M3U8 · Xtream Codes · رابط مفرد، برؤوس HTTP مخصصة.
- كلمات مرور Xtream مُشفّرة عبر Electron `safeStorage` (`secrets.js`)، مع زر الق锁 لإعادة إدخالها عند نقل النسخة الاحتياطية لجهاز آخر.
- **حماية SSRF** (`net-guard.js`): حظر عناوين IP الخاصة/المحلية و`localhost` مع فحص DNS قبل الاتصال.
- فحص `assertTrustedSender` على كل استدعاء IPC حساس.
- تحذير واضح عند إضافة رابط `http://` غير مشفّر.
- توقيع **Ed25519** لملف التحديث `latest.yml` والتحقق منه قبل التنزيل (`manifest-verify.js`) + حماية التحديث (`update-guard.js`).

#### هـ) أدوات PRO (15 معالج IPC)
| الأداة | الوظيفة |
|---|---|
| **Library Doctor** | فحص صحة كل قناة (HEAD/GET خفيف) مع شريط تقدم وإلغاء، عدّاد `ok/dead/unknown`، إخفاء القنوات الميتة، مسح النتائج |
| **Smart backup sources** | كشف القنوات ذات المصادر البديلة والبث المكرر + تفعيل التحويل التلقائي |
| **Scheduled recordings** | جدولة تسجيل قناة في وقت محدد (يعمل إذا كان التطبيق مفتوحاً) |
| **Parental controls** | كلمات مفتاحية/مجموعات محظورة + قائمة مدمجة للكبار + PIN لحماية التغيير |
| **Export playlist** | تصدير M3U نظيف، مع خيار «بدون تكرار» و«القنوات العاملة فقط» |
| **Catch-up** | مشاهدة البرامج السابقة من EPG |

#### و) التحديثات والنسخ الاحتياطي
- فحص تلقائي عند الإقلاع + تنزيل تفاضلي عبر `.blockmap` (تنزيل الأجزاء المتغيرة فقط بدل 144MB).
- نسخ احتياطي/استعادة JSON بلا كلمات مرور بنص عادي + سجل أخطاء محلي (`app.log`).
- تشخيص/قياس اختياري بموافقة صريحة (PRIVACY.md).

### 3) الاختبارات المنجزة

#### أ) افتراضية (14 مجموعة — كلها PASS)
| # | المجموعة | ما تتحقق منه |
|---|---|---|
| 1 | `test:ssrf` | حظر عناوين IP الخاصة/المحلية |
| 2 | `test:classification` | تصنيف المحتوى (46 تأكيداً) |
| 3 | `test:classification-parity` | تطابق التصنيف مع تطبيق الأندرويد |
| 4 | `test:secrets` | تشفير/فك كلمات المرور عبر safeStorage |
| 5 | `test:secrets:audit` | تدقيق عدم تسريب الأسرار (15 فحصاً) |
| 6 | `test:backup` | النسخ الاحتياطي/الاستعادة بلا أسرار |
| 7 | `test:update-guard` | حماية مسار التحديث |
| 8 | `test:manifest-signature` | توقيع/التحقق Ed25519 |
| 9 | `test:epg-stream` | محلل EPG المتدفق |
| 10 | `test:net-guard` | حماية الشبكة/DNS (3 فحوصات) |
| 11 | `test:hardening` | التقسية العامة |
| 12 | `test:pro` | منطق أدوات PRO (3 فحوصات) |
| 13 | `test:pro-ipc` | واجهة PRO IPC (4 فحوصات) |
| 14 | `test:media` | تكامل الوسائط (3 فحوصات) |

**النتيجة: 14/14 PASS** (آخر تشغيل على الكود المدمج لـ v1.0.37).

#### ب) واقعية (CDP داخل نافذة Electron حقيقية)
| الفحص | النتيجة |
|---|---|
| فتح النسخة المبنية `dist\win-unpacked` | `GomizPlayer PRO IPTV` · route = `home` |
| تحميل المكتبة | **4,026 قناة** |
| أخطاء JavaScript | **0** |
| صورة الواجهة | شعار أعلى · قائمة متوسطة · أيقونات أسفل ✅ |
| فتح PRO Tools | route = `pro` · البطاقات كلها ظاهرة |
| `health.summary` | `{ok:4026, dead:432, unknown:0, hideDead:true}` |
| `dupes` | `{clusters:0, redundant:0, live:4026}` |
| `parental.get` | `{enabled:true, useDefaults:true, lockSet:true}` |
| جدولة موجودة | «Al Hadath» · 25 نوفمبر 2026 · Done |
| إغلاق من المفضلة | يعود إلى `home` ✅ |
| زر التشغيل بعد التحميل | تنزيل حقيقي → `Complete` + `file` → زر **Play** ✅ |

#### ج) إحصائيات البناء
- المُثبّت (NSIS): **144 MB** · المحمول (Portable): **128 MB** — يتضمّنان Electron/Chromium كاملاً للعمل بلا اتصال.
- كود التطبيق نفسه صغير؛ الحجمmostly هو Chromium.
- **15 معالج IPC** لأدوات PRO · **337 حزمة** في `package-lock.json`.
- manifest موقّع Ed25519 (keyId `2f5e8004…`) + blockmap للإصدارين 1.0.35 و1.0.37.

### 4) ما تم إنجازه (سجل مختصر)
- بنية مستقرة: ملف `main.js` واحد بلا تقسيم (`core-utils.js` أُزيل نهائياً بعد أن سبّب مشاكل).
- نظام ثيمات (6) + خلفيات + تحسينات واجهة.
- أمان: SSRF · safeStorage · توقيع التحديثات · trusted sender · إفصاح خصوصية.
- نسخ احتياطي + تحديثات تفاضلية + تراجع آمن.
- إصلاح أيقونة المشاهدة بعد اكتمال التحميل.
- **دمج PRO الكامل وتوحيد الإصدار 1.0.37** مع استمرار سلسلة التحديث من 1.0.35.
- تصحيح وسم GitHub ليشير إلى commit الدمج (مصادر الإصدار صحيحة).

### 5) الحدود المعروفة
- **DRM لا يعمل على PC** (ChromeCDM غير متاح في Electron) — المحتوى المحمي لا يُشغَّل.
- **DASH جزئي** (حسب توفر المزوّد) — HLS/MPEG-TS هما المساران المضمونان.
- Catch-up يعتمد على دعم المزوّد (قالب Xtream timeshift)؛ لا يمكن ضمانه لكل مزوّد.
- الجدولة تتطلب بقاء التطبيق مفتوحاً.
- multiview / Chromecast / DLNA / Stalker غير منفذة.
- لا web-installer (يتعارض مع سياسة «المحتوى الموقّع فقط»).

### 6) الخطط المستقبلية
| الأولوية | العنصر | الحالة |
|---|---|---|
| P0 | مراقبة التحديث 1.0.37 لدى المستخدمين + التأكد من وصول PRO لهم | قيد المتابعة |
| P1 | تحسين زمن الإقلاع مع المكتبات الكبيرة (>15,000 قناة) — الفهرسة المسبقة وتأجيل構造 المشغّل | مخطط له (قياس CDP أظهر أن الفلترة ليست المشكلة الأساسية؛ النقل/الشبكة هي) |
| P1 | توسيع Catch-up لمزوّدين إضافيين | حسب الطلب |
| P2 | multiview / Chromecast / DLNA | مؤجل — يحتاج أجهزة حقيقية للاختبار |
| P2 | قنوات beta + rollout تدريجي | يتطلب بنية نشر متعددة Releases |
| — | Stalker / web-installer | مستبعد تصميمياً |

---

## English

### 1) What this app is
**GomizPlayer PRO IPTV** is a Windows desktop application built with **Electron 45.3.2** + JavaScript — an advanced companion to the Android TV player. It plays IPTV/VOD, manages sources and maintains the library, with full EN/AR localization. Current version: **1.0.37**.

The **PRO** edition adds a smart-maintenance layer: channel health scan, automatic failover, deduplication, scheduled recording, parental controls, catch-up and M3U export.

### 2) Features
- **UI:** logo at top, navigation centered vertically, language/social icons at the bottom. Home · Live TV · TV Guide · Movies · Series · My List TV · My Movies & Series · Downloads · Recordings · **PRO Tools** · Sources · Settings.
- **Home:** independent widgets (analog clock, SVG weather, prayer times with countdown) and reorderable sections; 6 themes + accents.
- **Player:** HLS (hls.js), MPEG-TS (mpegts.js), DASH; full controls; channel drawer with groups/search/dedupe/favorites; persisted drawer category; auto-failover in PRO; closing from favorites returns Home.
- **EPG:** now/next grid, streaming parser, catch-up link builder.
- **Sources & security:** M3U/M3U8, Xtream Codes, single URL; encrypted credentials via `safeStorage`; SSRF guard (private/local IPs blocked); trusted-sender IPC checks; Ed25519-signed update manifest; clear warning for `http://`.
- **PRO Tools (15 IPC handlers):** Library Doctor (health scan with progress/cancel, hide dead), smart backups + auto-failover, scheduled recordings, parental controls (keywords/groups + built-in adult list + PIN), M3U export (dedupe / alive-only), catch-up.
- **Updates:** automatic check on launch, differential `.blockmap` updates, JSON backup without plaintext secrets, local error log.

### 3) Verification

**Automated — 14/14 suites PASS:** ssrf, classification, classification-parity, secrets, secrets-audit, backup, update-guard, manifest-signature, epg-stream, net-guard, hardening, pro, pro-ipc, media.

**Real-world (CDP in a real Electron window):**

| Check | Result |
|---|---|
| Built app opened | `GomizPlayer PRO IPTV`, route `home` |
| Library loaded | **4,026 channels** |
| JavaScript errors | **0** |
| Layout screenshot | logo top · menu centered · icons bottom ✅ |
| PRO Tools opened | route `pro`, all cards visible |
| `health.summary` | `{ok:4026, dead:432, unknown:0}` |
| `dupes` | `{clusters:0, redundant:0, live:4026}` |
| `parental.get` | `{enabled:true, useDefaults:true, lockSet:true}` |
| Play icon after real download | `Complete` + `file` → **Play** button ✅ |

**Build stats:** NSIS installer **144 MB**, portable **128 MB** (mostly Chromium); **15 PRO IPC handlers**; **337 packages**; signed manifest + blockmaps for 1.0.35 and 1.0.37.

### 4) Done
Stable single-file main architecture (`core-utils.js` removed), 6 themes, SSRF/safeStorage/signed updates/trusted sender, backup + differential updates, completed-download Play icon fix, **full PRO merge as v1.0.37**, corrected GitHub tag pointing at the merge commit.

### 5) Known limits
DRM does not work on PC (no ChromeCDM in Electron). DASH is partial — HLS/MPEG-TS are the reliable paths. Catch-up depends on provider support. Scheduling requires the app to stay open. Multiview, Chromecast/DLNA and Stalker are not implemented. No web installer (signed-content-only policy).

### 6) Roadmap
- **P0:** monitor the 1.0.37 rollout and confirm PRO reaches existing users.
- **P1:** improve startup with very large libraries (>15,000 channels) — pre-indexing and lazy player init (measurements show IPC transfer/network is the real bottleneck, not filtering).
- **P1:** extend catch-up to more providers on request.
- **P2:** multiview / Chromecast / DLNA — needs real hardware; beta channels + staged rollout — needs multi-release publishing.
- **Won't do:** Stalker, web installer.
