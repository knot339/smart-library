"use client";
import { useEffect, useState, ReactNode } from "react";

export default function ScaleWrapper({ children }: { children: ReactNode }) {
  const [scale, setScale] = useState(1);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const handleResize = () => {
      const scaleX = window.innerWidth / 2000;
      const scaleY = window.innerHeight / 1200;
      setScale(Math.min(scaleX, scaleY));
    };

    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  if (!mounted) {
    return <div className="w-screen h-screen bg-black" />; // Prevent hydration mismatch
  }

  return (
    <div className="flex items-center justify-center w-screen h-screen bg-black overflow-hidden select-none">
      <div
        style={{
          width: 2000,
          height: 1200,
          transform: `scale(${scale})`,
          transformOrigin: "center center",
          position: "relative",
        }}
        className="bg-gradient-to-b from-blue-950 to-blue-900 flex flex-col"
      >
        {children}
      </div>
    </div>
  );
}
