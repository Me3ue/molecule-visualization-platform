"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { icons } from "@/public/icons";

const navItems = [
  { id: 1, title: "结构与基础视图", icon: icons.target },
  { id: 2, title: "配色与空间定位", icon: icons.molecule },
  { id: 3, title: "分子选择与分离", icon: icons.microscope },
  { id: 4, title: "分子测量", icon: icons.flask },
  { id: 5, title: "分子动力学轨迹", icon: icons.molecule },
  { id: 6, title: "轨迹分析总览", icon: icons.microscope },
  { id: 7, title: "距离变化可视化", icon: icons.route },
  { id: 8, title: "VMD命令行", icon: icons.flask },
];

export default function FeatureSideNav({ activeId }: { activeId: number }) {
  const router = useRouter();

  return (
    <aside className="w-72 border-r border-white/10 bg-black/30 p-4 backdrop-blur-xl">
      <button
        type="button"
        className="mb-6 flex w-full items-center gap-3 rounded-2xl border border-white/15 bg-white/5 p-3 text-left"
        onClick={() => router.push("/")}
      >
        <Image src={icons.logo} alt="Logo" width={36} height={36} className="rounded-full" />
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-cyan-200/80">Feature Lab</p>
          <p className="text-sm font-semibold text-white">Molecule Workspace</p>
        </div>
      </button>

      <nav className="space-y-2">
        {navItems.map((item) => {
          const active = item.id === activeId;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => router.push(`/feature/${item.id}`)}
              className={`flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm transition ${
                active
                  ? "bg-gradient-to-r from-fuchsia-500/60 to-cyan-500/60 text-white"
                  : "text-slate-200 hover:bg-white/10"
              }`}
            >
              <Image
                src={item.icon}
                alt={item.title}
                width={18}
                height={18}
                className={active ? "brightness-0 invert" : "opacity-90"}
              />
              <span>{item.title}</span>
            </button>
          );
        })}
      </nav>
    </aside>
  );
}
