import { BrowserRouter, Routes, Route } from "react-router-dom";

import Dashboard from "./Dashboard";
import Login from "./login";

function App() {
  return (
    <BrowserRouter>
      <Routes>

        {/* First page shown when website opens */}
        <Route path="/" element={<Dashboard />} />

        {/* Login page */}
        <Route path="/login" element={<Login />} />

      </Routes>
    </BrowserRouter>
  );
}

export default App;