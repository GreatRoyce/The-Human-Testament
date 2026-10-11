import "./App.css";
import Navbar from "./components/layout/Navbar.jsx";
import { BrowserRouter as Router } from "react-router-dom";
import AppRoutes from "./routes/AppRoutes.jsx";


function App() {
  return (
   <Router>
   <Navbar />
   <AppRoutes />
   </Router>
  );
}

export default App;
