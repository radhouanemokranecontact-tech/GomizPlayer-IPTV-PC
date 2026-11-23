# Gomiz Player IPTV — Roadmap / خارطة الطريق

[العربية](#العربية) | [English](#english)

## العربية

### الإصدار الحالي
**PC:** v1.0.13 · **Android:** 1.0.4 — مستقر، موقّع، مع نسخ احتياطي وتحديثات تفاضلية موقّعة.

### مكتمل ✅
- P0: توقيع APK (Keystore) · Network Security Config · نسخ بيانات احتياطي · توقيع manifest
- P1: CI · ربط الاختبارات (7 suites) · تراجع آمن · تشخيص محلي
- P2: إفصاح الخصوصية · ترجمات · توثيق ترخيص FFmpeg · قرار الحجم

### مؤجّل إلى 2.1+ (قرار واعٍ)
| الميزة | السبب |
|---|---|
| Catch-up كامل | يعتمد على دعم المزوّد (Xtream timeshift) — لا يمكن ضمانه |
| Multiview | يحتاج أجهزة قوية واختبار فيزيائي |
| Stalker | بروتوكول منفصل (portal + cookies) — مشروع مستقل |
| Chromecast / DLNA | يتطلب أجهزة حقيقية للاختبار (لا emulator) |
| قنوات beta + rollout تدريجي | يتطلب بنية نشر متعددة Releases |

### لا يُنفّذ (قرار تصميمي)
- web installer لتقليل الحجم — يتعارض مع سياسة «المحتوى الموقّع فقط».

---

## English

### Current
**PC:** v1.0.13 · **Android:** 1.0.4 — stable, signed, backed up, differential signed updates.

### Done ✅
- P0: APK signing, Network Security Config, data backup, signed update manifest
- P1: CI, 7 test suites, safe rollback, local crash diagnostics
- P2: privacy disclosure, translations, FFmpeg license notice, size decision

### Deferred to 2.1+ (deliberate)
Catch-up (provider-dependent), Multiview (powerful devices only), Stalker (separate protocol), Chromecast/DLNA (real hardware needed), beta channels + staged rollout.

### Won't do
Web installer — conflicts with the signed-content-only policy.
