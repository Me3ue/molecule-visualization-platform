'use client'

import Image from "next/image";
import { useState } from "react";
import { useRouter } from 'next/navigation';

export default function FeatureSection() {
  const [hoveredText, setHoveredText] = useState<number | null>(null);
  const router = useRouter();

  const features = [
    { id: 1, name: "分子结构", path: "/protein-structure" },
    { id: 2, name: "分子视图", path: "/molecule-view" },
    { id: 3, name: "分子配色", path: "/molecule-color" },
    { id: 4, name: "分子位置", path: "/molecule-position" },
    { id: 5, name: "分子选择与分离", path: "/molecule-select" },
    { id: 6, name: "多配体对比视图", path: "/molecule-compare" },
  ];

  return (
    <div className="flex flex-col items-center py-12">
      {/* 标题 */}
      <h2 className="text-2xl font-bold mb-8">主要功能</h2>

      {/* 功能图标列表 */}
      <div className="grid grid-cols-6 gap-8 w-full max-w-[1200px] mb-12">
        {features.map((feature) => (
          <div
            key={feature.id}
            className="flex flex-col items-center cursor-pointer"
            onClick={() => router.push(feature.path)}
          >
            <div className="w-12 h-12 mb-2">
              {/* 根据不同功能显示不同图标 */}
              {feature.id === 1 && (
                <svg className="w-full h-full" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <circle cx="12" cy="12" r="10" strokeWidth="2" />
                </svg>
              )}
              {/* 添加其他图标... */}
            </div>
            <span
              className={`text-sm transition-colors duration-300 ${hoveredText === feature.id ? 'text-[#25b5ab]' : 'text-gray-600'
                }`}
              onMouseEnter={() => setHoveredText(feature.id)}
              onMouseLeave={() => setHoveredText(null)}
            >
              {feature.name}
            </span>
          </div>
        ))}
      </div>

      {/* 内容部分 */}
      <div className="flex items-center gap-16">
        <div className="flex-1">
          <div className="relative aspect-[4/3] w-full max-w-[600px]">
            <div className="absolute inset-0 flex items-center justify-center">
              {/* 背景装饰分子 */}
              <div className="absolute top-0 left-0 opacity-20 molecule-float">
                <Image
                  src="/images/molecule-structure.png"
                  alt="Background Molecule"
                  width={200}
                  height={150}
                  className="object-contain"
                />
              </div>
              {/* 主要分子图 */}
              <Image
                src="/images/molecule-structure.png"
                alt="Molecule Structure Visualization"
                width={400}
                height={300}
                className="object-contain z-10 molecule-float-delay"
                priority
              />
              {/* 右下角装饰分子 */}
              <div className="absolute bottom-0 right-0 opacity-30">
                <Image
                  src="/images/molecule-structure.png"
                  alt="Background Molecule"
                  width={150}
                  height={100}
                  className="object-contain"
                />
              </div>
            </div>
          </div>
        </div>
        <div className="flex-1">
          <h2 className="text-3xl font-bold mb-6 text-secondary">基于小分子结构的药物发现</h2>
          <p className="text-gray-600 mb-8 leading-relaxed">
            该方法通过人工智能来学习小分子结构和生物活性之间的关系，从而对商业化合物库或者药厂自有的化合物库进行小分子活性预测，特别适用于当靶点信息和晶体结构不明确的情况下进行分子筛选。现有模型通过对 ChEMBL 中超过 500 万条生物活性数据以及小分子结构信息进行训练学习，目前支持对 920 个蛋白质靶点相关的 2224 个生物测试实验进行活性预测和分子筛选。
          </p>
          <button
            onClick={() => router.push('/protein-structure')}
            className="bg-primary text-white px-6 py-2 rounded hover:bg-[#25b5ab] transition-colors flex items-center gap-2"
            type="button"
          >
            立即体验
            <span className="text-lg">→</span>
          </button>
        </div>
      </div>
    </div>
  );
} 