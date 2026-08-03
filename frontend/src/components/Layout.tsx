import React from 'react';
import Sidebar from './Sidebar';
import Navbar from './Navbar';

export const Layout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return (
    <div 
      className="flex min-h-screen bg-cover bg-center bg-fixed text-zinc-100 relative"
      style={{ backgroundImage: "url('/login_bg.png')" }}
    >
      {/* Dark overlay to ensure text contrast */}
      <div className="absolute inset-0 bg-[#0B0D10]/85 pointer-events-none z-0"></div>

      {/* Sidebar */}
      <div className="relative z-10 flex flex-row w-full min-h-screen">
        <Sidebar />

        {/* Main Content Area */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Top Navbar */}
          <Navbar />

          {/* Dynamic Page content */}
          <main className="flex-1 p-8 overflow-y-auto relative">
            {children}
          </main>
        </div>
      </div>
    </div>
  );
};

export default Layout;
