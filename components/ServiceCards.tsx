"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useLanguage } from "@/contexts/LanguageContext";

type HomeFeature = {
  id: number;
  titleKey: keyof typeof servicesKeys;
  descriptionKey: keyof typeof servicesKeys;
  image: string;
  route: string;
};

const servicesKeys = {
  proteinStructure: "",
  virtualScreening: "",
  moleculeGeneration: "",
  admetPrediction: "",
  synthesisPlan: "",
  antibody: "",
  distanceVisualization: "",
  vmdConsole: "",
  molecularStructureDescription: "",
  molecularViewDescription: "",
  molecularColoringDescription: "",
  molecularPositionDescription: "",
  molecularSelectionDescription: "",
  multiLigandViewDescription: "",
  distanceVisualizationDescription: "",
  vmdConsoleDescription: "",
} as const;

const coreFeatures: HomeFeature[] = [
  {
    id: 101,
    titleKey: "proteinStructure",
    descriptionKey: "molecularStructureDescription",
    image: "/images/features/molecule-illustration.png",
    route: "/feature/1",
  },
  {
    id: 102,
    titleKey: "virtualScreening",
    descriptionKey: "molecularViewDescription",
    image: "/images/features/molecule-color.png",
    route: "/feature/2",
  },
  {
    id: 103,
    titleKey: "moleculeGeneration",
    descriptionKey: "molecularColoringDescription",
    image: "/images/features/molecule-selection.png",
    route: "/feature/3",
  },
  {
    id: 104,
    titleKey: "admetPrediction",
    descriptionKey: "molecularPositionDescription",
    image: "/images/features/molecule-comparison.png",
    route: "/feature/4",
  },
];

const advancedFeatures: HomeFeature[] = [
  {
    id: 5,
    titleKey: "synthesisPlan",
    descriptionKey: "molecularSelectionDescription",
    image: "/images/features/molecule-view.png",
    route: "/feature/5",
  },
  {
    id: 6,
    titleKey: "antibody",
    descriptionKey: "multiLigandViewDescription",
    image: "/images/features/molecule-position.png",
    route: "/feature/6",
  },
  {
    id: 7,
    titleKey: "distanceVisualization",
    descriptionKey: "distanceVisualizationDescription",
    image: "/images/features/molecule-selection.png",
    route: "/feature/7",
  },
  {
    id: 8,
    titleKey: "vmdConsole",
    descriptionKey: "vmdConsoleDescription",
    image: "/images/features/molecule-illustration.png",
    route: "/feature/8",
  },
];

function FeatureGrid({
  title,
  badge,
  data,
  onEnter,
  t,
  language,
}: {
  title: string;
  badge: string;
  data: HomeFeature[];
  onEnter: (route: string) => void;
  t: {
    services: Record<keyof typeof servicesKeys, string>;
  };
  language: "zh" | "en";
}) {
  return (
    <div className="glass-panel rounded-3xl p-6 sm:p-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.28em] text-cyan-200/80">{badge}</p>
          <h3 className="mt-2 text-2xl font-bold text-white">{title}</h3>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {data.map((item) => (
          <div
            key={item.id}
            className="rounded-2xl border border-white/10 bg-white/5 p-4 transition hover:border-cyan-200/40 hover:bg-cyan-300/10"
          >
            <div className="mb-3 flex items-center gap-3">
              <p className="text-sm text-cyan-100">&nbsp;</p>
            </div>

            <div className="overflow-hidden rounded-xl border border-white/10 bg-black/25 p-2">
              <Image src={item.image} alt={t.services[item.titleKey]} width={360} height={220} className="h-28 w-full rounded-lg object-cover" />
            </div>

            <h4 className="mt-4 text-lg font-semibold text-white">{t.services[item.titleKey]}</h4>
            <p className="mt-2 line-clamp-4 text-sm leading-6 text-slate-200">{t.services[item.descriptionKey]}</p>

            <button
              type="button"
              className="btn-primary mt-4 w-full"
              onClick={() => onEnter(item.route)}
            >
              {language === "zh" ? "进入功能" : "Open Module"}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function ServiceCards() {
  const router = useRouter();
  const { t, language } = useLanguage();

  const featureHubLabel = language === "zh" ? "功能中心" : "Feature Hub";
  const coreTitle = language === "zh" ? "分子演示功能" : "Molecular Demo Modules";
  const advancedTitle = language === "zh" ? "动力学演示功能" : "Molecular Dynamics Modules";
  const coreBadge = language === "zh" ? "核心模块" : "Core Modules";
  const advancedBadge = language === "zh" ? "动力学模块" : "Molecular Dynamics Modules";
  const enterLabel = language === "zh" ? "进入功能" : "Open Module";

  return (
    <section className="mx-auto mb-20 mt-8 w-full max-w-7xl space-y-8 px-4 sm:px-6 lg:px-8">
      <div className="mb-2 text-center">
        <p className="text-xs uppercase tracking-[0.35em] text-cyan-200/80">{featureHubLabel}</p>
        <h2 className="mt-3 text-3xl font-extrabold text-white sm:text-4xl">{featureHubLabel}</h2>
      </div>

      <FeatureGrid
        title={coreTitle}
        badge={coreBadge}
        data={coreFeatures}
        onEnter={(route) => router.push(route)}
        t={t}
        language={language}
      />

      <FeatureGrid
        title={advancedTitle}
        badge={advancedBadge}
        data={advancedFeatures}
        onEnter={(route) => router.push(route)}
        t={t}
        language={language}
      />

      <div className="sr-only" aria-live="polite">{enterLabel}</div>
    </section>
  );
}
