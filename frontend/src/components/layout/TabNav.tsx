import { NavLink } from "react-router-dom";

export default function TabNav() {
  return (
    <nav className="tab-nav">
      <NavLink to="/contagem" className={({ isActive }) => (isActive ? "tab active" : "tab")}>Contagem</NavLink>
      <NavLink to="/inventarios" className={({ isActive }) => (isActive ? "tab active" : "tab")}>Inventários</NavLink>
      <NavLink to="/historico" className={({ isActive }) => (isActive ? "tab active" : "tab")}>Histórico</NavLink>
    </nav>
  );
}
