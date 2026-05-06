"use client";

import { useLanguage } from "@/contexts/LanguageContext";

export default function Banner() {
  const { t } = useLanguage();

  return (
    <section className="relative overflow-hidden px-4 pb-10 pt-10 sm:px-6 lg:px-8">
      <div className="section-grid pointer-events-none absolute inset-0 opacity-30" />

      <div className="relative mx-auto flex w-full max-w-[104rem] justify-center">
        <div className="glass-panel w-full max-w-6xl rounded-3xl p-8 text-center sm:p-10 lg:p-14">


          <h1 className="text-3xl font-black leading-tight text-white sm:text-5xl">
            {t.title}
          </h1>

          <p className="mt-3 text-lg font-semibold text-cyan-100/90 sm:text-xl">
            {t.subtitle}
          </p>

          <div className="mt-6 text-sm leading-7 text-slate-200 sm:text-base">
            {Array.isArray(t.description1) ? (
              <ul className="space-y-2">
                {t.description1.map((item, index) => (
                  <li key={`intro-${index}`} className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-left">
                    {item}
                  </li>
                ))}
              </ul>
            ) : (
              <p>{t.description1}</p>
            )}
          </div>

          <div className="mt-6 text-sm leading-7 text-slate-200 sm:text-base">
            {Array.isArray(t.description2) ? (
              <ul className="space-y-2">
                {t.description2.map((item, index) => (
                  <li key={`feature-${index}`} className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-left">
                    {item}
                  </li>
                ))}
              </ul>
            ) : (
              <p>{t.description2}</p>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
