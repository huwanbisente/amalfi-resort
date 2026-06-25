import React from 'react';

const Hero = () => {
  return (
    <div className="relative flex h-[80vh] flex-col items-center justify-center bg-[url('/api/v1/assets/hero/hero-bg.png')] bg-cover bg-center text-center text-white">
      <div className="absolute inset-0 bg-black/20"></div>

      <div className="relative z-[1]">
        <h1 className="mb-4 text-[4rem] text-white">Sunny Beach Resort</h1>
        <p className="mb-8 text-2xl font-light">Experience Tropical Minimalism at its finest.</p>

        <div className="flex items-center gap-5 bg-white/15 px-10 py-5 backdrop-blur-[15px]">
          <div>
            <label className="block text-[0.8rem] opacity-80">CHECK-IN</label>
            <input type="date" className="border-0 bg-transparent text-white" />
          </div>
          <div className="h-[30px] w-px bg-white/30"></div>
          <div>
            <label className="block text-[0.8rem] opacity-80">GUESTS</label>
            <select className="border-0 bg-transparent text-white">
              <option>2 Adults</option>
              <option>4 Adults</option>
            </select>
          </div>
          <button className="rounded-full bg-coastal-primary px-6 py-3 text-[0.7rem] font-black uppercase tracking-[0.14em] text-white">Check Availability</button>
        </div>
      </div>
    </div>
  );
};

export default Hero;
