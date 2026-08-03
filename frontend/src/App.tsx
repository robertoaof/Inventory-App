import { useState } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Header from "./components/layout/Header";
import TabNav from "./components/layout/TabNav";
import ContagemPage from "./pages/ContagemPage";
import InventariosPage from "./pages/InventariosPage";
import HistoricoPage from "./pages/HistoricoPage";

function App() {
  const [data, setData] = useState(new Date().toISOString().slice(0, 10));

  return (
    <BrowserRouter>
      <div className="app-shell">
        <Header />
        <TabNav />
        <main className="app-main">
          <Routes>
            <Route path="/" element={<Navigate to="/contagem" replace />} />
            <Route path="/contagem" element={<ContagemPage data={data} onDataChange={setData} />} />
            <Route path="/inventarios" element={<InventariosPage data={data} onDataChange={setData} />} />
            <Route path="/historico" element={<HistoricoPage data={data} onDataChange={setData} />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}

export default App;
