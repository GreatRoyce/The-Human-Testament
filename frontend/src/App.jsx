import "./App.css";
import Navbar from "./components/layout/Navbar.jsx";
import { BrowserRouter as Router } from "react-router-dom";
import AppRoutes from "./routes/AppRoutes.jsx";
import AnalyticsTracking from './components/analytics/AnalyticsTracking.jsx';


function App() {
  return (
   <Router>
   <Navbar />
   <AppRoutes />
   <AnalyticsTracking />
   </Router>
  );
}

export default App;
