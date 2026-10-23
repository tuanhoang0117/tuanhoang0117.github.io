import { Navigate, Route, Routes } from "react-router";
import { Layout } from "./components/shell/Layout";
import { Contact } from "./pages/Contact";
import { Home } from "./pages/Home";
import { NotFound } from "./pages/NotFound";
import { Portfolio } from "./pages/Portfolio";
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
        <Route path="resume" element={<Resume />} />
        <Route path="contact" element={<Contact />} />
        {Object.entries(legacyRedirects).map(([from, to]) => (
          <Route key={from} path={from} element={<Navigate to={to} replace />} />
        ))}
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
