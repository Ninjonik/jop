import Bounds from '@/app/(pages)/test/bounds/page';
import Admin from '@/app/admin/[sessionId]/page';
import AuthComplete from '@/app/dis/auth-complete/page';
import Login from '@/app/dis/login/page';
import Dis from '@/app/dis/page';
import Download from '@/app/download/page';
import Editor from '@/app/editor/page';
import '@/app/globals.css';
import Linker from '@/app/linker/page';
import Map from '@/app/map/page';
import Mock from '@/app/mock/page';
import Home from '@/app/page';
import Privacy from '@/app/privacy-policy/page';
import Runtime from '@/app/runtime/[sessionId]/[stationId]/page';
import Terms from '@/app/tos/page';
import { I18nProvider } from '@/lib/i18n/client';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import DesktopBridge from './DesktopBridge';
import DesktopUpdates from './DesktopUpdates';

createRoot(document.getElementById('root')!).render(
  <BrowserRouter>
    <I18nProvider>
      <DesktopBridge />
      <DesktopUpdates />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/download" element={<Download />} />
        <Route path="/dis" element={<Dis />} />
        <Route path="/dis/login" element={<Login />} />
        <Route path="/dis/auth-complete" element={<AuthComplete />} />
        <Route path="/editor" element={<Editor />} />
        <Route path="/map" element={<Map />} />
        <Route path="/linker" element={<Linker />} />
        <Route path="/mock" element={<Mock />} />
        <Route path="/runtime/:sessionId/:stationId" element={<Runtime />} />
        <Route path="/admin/:sessionId" element={<Admin />} />
        <Route path="/privacy-policy" element={<Privacy />} />
        <Route path="/tos" element={<Terms />} />
        <Route path="/test/bounds" element={<Bounds />} />
      </Routes>
    </I18nProvider>
  </BrowserRouter>,
);
