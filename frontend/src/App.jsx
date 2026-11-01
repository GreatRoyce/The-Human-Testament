import "./App.css";
import Navbar from "./components/layout/Navbar.jsx";
import { BrowserRouter as Router } from "react-router-dom";
import AppRoutes from "./routes/AppRoutes.jsx";
import AnalyticsTracking from './components/analytics/AnalyticsTracking.jsx';
import AuthenticatedNavbar from './components/layout/AuthenticatedNavbar.jsx';
import ReaderNavbar from './components/layout/ReaderNavbar.jsx';
import { useAuth } from './hooks/useAuth.js';
import { useLocation } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';

function AppContent() {
  const { user } = useAuth();
  const { pathname } = useLocation();
  const readingInterface = /^\/testament\/[^/]+\/[1-9]\d*(?:\/[1-9]\d*)?$/.test(pathname);
  return <>
    {readingInterface ? <ReaderNavbar /> : user ? <AuthenticatedNavbar /> : <Navbar />}
    <AppRoutes />
    <AnalyticsTracking />
    <Toaster position="top-center" />
  </>;
}

function App() {
  return (
   <Router>
   <AppContent />
   </Router>
  );
}

export default App;
