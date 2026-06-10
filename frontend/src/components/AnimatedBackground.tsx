const AnimatedBackground = () => {
  return (
    <svg
      className="fixed inset-0 w-full h-full pointer-events-none"
      viewBox="0 0 1200 800"
      preserveAspectRatio="xMidYMid slice"
    >
      <style>{`
        @media (prefers-reduced-motion: no-preference){
          .sv-fa{animation:sv-float 7s ease-in-out infinite}
          .sv-fb{animation:sv-float 9s ease-in-out infinite;animation-delay:-2s}
          .sv-fc{animation:sv-float 8s ease-in-out infinite;animation-delay:-4s}
          .sv-tw{animation:sv-tw 4s ease-in-out infinite}
          .sv-wave-left{animation:sv-wave-left 4s ease-in-out infinite}
          .sv-wave-right{animation:sv-wave-right 4s ease-in-out infinite}
        }
        @keyframes sv-float {
          0% { transform: translateY(0px) }
          50% { transform: translateY(-13px) }
          100% { transform: translateY(0px) }
        }
        @keyframes sv-tw {
          0% { opacity: .2 }
          50% { opacity: .9 }
          100% { opacity: .2 }
        }
  
        /* เอฟเฟกต์การกระเด้งอย่างนุ่มนวล (Soft Bounce) สำหรับไอคอน */
        @keyframes soft-bounce {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-8px); }
        }
        .soft-bounce { animation: soft-bounce 2s ease-in-out infinite; }
  
        /* เอฟเฟกต์แอนิเมชันของเกลียวคลื่นแบบเคลื่อนไหวขึ้นลง */
        @keyframes sv-wave-stage {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-100px); }
        }
        
        /* กำหนดความเร็วและความหน่วง (Delay) ในแต่ละชั้นของคลื่นให้มีความแตกต่างกัน */
        .wave-layer { animation: sv-wave-stage infinite ease-in-out; }
        .wave-layer:nth-child(1) { animation-duration: 5.0s; animation-delay: 0.0s; }
        .wave-layer:nth-child(2) { animation-duration: 7.5s; animation-delay: -2.0s; }
        .wave-layer:nth-child(3) { animation-duration: 6.0s; animation-delay: -4.5s; }
        .wave-layer:nth-child(4) { animation-duration: 8.5s; animation-delay: -1.5s; }
        .wave-layer:nth-child(5) { animation-duration: 5.5s; animation-delay: -3.0s; }
      `}</style>

      <defs>
        <image id="bgImage" href="/images/svgBackground.svg" width="1200" height="800" />
      </defs>

      {/* ชั้นที่ 1: สีพื้นหลังหลัก (Background Layer) */}
      <rect width="1200" height="800" fill="#FEFEFE" />

      {/* ชั้นที่ 2: เกลียวคลื่น (อยู่ด้านหลังภาพประกอบหลัก) */}
      <g className="sv-waves-vertical-left">
        {/* คลื่นชั้นที่ 1 (ด้านหลังสุด) */}
        <path className="wave-layer" d="M -50,-100 L 140,-100 Q 180,-25 140,50 T 140,200 T 140,350 T 140,500 T 140,650 T 140,800 T 140,950 T 140,1100 T 140,1250 T 140,1400 L -50,1400 Z" fill="#bae6fd" opacity="0.8" />
        {/* คลื่นชั้นที่ 2 */}
        <path className="wave-layer" d="M -50,-100 L 110,-100 Q 150,-25 110,50 T 110,200 T 110,350 T 110,500 T 110,650 T 110,800 T 110,950 T 110,1100 T 110,1250 T 110,1400 L -50,1400 Z" fill="#7dd3fc" opacity="0.85" />
        {/* คลื่นชั้นที่ 3 */}
        <path className="wave-layer" d="M -50,-100 L 80,-100 Q 120,-25 80,50 T 80,200 T 80,350 T 80,500 T 80,650 T 80,800 T 80,950 T 80,1100 T 80,1250 T 80,1400 L -50,1400 Z" fill="#38bdf8" opacity="0.9" />
        {/* คลื่นชั้นที่ 4 */}
        <path className="wave-layer" d="M -50,-100 L 50,-100 Q 90,-25 50,50 T 50,200 T 50,350 T 50,500 T 50,650 T 50,800 T 50,950 T 50,1100 T 50,1250 T 50,1400 L -50,1400 Z" fill="#0284c7" opacity="0.95" />
        {/* คลื่นชั้นที่ 5 (ด้านหน้าสุด) */}
        <path className="wave-layer" d="M -50,-100 L 20,-100 Q 60,-25 20,50 T 20,200 T 20,350 T 20,500 T 20,650 T 20,800 T 20,950 T 20,1100 T 20,1250 T 20,1400 L -50,1400 Z" fill="#1e40af" />
      </g>

      <g className="sv-waves-vertical-right">
        {/* คลื่นฝั่งขวา: ชั้นที่ 1 (ด้านหลังสุด) */}
        <path className="wave-layer" d="M 1250,-100 L 1060,-100 Q 1020,-25 1060,50 T 1060,200 T 1060,350 T 1060,500 T 1060,650 T 1060,800 T 1060,950 T 1060,1100 T 1060,1250 T 1060,1400 L 1250,1400 Z" fill="#bae6fd" opacity="0.8" />
        {/* คลื่นฝั่งขวา: ชั้นที่ 2 */}
        <path className="wave-layer" d="M 1250,-100 L 1090,-100 Q 1050,-25 1090,50 T 1090,200 T 1090,350 T 1090,500 T 1090,650 T 1090,800 T 1090,950 T 1090,1100 T 1090,1250 T 1090,1400 L 1250,1400 Z" fill="#7dd3fc" opacity="0.85" />
        {/* คลื่นฝั่งขวา: ชั้นที่ 3 */}
        <path className="wave-layer" d="M 1250,-100 L 1120,-100 Q 1080,-25 1120,50 T 1120,200 T 1120,350 T 1120,500 T 1120,650 T 1120,800 T 1120,950 T 1120,1100 T 1120,1250 T 1120,1400 L 1250,1400 Z" fill="#38bdf8" opacity="0.9" />
        {/* คลื่นฝั่งขวา: ชั้นที่ 4 */}
        <path className="wave-layer" d="M 1250,-100 L 1150,-100 Q 1110,-25 1150,50 T 1150,200 T 1150,350 T 1150,500 T 1150,650 T 1150,800 T 1150,950 T 1150,1100 T 1150,1250 T 1150,1400 L 1250,1400 Z" fill="#0284c7" opacity="0.95" />
        {/* คลื่นฝั่งขวา: ชั้นที่ 5 (ด้านหน้าสุด) */}
        <path className="wave-layer" d="M 1250,-100 L 1180,-100 Q 1140,-25 1180,50 T 1180,200 T 1180,350 T 1180,500 T 1180,650 T 1180,800 T 1180,950 T 1180,1100 T 1180,1250 T 1180,1400 L 1250,1400 Z" fill="#1e40af" />
      </g>
      {/* ชั้นที่ 3: ภาพประกอบตัวละครและฉากหลัก */}
      <use href="#bgImage" x="0" y="0" width="1200" height="800" />

      {/* ชั้นที่ 4: ส่วนตกแต่งเพิ่มเติม (Data Nodes และ แสงระยิบระยับ) ทับด้านบนสุด */}
      <g className="sv-fa">
        <g transform="translate(290, 180) rotate(-15)">
          {/* รูปทรงข้าวหลามตัด (ซ้ายบน) */}
          <path d="M 0 -20 L 20 0 L 0 20 L -20 0 Z" fill="#38bdf8" opacity="0.85" />
          <path d="M 0 -10 L 10 0 L 0 10 L -10 0 Z" fill="#ffffff" opacity="0.65" />
        </g>
      </g>

      <g className="sv-fb" style={{ animationDelay: "-1s" }}>
        <g transform="translate(920, 150) rotate(14)">
          {/* รูปทรงวงแหวน (ขวาบน) */}
          <circle cx="0" cy="0" r="18" fill="none" stroke="#a78bfa" strokeWidth="6" opacity="0.85" />
          <circle cx="0" cy="0" r="8" fill="#c4b5fd" opacity="0.95" />
        </g>
      </g>

      <g className="sv-fc" style={{ animationDelay: "-2s" }}>
        <g transform="translate(400, 620) rotate(-6)">
          {/* รูปทรงหกเหลี่ยม (ซ้ายล่าง) */}
          <path d="M 0 -15 L 13 -7.5 L 13 7.5 L 0 15 L -13 7.5 L -13 -7.5 Z" fill="#34d3cb" opacity="0.85" />
          <circle cx="0" cy="0" r="4" fill="#ffffff" />
        </g>
      </g>

      <g className="sv-fa" style={{ animationDelay: "-3s" }}>
        <g transform="translate(830, 600) rotate(20)">
          {/* รูปทรงสามเหลี่ยม (ขวาล่าง) */}
          <path d="M 0 -18 L 16 10 L -16 10 Z" fill="#fbbf24" opacity="0.85" />
          <path d="M 0 -6 L 6 5 L -6 5 Z" fill="#ffffff" opacity="0.75" />
        </g>
      </g>

      <g className="sv-fb" style={{ animationDelay: "-4s" }}>
        <g transform="translate(170, 380) rotate(45)">
          {/* รูปทรงกากบาท (ซ้ายตรงกลาง) */}
          <path d="M -5 -15 L 5 -15 L 5 -5 L 15 -5 L 15 5 L 5 5 L 5 15 L -5 15 L -5 5 L -15 5 L -15 -5 L -5 -5 Z" fill="#2b2eca" opacity="0.85" />
          <rect x="-2" y="-2" width="4" height="4" fill="#ffffff" />
        </g>
      </g>

      <g className="sv-fc" style={{ animationDelay: "-5s" }}>
        <g transform="translate(1020, 420) rotate(-15)">
          {/* รูปทรงชิป (ขวาตรงกลาง) */}
          <rect x="-14" y="-14" width="28" height="28" rx="4" fill="#60a5fa" opacity="0.85" />
          <rect x="-6" y="-6" width="12" height="12" rx="2" fill="#ffffff" opacity="0.65" />
        </g>
      </g>

      {/* จุดแสงระยิบระยับแบบสุ่มตำแหน่งเพื่อความสวยงาม */}
      <circle className="sv-tw" cx="420" cy="220" r="5" fill="#ffd873" />
      <circle className="sv-tw" cx="780" cy="200" r="5" fill="#ffd873" />
      <circle className="sv-tw" cx="260" cy="480" r="4" fill="#ffffff" opacity="0.8" />
      <circle className="sv-tw" cx="960" cy="500" r="5" fill="#ffffff" opacity="0.8" />
      <circle className="sv-tw" cx="180" cy="250" r="4" fill="#38bdf8" opacity="0.7" />
      <circle className="sv-tw" cx="800" cy="320" r="6" fill="#a78bfa" opacity="0.6" />

    </svg>
  );
};

export default AnimatedBackground;
