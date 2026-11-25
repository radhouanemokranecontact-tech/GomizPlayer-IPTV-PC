# Gomiz Player IPTV — Roadmap / خارطة الطريق

[العربية](#العربية) | [English](#english)

## العربية

### الإصدار الحالي
**PC: v1.0.37 (PRO)** · **Android: 1.0.4** — مستقر، موقّع، مع نسخ احتياطي وتحديثات تفاضلية موقّعة.

### مكتمل ✅
- P0: توقيع APK (Keystore) · Network Security Config · نسخ بيانات احتياطي · توقيع manifest Ed25519
- P1: 14 مجموعة اختبار + تحقق واقعي بـ CDP · تراجع آمن · تشخيص محلي
- P2: إفصاح الخصوصية · ترجمات EN/AR · ثيمات (6) · توثيق ترخيص FFmpeg · قرار الحجم
- PRO: فحص صحة القنوات · تحويل تلقائي · إزالة تكرار · جدولة تسجيل · رقابة أبوية · Catch-up · تصدير M3U — **مُدمج بالكامل في 1.0.37**

### قيد المتابعة (P0)
- مراقبة وصول تحديث 1.0.37 إلى المستخدمين الحاليين وتأكيد تفعيل أدوات PRO لديهم.

### مخطط له (P1)
- تحسين زمن الإقلاع للمكتبات الكبيرة جداً (>15,000 قناة): فهرسة مسبقة + تأجيل إنشاء المشغّل. **القياس أظهر أن الفلترة ليست المشكلة الأساسية، بل نقل البيانات والشبكة.**
- توسيع Catch-up لمزوّدين إضافيين عند الطلب.

### مؤجّل (P2 — قرار واعٍ)
| الميزة | السبب |
|---|---|
| Multiview | يحتاج أجهزة قوية واختبار فيزيائي |
| Chromecast / DLNA | يتطلب أجهزة حقيقية للاختبار (لا emulator) |
| قنوات beta + rollout تدريجي | يتطلب بنية نشر متعددة Releases |

### لا يُنفّذ (قرار تصميمي)
- web installer لتقليل الحجم — يتعارض مع سياسة «المحتوى الموقّع فقط».
- Stalker — بروتوكول منفصل (portal + cookies) — مشروع مستقل.

---

## English

### Current
**PC: v1.0.37 (PRO)** · **Android: 1.0.4** — stable, signed, backed up, differential signed updates.

### Done ✅
- P0: APK signing, Network Security Config, data backup, Ed25519 manifest signing
- P1: 14 test suites + real-window CDP verification, safe rollback, local diagnostics
- P2: privacy disclosure, EN/AR translations, 6 themes, FFmpeg license notice, size decision
- PRO: health scan, auto-failover, dedupe, scheduled recording, parental controls, catch-up, M3U export — **fully merged in 1.0.37**

### In progress (P0)
- Monitor the 1.0.37 rollout and confirm PRO tools reach existing users.

### Planned (P1)
- Faster startup for very large libraries (>15,000 channels): pre-indexing + lazy player init. **Measurements show IPC transfer/network, not filtering, is the real bottleneck.**
- Extend catch-up to more providers on request.

### Deferred (P2, deliberate)
Multiview (powerful devices only), Chromecast/DLNA (real hardware required), beta channels + staged rollout (multi-release publishing).

### Won't do
Web installer (conflicts with signed-content-only policy); Stalker (separate protocol).
