import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "./contexts/AuthContext";
import Layout from "./components/Layout";
import Home from "./pages/Home";
import Auth from "./pages/Auth";
import Ships from "./pages/Ships";
import ShipDetail from "./pages/ShipDetail";
import Gallery from "./pages/Gallery";
import CreateGalleryPost from "./pages/CreateGalleryPost";
import Logs from "./pages/Logs";
import CreateLog from "./pages/CreateLog";
import Pilots from "./pages/Pilots";
import PilotProfile from "./pages/PilotProfile";
import Profile from "./pages/Profile";
import Admin from "./pages/Admin";
import NewsDetail from "./pages/NewsDetail";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter basename="/nebula-shipyard">
        <AuthProvider>
          <Layout>
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/auth" element={<Auth />} />
              <Route path="/ships" element={<Ships />} />
              <Route path="/ships/:slug" element={<ShipDetail />} />
              <Route path="/gallery" element={<Gallery />} />
              <Route path="/gallery/create" element={<CreateGalleryPost />} />
              <Route path="/logs" element={<Logs />} />
              <Route path="/logs/create" element={<CreateLog />} />
              <Route path="/pilots" element={<Pilots />} />
              <Route path="/pilots/:handle" element={<PilotProfile />} />
              <Route path="/profile" element={<Profile />} />
              <Route path="/admin" element={<Admin />} />
              <Route path="/news/:id" element={<NewsDetail />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Layout>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
