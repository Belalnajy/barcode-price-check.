# استعلام الأسعار — Barcode Price Check

تطبيق استعلام أسعار بالباركود (عربي/إنجليزي) مبني بـ **React** (فرونتإند) + **Node.js/Express** كـ Serverless Functions (باكإند) + قاعدة بيانات **Postgres** — جاهز للنشر مباشرة على **Vercel**.

## المميزات

- 🔍 مسح الباركود بالسكانر أو الكيبورد أو **كاميرا الموبايل**
- 🔤 بحث بالاسم مع تصحيح إملائي (Fuse.js) وتطبيع الحروف العربية والأرقام الهندية
- 🛒 قائمة مشتريات بكميات وإجمالي شامل ضريبة القيمة المضافة 15%
- 📦 كتالوج 1399 صنف محفوظ في قاعدة بيانات مشتركة بين كل الأجهزة
- ➕ إضافة/تعديل صنف يدويًا، رفع ملف Excel (ضم أو استبدال) مع معاينة الفروقات، تنزيل CSV، رجوع للأصل
- 🖨️ طباعة القائمة
- 🌐 واجهة ثنائية اللغة: عربي (خط **Cairo**) / إنجليزي (خط **Inter**)
- 📄 صفحة باركودات للتجربة: `/test-barcodes.html`

## بنية المشروع

```
├── api/                  # الباكإند — Express كـ Vercel Serverless Function
│   ├── index.js          # تطبيق Express (routes + validation + error handling)
│   ├── _lib/db.js        # طبقة البيانات: Postgres (pg) + fallback في الذاكرة للتطوير
│   └── _data/catalog.json# الكتالوج الأصلي (seed) — يُزرع تلقائيًا أول تشغيل
├── frontend/             # الفرونتإند — React + Vite
│   ├── index.html
│   ├── public/test-barcodes.html
│   └── src/
│       ├── App.jsx       # تجميع الحالة والتدفق
│       ├── i18n.jsx      # النصوص عربي/إنجليزي
│       ├── components/   # TopBar, DisplayPanel, ScanBox, CartPanel, TotalsDock,
│       │                 # CameraDialog, CatalogDialog, Barcode, PrintExtras
│       ├── hooks/        # useCatalog (API + فهرسة بحث), useCart (localStorage)
│       └── lib/          # api, excel (xlsx), format, sound
├── server.js             # تشغيل الـ API محليًا أثناء التطوير
├── vercel.json           # إعدادات البناء والتوجيه على Vercel
└── .env.example
```

## واجهة الـ API

| Method | Path | الوظيفة |
|---|---|---|
| GET | `/api/health` | حالة السيرفر ونوع قاعدة البيانات |
| GET | `/api/products` | كل الأصناف + معلومات القائمة |
| GET | `/api/products/:barcode` | صنف واحد بالباركود |
| POST | `/api/products` | إضافة/تعديل صنف واحد |
| POST | `/api/products/bulk` | استيراد جماعي `{ mode: "merge"\|"replace", items: [...] }` |
| POST | `/api/products/reset` | الرجوع للقائمة الأصلية |

قائمة المشتريات (السلة) تظل على الجهاز نفسه (localStorage) — زي التطبيق الأصلي بالظبط — بينما الكتالوج والأسعار مشتركة من قاعدة البيانات.

## التشغيل محليًا

```bash
npm install
npm --prefix frontend install
npm run dev        # API على :3001 + Vite على :5173
```

بدون `DATABASE_URL` يشتغل الـ API بقائمة في الذاكرة (غير دائمة) — كافية للتجربة المحلية.

## النشر على Vercel

1. **أنشئ قاعدة البيانات**: من لوحة Vercel → **Storage** → **Create Database** → اختر **Postgres (Neon)**. أو أنشئ قاعدة مجانية من [neon.tech](https://neon.tech) وانسخ الـ connection string.
2. **اربط المشروع**: من [vercel.com/new](https://vercel.com/new) استورد هذا الريبو من GitHub. إعدادات البناء تُقرأ تلقائيًا من `vercel.json` — لا تغيّر شيئًا.
3. **أضف متغير البيئة**: في إعدادات المشروع → **Environment Variables** أضف:
   - `DATABASE_URL` = connection string بتاع Postgres (لو أنشأتها من لوحة Vercel بيتضاف لوحده باسم قد يكون `POSTGRES_URL` — انسخ قيمته إلى `DATABASE_URL`).
4. **Deploy**. أول طلب للـ API بينشئ الجداول ويزرع الكتالوج الأصلي (1399 صنف) تلقائيًا.

> ملاحظة: كاميرا الموبايل تتطلب HTTPS — وهذا متوفر تلقائيًا على Vercel.

## التجربة بدون سكانر

افتح `/test-barcodes.html` — فيها باركودات EAN-13 سليمة تقدر:
- تكتب أرقامها بالكيبورد وتدوس Enter،
- أو تفتحها على اللابتوب وتمسحها بكاميرا الموبايل من التطبيق،
- أو تطبعها وتجرب عليها بالسكانر الحقيقي.
