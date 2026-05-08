"use client";

import { createContext, useContext, useState, ReactNode } from 'react';

type Language = 'zh' | 'en';

// 定义所有需要翻译的文本
export const translations = {
  zh: {
    title: "分子演示平台",
    subtitle: "分子属性和动力学轨迹演示平台",
    description1: "面向分子可视化、结构交互与分子动力学演示的平台，覆盖结构浏览、多视图切换、配色与测量、选择分离，以及轨迹播放与分析，支持 VMD 命令行交互，帮助科研与教学直观呈现分子细节。",
    description2: [
      '结构与基础视图：上传 PDB，完成结构浏览与多视图切换。',
      '配色与空间定位：按元素/疏水/静电/B 因子等方案配色并定位关键原子。',
      '分子选择与分离：按链、残基或区域筛选并分离结构。',
      '分子测量工具：标注键长、键角与二面角，完成几何测量。',
      '分子动力学轨迹演示：轨迹播放、帧控制与快照导出。',
      '轨迹分析总览：RMSD、Rg 等指标快速统计与趋势展示。',
      '分子距离变化可视化：绘制距离随帧变化曲线。',
      'VMD 命令行：常用命令交互与脚本批量执行。'
    ],
    nav: {
      home: '首页',
      resources: '资源',
      community: '社区论坛'
    },
    services: {
      proteinStructure: "结构与基础视图",
      virtualScreening: "配色与空间定位",
      moleculeGeneration: "分子选择与分离",
      admetPrediction: "分子测量工具",
      synthesisPlan: "分子动力学轨迹演示",
      antibody: "轨迹分析总览",
      distanceVisualization: "分子距离变化可视化",
      vmdConsole: "VMD 命令行",
      molecularStructureDescription: "上传 PDB 并完成基础结构浏览，支持卡通、棍状、球状与表面视图切换，便于从不同角度观察分子结构。",
      molecularViewDescription: "通过多种配色方案突出结构差异，结合空间定位与原子测量，快速识别关键位点与几何特征。",
      molecularColoringDescription: "按链、残基或区域进行筛选与隔离显示，便于聚焦局部结构并减少视觉干扰。",
      molecularPositionDescription: "支持键长、键角、二面角等测量模式，依次点选原子即可完成几何参数标注。",
      molecularSelectionDescription: "导入轨迹后进行播放与帧控制，支持录屏与快照导出，适合动态结构演示。",
      multiLigandViewDescription: "自动计算 RMSD / Rg 等指标，提供基础统计与趋势可视化，快速掌握轨迹行为。",
      distanceVisualizationDescription: "将指定原子距离随帧变化绘制成曲线，便于分析构象变化。",
      vmdConsoleDescription: "提供 VMD 常用命令交互，支持 atomselect/measure 与脚本批量执行。"
    },
    footer: {
      contact: "联系我们",
      phone: "电话",
      email: "邮箱",
      followUs: "关注我们",
      comingSoon: "更多信息敬请期待...",
      copyright: "版权所有 © 2026 HIT。保留所有权利。"
    }
  },
  en: {
    title: "Molecular Visualization Platform",
    subtitle: "Molecular Visualization & Dynamics Demo Suite",
    description1: "A molecular visualization and dynamics demo platform covering structure browsing, multi-view switching, coloring and measurement, selection/isolation, trajectory playback and analysis, plus a VMD-style command console for interactive workflows.",
    description2: [
      'Structure & Base Views: Upload PDB to browse structures and switch views.',
      'Coloring & Spatial Positioning: Element/hydrophobic/electrostatic/B-factor coloring with key-atom positioning.',
      'Selection & Isolation: Filter by chain, residue, or region to isolate structures.',
      'Molecular Measurement Tools: Label bond/angle/dihedral for geometric measurements.',
      'MD Trajectory Demo: Playback, frame control, snapshot and recording export.',
      'Trajectory Analysis Overview: Quick RMSD/Rg statistics and trend plots.',
      'Distance Change Visualization: Plot distance vs. frame curves.',
      'VMD Console: Common commands and batch scripts.'
    ],
    nav: {
      home: 'Home',
      resources: 'Resources',
      community: 'Community'
    },
    services: {
      proteinStructure: "Structure & Base Views",
      virtualScreening: "Coloring & Spatial Positioning",
      moleculeGeneration: "Selection & Isolation",
      admetPrediction: "Molecular Measurement Tools",
      synthesisPlan: "MD Trajectory Demo",
      antibody: "Trajectory Analysis Overview",
      distanceVisualization: "Distance Change Visualization",
      vmdConsole: "VMD Console",
      molecularStructureDescription: "Upload PDB files to browse structures with cartoon, stick, sphere, and surface modes from different angles.",
      molecularViewDescription: "Use multiple coloring schemes with spatial positioning and atom measurements to highlight key sites and geometry.",
      molecularColoringDescription: "Filter by chain, residue, or region to isolate structures and reduce visual clutter.",
      molecularPositionDescription: "Measure bond length, bond angle, and dihedral by selecting atoms step by step.",
      molecularSelectionDescription: "Play trajectories with frame control, recording export, and snapshots for dynamic structure demos.",
      multiLigandViewDescription: "Compute RMSD/Rg metrics with basic statistics and trend visualization for trajectory insights.",
      distanceVisualizationDescription: "Plot atom distance changes across frames to analyze conformational shifts.",
      vmdConsoleDescription: "Interactive VMD-style commands with atomselect/measure and batch execution."
    },
    footer: {
      contact: "Contact Us",
      phone: "Phone",
      email: "Email",
      followUs: "Follow Us",
      comingSoon: "More information coming soon...",
      copyright: "Copyright © 2026 HIT. All Rights Reserved."
    }
  }
};

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: typeof translations.zh | typeof translations.en;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguage] = useState<Language>('zh');

  const value = {
    language,
    setLanguage,
    t: translations[language]
  };

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (context === undefined) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
} 