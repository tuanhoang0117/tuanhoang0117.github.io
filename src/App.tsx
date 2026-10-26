import { Navigate, Route, Routes } from "react-router";
import { Layout } from "./components/shell/Layout";
import { Contact } from "./pages/Contact";
import { Home } from "./pages/Home";
import { Lab } from "./pages/Lab";
import { BannerLab } from "./pages/lab/BannerLab";
import { MascotLab } from "./pages/lab/MascotLab";
import { MotionLab } from "./pages/lab/MotionLab";
import { PhysicsLab } from "./pages/lab/PhysicsLab";
import { TitleLab } from "./pages/lab/TitleLab";
import { NotFound } from "./pages/NotFound";
import { Portfolio } from "./pages/Portfolio";
import { ProjectDetail } from "./pages/ProjectDetail";
import { Resume } from "./pages/Resume";

/** v1 URLs that may be linked from elsewhere (resume PDFs, LinkedIn). */
const legacyRedirects: Record<string, string> = {
  "/index.html": "/",
  "/portfolio.html": "/portfolio",
  "/resume.html": "/resume",
  "/contact.html": "/contact",
  "/blog.html": "/",
};

export function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="portfolio" element={<Portfolio />} />
        <Route path="portfolio/:slug" element={<ProjectDetail />} />
        <Route path="resume" element={<Resume />} />
        <Route path="contact" element={<Contact />} />
        <Route path="lab" element={<Lab />} />
        <Route path="lab/motion" element={<MotionLab />} />
        <Route path="lab/banner" element={<BannerLab />} />
        <Route path="lab/title" element={<TitleLab />} />
        <Route path="lab/mascot" element={<MascotLab />} />
        <Route path="lab/physics" element={<PhysicsLab />} />
        {Object.entries(legacyRedirects).map(([from, to]) => (
          <Route key={from} path={from} element={<Navigate to={to} replace />} />
        ))}
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
