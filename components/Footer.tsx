"use client";

import { useLanguage } from "@/contexts/LanguageContext";

export default function Footer() {
  const { t } = useLanguage();

  return (
    <footer className="border-t border-white/10 bg-black/35 pb-10 pt-12 backdrop-blur-md">
      <div className="mx-auto grid w-full max-w-7xl gap-8 px-4 sm:px-6 md:grid-cols-2 lg:px-8">
        <div className="glass-panel rounded-3xl p-6">
          <h3 className="text-lg font-bold text-white">{t.footer.contact}</h3>
          <div className="mt-4 space-y-2 text-sm text-slate-200">
            <p>
              {t.footer.phone}：
              <a href="tel:18545793266" className="ml-2 text-cyan-200 hover:text-cyan-100">
                18545793266
              </a>
            </p>
            <p>
              {t.footer.email}：
              <a href="mailto:zzj1750438533@163.com" className="ml-2 text-cyan-200 hover:text-cyan-100">
                zzj1750438533@163.com
              </a>
            </p>
          </div>
        </div>

        <div className="glass-panel rounded-3xl p-6">
          <h3 className="text-lg font-bold text-white">{t.footer.followUs}</h3>
          <p className="mt-4 text-sm leading-7 text-slate-200">{t.footer.comingSoon}</p>
          <div className="mt-6 h-px w-full bg-gradient-to-r from-transparent via-white/30 to-transparent" />
          <p className="mt-6 text-xs text-slate-300">{t.footer.copyright}</p>
        </div>
      </div>
    </footer>
  );
}
