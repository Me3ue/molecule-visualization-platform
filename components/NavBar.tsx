"use client";

import Image from "next/image";
import Link from "next/link";
import { icons } from "@/public/icons";
import { useLanguage } from "@/contexts/LanguageContext";

export default function NavBar() {
  const { language, setLanguage, t } = useLanguage();

  return (
    <nav className="sticky top-0 z-50 border-b border-white/15 bg-black/35 backdrop-blur-xl">
      <div className="mx-auto flex h-20 w-full max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-4">
          <Link href="/" className="flex items-center gap-3">
            <div className="rounded-2xl border border-white/20 bg-white/10 p-2">
              <Image
                src={icons.logo}
                alt="Logo"
                width={30}
                height={30}
                className="rounded-full"
              />
            </div>
            <div className="hidden sm:block">
              <p className="text-xs uppercase tracking-[0.25em] text-sky-200/80">Molecule Lab</p>
              <p className="text-sm font-semibold text-white">HIT Visualization Platform</p>
            </div>
          </Link>
        </div>


        <button
          onClick={() => setLanguage(language === "zh" ? "en" : "zh")}
          className="rounded-full border border-fuchsia-300/40 bg-fuchsia-500/20 px-4 py-2 text-xs font-semibold tracking-wider text-white transition hover:bg-fuchsia-500/35"
          type="button"
        >
          {language === "zh" ? "中 / EN" : "EN / 中"}
        </button>
      </div>
    </nav>
  );
}
